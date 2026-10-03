(function () {
  "use strict";
  const localStorage = window.ScaStorage || window.localStorage;

  const PROTOCOL_VERSION = "sca-v1";
  const RECONNECT_GRACE_MS = 15_000;
  const CONNECT_TIMEOUT_MS = 6500;
  const MAX_ENDPOINTS = 3;
  const INPUT_INTERVAL_MS = 1000 / 60;
  const HUD_INTERVAL_MS = 160;
  const FOOD_COLORS = ["#44d7b6", "#67e8f9", "#ffd166", "#ff7a90", "#a78bfa", "#f59e0b", "#7dd3fc", "#f472b6"];
  const fallbackModes = [
    ["solo", "自由模式", "限时成长并反复复活，按个人总质量排名。", 100],
    ["team", "团队战", "10 队 4 人协作，按队伍总质量结算。", 40],
    ["survival", "生存模式", "每人三条生命，生命耗尽出局。", 64],
    ["battle", "大逃杀", "安全区持续收缩，无复活，活到最后。", 100],
    ["blitz", "闪电乱斗", "三分钟高资源快节奏乱斗。", 88],
    ["spore", "孢子风暴", "撞击孢子刺球会喷出可争夺质量。", 48],
    ["screen", "霸屏模式", "方形战场，支持快合与冲刺种刺。", 22],
    ["control", "据点战", "四队七人争夺三个星核据点。", 28],
    ["giant", "巨行星霸屏", "巨球开局，维持质量制霸即可获胜。", 36],
    ["demon", "魔王模式", "所有真人合作击败魔王与魔兵。", 10]
  ].map(([key, label, description, targetParticipants]) => ({ key, label, short: label, description, targetParticipants }));

  const cosmeticCatalog = window.ScaCosmeticCatalog;
  if (!cosmeticCatalog) throw new Error("Shared cosmetic catalog failed to load");
  const cosmeticRenderer = window.ScaCosmeticRenderer;
  if (!cosmeticRenderer) throw new Error("Shared cosmetic renderer failed to load");
  const pageTransition = window.ScaPageTransition;
  if (!pageTransition) throw new Error("Shared page transition failed to load");
  const gameplayCore = window.ScaGameplayCore;
  if (!gameplayCore) throw new Error("Shared gameplay core failed to load");
  const settingsApi = window.ScaGameSettings;
  if (!settingsApi) throw new Error("Shared game settings failed to load");
  const gameSettings = settingsApi.load();
  const connectionApi = window.ScaConnectionProfile;
  const connectionProfile = connectionApi.load();
  const displayRefresh = settingsApi.displayRefresh();
  const targetRenderFps = settingsApi.targetFps(gameSettings, displayRefresh);
  const targetRenderInterval = 1000 / targetRenderFps;
  const qualityPreset = settingsApi.qualityPreset(gameSettings);
  const networkPreset = settingsApi.networkPreset(gameSettings);

  const elements = {
    topbar: document.getElementById("topbar"),
    lobbyView: document.getElementById("lobbyView"),
    roomView: document.getElementById("roomView"),
    gameView: document.getElementById("gameView"),
    connectionPill: document.getElementById("connectionPill"),
    connectionText: document.getElementById("connectionText"),
    nickname: document.getElementById("nicknameInput"),
    modeSelect: document.getElementById("modeSelect"),
    modeDescription: document.getElementById("modeDescription"),
    maxPlayers: document.getElementById("maxPlayersSelect"),
    autoFillPreview: document.getElementById("autoFillPreview"),
    createRoom: document.getElementById("createRoomBtn"),
    refreshRooms: document.getElementById("refreshRoomsBtn"),
    roomCodeInput: document.getElementById("roomCodeInput"),
    joinCode: document.getElementById("joinCodeBtn"),
    discoveryStatus: document.getElementById("discoveryStatus"),
    networkWarning: document.getElementById("networkWarning"),
    networkWarningTitle: document.getElementById("networkWarningTitle"),
    networkWarningText: document.getElementById("networkWarningText"),
    openFirewallSettings: document.getElementById("openFirewallSettingsBtn"),
    roomList: document.getElementById("roomList"),
    roomName: document.getElementById("roomName"),
    roomCode: document.getElementById("roomCode"),
    copyRoomCode: document.getElementById("copyRoomCodeBtn"),
    roomMode: document.getElementById("roomMode"),
    roomSettingsPanel: document.getElementById("roomSettingsPanel"),
    roomModeSelect: document.getElementById("roomModeSelect"),
    roomAutoFill: document.getElementById("roomAutoFill"),
    roomModeDescription: document.getElementById("roomModeDescription"),
    roomCapacity: document.getElementById("roomCapacity"),
    roomBots: document.getElementById("roomBots"),
    playerList: document.getElementById("playerList"),
    leaveRoom: document.getElementById("leaveRoomBtn"),
    ready: document.getElementById("readyBtn"),
    startMatch: document.getElementById("startMatchBtn"),
    roomHint: document.getElementById("roomHint"),
    canvas: document.getElementById("multiplayerCanvas"),
    miniCanvas: document.getElementById("multiplayerMiniCanvas"),
    mass: document.getElementById("gameMass"),
    rank: document.getElementById("gameRank"),
    kills: document.getElementById("gameKills"),
    latency: document.getElementById("gameLatency"),
    gameModeName: document.getElementById("gameModeName"),
    gameObjective: document.getElementById("gameObjective"),
    gameNetworkDetail: document.getElementById("gameNetworkDetail"),
    gameTip: document.getElementById("gameTip"),
    timer: document.getElementById("gameTimer"),
    ranking: document.getElementById("gameRanking"),
    gameRoomCode: document.getElementById("gameRoomCode"),
    networkState: document.getElementById("gameNetworkState"),
    exitMatch: document.getElementById("exitMatchBtn"),
    touchSplit: document.getElementById("touchSplitBtn"),
    touchEject: document.getElementById("touchEjectBtn"),
    touchQuickMerge: document.getElementById("touchQuickMergeBtn"),
    touchSpecial: document.getElementById("touchSpecialBtn"),
    reconnectOverlay: document.getElementById("reconnectOverlay"),
    reconnectText: document.getElementById("reconnectText"),
    sessionMenu: document.getElementById("sessionMenu"),
    sessionMenuTitle: document.getElementById("sessionMenuTitle"),
    sessionMenuText: document.getElementById("sessionMenuText"),
    sessionContinue: document.getElementById("sessionContinueBtn"),
    sessionLeave: document.getElementById("sessionLeaveBtn"),
    sessionHome: document.getElementById("sessionHomeBtn"),
    toast: document.getElementById("toast")
  };

  const context = elements.canvas.getContext("2d", { alpha: false, desynchronized: true });
  const miniContext = elements.miniCanvas?.getContext("2d", { alpha: false }) || null;
  const snapshotBuffer = new window.ScaSnapshotBuffer.SnapshotBuffer({
    capacity: 32,
    minimumDelayMs: networkPreset.minimumDelayMs,
    maximumDelayMs: networkPreset.maximumDelayMs,
    maximumExtrapolationMs: networkPreset.maximumExtrapolationMs
  });
  const state = {
    connectionMode: connectionProfile.mode,
    serviceOrigin: connectionProfile.mode === "internet" ? connectionProfile.origin : "",
    view: "lobby",
    rooms: [],
    roomListSignature: "",
    discovery: null,
    diagnostics: null,
    servicePort: 0,
    preferredPort: 0,
    bindHost: "",
    modes: fallbackModes,
    refreshing: false,
    joining: false,
    socket: null,
    endpoint: "",
    endpoints: [],
    roomCode: "",
    matchId: "",
    baselineId: "",
    hostToken: "",
    resumeToken: "",
    playerId: "",
    isHost: false,
    room: null,
    ready: false,
    manualClose: false,
    reconnectStartedAt: 0,
    reconnectTimer: null,
    connectionAttempt: 0,
    connectionGeneration: 0,
    latestSnapshot: null,
    confirmedRemovedFoodIds: new Set(),
    confirmedRemovedEjectedIds: new Set(),
    snapshotBuffer,
    latency: 0,
    inputSeq: 0,
    inputSuspended: false,
    input: {
      dx: 0,
      dy: 0,
      targetX: 2600,
      targetY: 2600,
      split: false,
      eject: false,
      quickMerge: false,
      special: false
    },
    inputHistory: [],
    lastAckInputSeq: 0,
    lastBaselineRequestAt: 0,
    matchFinishedHandled: false,
    inputTimer: null,
    pingTimer: null,
    camera: { x: 2600, y: 2600, zoom: 0.8 },
    spectatorId: "",
    pointer: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    toastTimer: null,
    roomRefreshTimer: null,
    renderFrame: 0,
    nextRenderAt: 0,
    lastRenderAt: 0,
    lastHudAt: 0,
    personalPeakMass: 0,
    lastMinimapAt: 0,
    smoothedFps: 60
  };
  const foodRenderBatches = new Map();
  const cellRenderBuffer = [];
  let backgroundGradient = null;

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  function trimIdSet(values, maximum) {
    while (values.size > maximum) values.delete(values.values().next().value);
  }

  function setConnection(stateName, text) {
    elements.connectionPill.dataset.state = stateName;
    elements.connectionText.textContent = text;
  }

  function showToast(message, error = false) {
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("error", error);
    elements.toast.classList.add("show");
    state.toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 3200);
  }

  function setView(view) {
    state.view = view;
    if (view === "game") {
      state.inputSuspended = false;
      state.spectatorId = "";
      document.getElementById("matchResult").hidden = true;
      window.ScaAudio?.reset();
      window.ScaAudio?.setMusic(localStorage.getItem("ballArenaMusic") === "on");
    }
    if (view === "lobby") document.getElementById("matchResult").hidden = true;
    if (elements.sessionMenu) elements.sessionMenu.hidden = true;
    elements.lobbyView.hidden = view !== "lobby";
    elements.roomView.hidden = view !== "room";
    elements.gameView.hidden = view !== "game";
    elements.topbar.hidden = view === "game";
    if (view === "game") resizeCanvas();
  }

  function mainMenuUrl() {
    const url = new URL("./", location.href);
    const params = new URLSearchParams(location.search);
    if (params.has("desktop")) url.searchParams.set("desktop", params.get("desktop"));
    if (params.has("refresh")) url.searchParams.set("refresh", params.get("refresh"));
    return url.href;
  }

  function goToMainMenu() {
    pageTransition.navigate(mainMenuUrl());
  }

  function closeSessionMenu() {
    if (elements.sessionMenu) elements.sessionMenu.hidden = true;
    state.inputSuspended = false;
    elements.canvas?.focus?.({ preventScroll: true });
  }

  function openSessionMenu() {
    state.inputSuspended = true;
    state.input.eject = false;
    state.input.split = false;
    state.input.quickMerge = false;
    state.input.special = false;
    if (state.view === "lobby") {
      goToMainMenu();
      return;
    }
    const inGame = state.view === "game";
    const hostWarning = state.isHost ? "你是房主，退出会关闭当前房间并让其他玩家返回大厅。" : "退出后你会离开当前房间。";
    elements.sessionMenuTitle.textContent = inGame ? "联机对局菜单" : "离开等待房间？";
    elements.sessionMenuText.textContent = inGame ? `联机对局不会暂停服务器。${hostWarning}` : hostWarning;
    elements.sessionContinue.textContent = inGame ? "继续对局" : "留在房间";
    elements.sessionLeave.textContent = state.isHost ? "关闭房间" : "离开房间";
    elements.sessionMenu.hidden = false;
    requestAnimationFrame(() => elements.sessionContinue.focus({ preventScroll: true }));
  }

  function playerName() {
    const value = elements.nickname.value.replace(/[\u0000-\u001f\u007f-\u009f]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
    return value || "星友";
  }

  async function jsonRequest(url, options) {
    if (state.connectionMode === "internet" && !state.serviceOrigin) throw new Error("请先填写互联网服务器地址，再检查连接");
    if (state.connectionMode === "internet" && connectionApi.serverOrigin(document.getElementById("internetServer").value) !== state.serviceOrigin) throw new Error("地址已修改，请先点击检查连接再创建或加入房间");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(state.serviceOrigin ? new URL(url, state.serviceOrigin).href : url, { cache: "no-store", ...options, signal: controller.signal });
      const value = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(value?.message || value?.error || `请求失败 (${response.status})`);
      return value;
    } catch (error) {
      if (controller.signal.aborted) throw new Error("服务响应超时，请检查服务器地址或稍后重试");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function modeInfo(key) {
    return state.modes.find(mode => mode.key === key) || state.modes[0] || fallbackModes[0];
  }

  function modeLabel(key) {
    return modeInfo(key).label;
  }

  function localCosmetics() {
    return cosmeticCatalog.normalizeProfile({
      skin: localStorage.getItem("ballArenaSkin"),
      spore: localStorage.getItem("ballArenaSpore"),
      halo: localStorage.getItem("ballArenaHalo"),
      trail: localStorage.getItem("ballArenaTrail")
    });
  }

  function configureModeControls(mode) {
    const screenMode = mode === "screen";
    if (elements.touchQuickMerge) elements.touchQuickMerge.hidden = !screenMode;
    if (elements.touchSpecial) elements.touchSpecial.hidden = !screenMode;
    if (elements.gameTip) {
      elements.gameTip.textContent = screenMode
        ? "移动鼠标控制方向 · 空格分裂 · 按住 W 吐球 · A 快速合体 · D 冲刺种刺"
        : "移动鼠标控制方向 · 空格分裂 · 按住 W 吐球";
    }
  }

  function populateModeSelect(select, selected = "solo") {
    if (!select) return;
    const previous = selected || select.value || "solo";
    select.replaceChildren();
    for (const mode of state.modes) {
      const option = document.createElement("option");
      option.value = mode.key;
      option.textContent = mode.label;
      select.append(option);
    }
    select.value = state.modes.some(mode => mode.key === previous) ? previous : "solo";
  }

  function updateModeDescription() {
    if (!elements.modeSelect || !elements.modeDescription) return;
    elements.modeDescription.textContent = modeInfo(elements.modeSelect.value).description;
    const target = modeInfo(elements.modeSelect.value).targetParticipants || modeInfo(elements.modeSelect.value).canonical?.participants || 8;
    if (elements.autoFillPreview) elements.autoFillPreview.textContent = `真人优先，自动补足到 ${target} 个参赛者`;
    const maximumHumans = modeInfo(elements.modeSelect.value).maximumHumans || (elements.modeSelect.value === "demon" ? 4 : 8);
    for (const option of elements.maxPlayers.options) option.disabled = Number(option.value) > maximumHumans;
    if (Number(elements.maxPlayers.value) > maximumHumans) elements.maxPlayers.value = String(maximumHumans);
    if (elements.modeSelect.value === "demon") elements.modeDescription.textContent += " 最多 4 名真人勇者，不会替换魔王席位。";
  }

  async function loadModes() {
    try {
      const value = await jsonRequest("/api/modes");
      if (Array.isArray(value.modes) && value.modes.length) state.modes = value.modes;
    } catch {
      state.modes = fallbackModes;
    }
    populateModeSelect(elements.modeSelect, elements.modeSelect?.value || "solo");
    populateModeSelect(elements.roomModeSelect, state.room?.settings?.mode || "solo");
    updateModeDescription();
  }

  function normalizeCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function normalizedEndpoints(roomOrEndpoints) {
    const values = Array.isArray(roomOrEndpoints)
      ? roomOrEndpoints
      : [...(Array.isArray(roomOrEndpoints?.endpoints) ? roomOrEndpoints.endpoints : []), roomOrEndpoints?.endpoint];
    return [...new Set(values.filter(value => typeof value === "string" && /^wss?:\/\//i.test(value)))].slice(0, MAX_ENDPOINTS);
  }

  function renderNetworkDiagnostics() {
    if (state.connectionMode === "internet") { elements.networkWarning.hidden = true; return; }
    const firewall = state.diagnostics?.firewall;
    const discoveryFailed = state.discovery && (!state.discovery.listening || state.discovery.lastError);
    const loopbackOnly = ["127.0.0.1", "::1", "localhost"].includes(String(state.bindHost).toLowerCase());
    const fallbackPort = state.preferredPort > 0 && state.servicePort > 0 && state.preferredPort !== state.servicePort;
    let status = "";
    let title = "";
    let message = "";
    if (firewall?.status === "blocked") {
      status = "blocked";
      title = "当前电脑被防火墙阻止作为房主";
      message = firewall.message;
    } else if (loopbackOnly) {
      status = "blocked";
      title = "服务只监听本机，其他电脑一定无法加入";
      message = `当前监听地址是 ${state.bindHost}:${state.servicePort}。请关闭占用端口的旧服务，并以 HOST=0.0.0.0 启动；桌面封装版会自动这样启动。`;
    } else if (discoveryFailed) {
      status = "blocked";
      title = "局域网房间发现不可用";
      message = state.discovery.lastError || "UDP 发现端口未成功启动；仍可使用本机房间，但其他电脑可能看不到它。";
    } else if (firewall?.status === "missing") {
      status = "missing";
      title = "首次建房需要确认网络权限";
      message = firewall.message;
    } else if (fallbackPort) {
      status = "missing";
      title = `首选端口 ${state.preferredPort} 已被占用`;
      message = `当前服务已自动改用 TCP ${state.servicePort}。通常是旧游戏或旧 Node 服务仍在后台；局域网发现仍会广播实际端口，但建议关闭旧进程后重启。`;
    }
    elements.networkWarning.hidden = !status;
    if (!status) return;
    elements.networkWarning.dataset.state = status;
    elements.networkWarningTitle.textContent = title;
    elements.networkWarningText.textContent = message;
    elements.openFirewallSettings.hidden = typeof window.starClusterDesktop?.openFirewallSettings !== "function";
  }

  function roomLabel(room) {
    const stateName = room.state === "lobby" ? "等待中" : room.state === "running" ? "对局中" : "已结束";
    return `${modeLabel(room.mode)} · ${room.players}/${room.maxPlayers} 真人 · ${room.botCount} AI 自动补位 · ${stateName}`;
  }

  function renderRoomList() {
    const joinable = state.rooms.filter(room => room.state === "lobby");
    const signature = JSON.stringify(joinable.map(room => ({
      code: room.code,
      name: room.name,
      state: room.state,
      players: room.players,
      maxPlayers: room.maxPlayers,
      botCount: room.botCount,
      mode: room.mode,
      source: room.source,
      endpoints: normalizedEndpoints(room)
    })));
    if (signature === state.roomListSignature) return;
    state.roomListSignature = signature;
    elements.roomList.replaceChildren();
    if (!joinable.length) {
      const empty = document.createElement("div");
      empty.className = "room-empty";
      empty.textContent = state.connectionMode === "internet" ? "还没有等待中的房间。创建一个房间，分享邀请链接给朋友。" : "暂未发现房间。让房主先创建房间，或检查双方是否连接到同一个局域网。";
      elements.roomList.append(empty);
      return;
    }
    for (const room of joinable) {
      const button = document.createElement("button");
      button.className = "room-item";
      button.type = "button";
      const copy = document.createElement("span");
      const name = document.createElement("strong");
      const details = document.createElement("small");
      const code = document.createElement("b");
      name.textContent = room.name;
      const candidates = normalizedEndpoints(room).length;
      details.textContent = `${roomLabel(room)} · ${room.source === "local" ? "本机" : `${candidates} 条连接路径`}`;
      code.textContent = room.code;
      copy.append(name, details);
      button.append(copy, code);
      button.addEventListener("click", () => joinDiscoveredRoom(room));
      elements.roomList.append(button);
    }
  }

  async function refreshRooms(showErrors = false, probe = false) {
    if (state.refreshing || state.view !== "lobby") return;
    state.refreshing = true;
    elements.refreshRooms.classList.add("busy");
    if (probe) setConnection("busy", "正在主动扫描");
    const originAtStart = state.serviceOrigin;
    const modeAtStart = state.connectionMode;
    try {
      const internet = state.connectionMode === "internet";
      const value = await jsonRequest(internet ? "/api/rooms" : probe ? "/api/lan/probe" : "/api/lan/rooms", !internet && probe ? { method: "POST" } : undefined);
      if (originAtStart !== state.serviceOrigin || modeAtStart !== state.connectionMode) return;
      if (value.protocol !== PROTOCOL_VERSION) throw new Error("服务版本不兼容，请更新游戏或服务器");
      state.rooms = Array.isArray(value.rooms) ? value.rooms : [];
      state.discovery = value.discovery || null;
      state.diagnostics = value.diagnostics || null;
      state.servicePort = Number(value.servicePort) || 0;
      state.preferredPort = Number(value.preferredPort) || 0;
      state.bindHost = String(value.bindHost || "");
      renderRoomList();
      renderNetworkDiagnostics();
      if (internet) {
        elements.discoveryStatus.textContent = `互联网服务已连接 · ${state.rooms.length} 个房间`;
        setConnection("online", "互联网服务正常");
        return;
      }
      const discovered = state.rooms.filter(room => room.source === "lan").length;
      const local = state.rooms.filter(room => room.source === "local").length;
      const warning = state.discovery?.lastError ? ` · 发现服务提示：${state.discovery.lastError}` : "";
      const addresses = state.discovery?.addresses?.length ? ` · 地址 ${state.discovery.addresses.join(" / ")}` : "";
      const ports = state.servicePort ? ` · TCP ${state.servicePort} / UDP ${state.discovery?.port || "--"}` : "";
      elements.discoveryStatus.textContent = `已扫描：${discovered} 个局域网房间，${local} 个本机房间${ports}${addresses}${warning}`;
      setConnection("online", "联机服务正常");
    } catch (error) {
      if (originAtStart !== state.serviceOrigin || modeAtStart !== state.connectionMode) return;
      elements.discoveryStatus.textContent = state.connectionMode === "internet" ? "无法连接互联网服务，请检查服务地址或网络。" : "无法连接本机联机服务，请通过启动器或桌面版打开游戏。";
      setConnection("error", "联机服务不可用");
      if (showErrors) showToast(error.message, true);
    } finally {
      state.refreshing = false;
      elements.refreshRooms.classList.remove("busy");
    }
  }

  async function createRoom() {
    if (state.diagnostics?.firewall?.status === "blocked") {
      showToast("防火墙正在阻止入站连接；房间可以创建，但其他电脑大概率无法加入。", true);
    }
    elements.createRoom.disabled = true;
    setConnection("busy", "正在创建房间");
    try {
      const name = playerName();
      localStorage.setItem("starClusterPlayerName", name);
      const value = await jsonRequest("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          roomName: `${name}的星团`,
          mode: elements.modeSelect?.value || "solo",
          maxPlayers: Number(elements.maxPlayers.value),
          private: state.connectionMode === "internet" && document.getElementById("privateRoom").checked
        })
      });
      state.hostToken = value.hostToken;
      state.diagnostics = value.diagnostics || state.diagnostics;
      renderNetworkDiagnostics();
      await connectRoom(value.endpoints || [value.endpoint], value.code, { hostToken: value.hostToken });
    } catch (error) {
      setConnection("error", "创建失败");
      showToast(error.message, true);
    } finally {
      elements.createRoom.disabled = false;
    }
  }

  async function joinDiscoveredRoom(room) {
    if (!normalizedEndpoints(room).length || room.state !== "lobby" || state.joining) return;
    localStorage.setItem("starClusterPlayerName", playerName());
    try {
      await connectRoom(room, room.code);
    } catch (error) {
      setConnection("error", "房主不可达");
      showToast(error.message, true);
    }
  }

  async function joinByCode() {
    let invitation;
    try { invitation = connectionApi.parseInvite(elements.roomCodeInput.value); }
    catch (error) { showToast(error.message || "请输入完整房间码或邀请链接", true); return; }
    if (invitation.origin) {
      state.connectionMode = "internet";
      state.serviceOrigin = invitation.origin;
      connectionApi.save({ mode: "internet", origin: invitation.origin });
      syncConnectionControls();
    }
    const code = invitation.code;
    elements.roomCodeInput.value = code;
    if (code.length !== 6) {
      showToast("请输入完整的 6 位房间码", true);
      return;
    }
    if (state.connectionMode === "internet") {
      try {
        const found = await jsonRequest(`/api/rooms/${code}`);
        if (found.protocol !== PROTOCOL_VERSION) throw new Error("服务版本不兼容，请更新游戏或服务器");
        if (found.room.state !== "lobby") throw new Error("房间已经开始，请等待下一局");
        await connectRoom([found.endpoint], code);
      } catch (error) { showToast(error.message, true); }
      return;
    }
    await refreshRooms(true, true);
    const room = state.rooms.find(item => item.code === code && item.state === "lobby");
    if (!room) {
      showToast("当前局域网没有发现这个房间，请让房主确认房间仍在等待中", true);
      return;
    }
    await joinDiscoveredRoom(room);
  }

  function sessionKey(endpoint, code) {
    return `starClusterSession:${endpoint.replace(/[?#].*$/, "")}:${code}`;
  }

  function storedResumeToken(endpoint, code) {
    try {
      return JSON.parse(sessionStorage.getItem(sessionKey(endpoint, code)) || "null")?.resumeToken || "";
    } catch {
      return "";
    }
  }

  function storeSession() {
    if (!state.endpoint || !state.roomCode || !state.resumeToken) return;
    sessionStorage.setItem(sessionKey(state.endpoint, state.roomCode), JSON.stringify({
      resumeToken: state.resumeToken,
      playerId: state.playerId
    }));
  }

  function clearStoredSessions() {
    for (const endpoint of [...state.endpoints, state.endpoint]) {
      if (endpoint && state.roomCode) sessionStorage.removeItem(sessionKey(endpoint, state.roomCode));
    }
  }

  function send(value) {
    if (state.socket?.readyState !== WebSocket.OPEN) return false;
    state.socket.send(JSON.stringify(value));
    return true;
  }

  function setJoining(joining) {
    state.joining = joining;
    elements.joinCode.disabled = joining;
    elements.refreshRooms.disabled = joining;
    elements.createRoom.disabled = joining;
  }

  function connectEndpoint(endpoint, generation, { reconnect = false, hostToken = "" } = {}) {
    return new Promise((resolve, reject) => {
      let active = true;
      let joined = false;
      const socket = new WebSocket(endpoint);
      state.socket = socket;
      const timer = setTimeout(() => fail(new Error("连接房主超时")), CONNECT_TIMEOUT_MS);

      function isCurrent() {
        return active && generation === state.connectionGeneration;
      }

      function fail(error) {
        if (!isCurrent()) return;
        active = false;
        clearTimeout(timer);
        try { socket.close(1000, "candidate-failed"); } catch {}
        reject(error);
      }

      socket.addEventListener("open", () => {
        if (!isCurrent()) return;
        const resumeToken = reconnect ? state.resumeToken : storedResumeToken(endpoint, state.roomCode);
        socket.send(JSON.stringify({
          type: "join",
          protocol: PROTOCOL_VERSION,
          name: playerName(),
          cosmetics: localCosmetics(),
          hostToken: hostToken || state.hostToken,
          resumeToken
        }));
      });
      socket.addEventListener("message", event => {
        if (!isCurrent()) return;
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!joined && message.type === "error") {
          fail(new Error(message.message || "无法加入房间"));
          return;
        }
        if (!joined && message.type === "welcome") {
          joined = true;
          clearTimeout(timer);
          state.endpoint = endpoint;
          handleServerMessage(message);
          resolve(message);
          return;
        }
        if (joined) handleServerMessage(message);
      });
      socket.addEventListener("error", () => {
        if (!joined) fail(new Error("连接路径不可达"));
      });
      socket.addEventListener("close", () => {
        if (!isCurrent()) return;
        active = false;
        clearTimeout(timer);
        if (!joined) {
          reject(new Error("房间连接已关闭"));
          return;
        }
        handleSocketClose();
      });
    });
  }

  async function connectRoom(roomOrEndpoints, code, { hostToken = "", reconnect = false } = {}) {
    const candidates = normalizedEndpoints(roomOrEndpoints);
    if (!candidates.length) throw new Error("房间没有可用的连接地址");
    const generation = ++state.connectionGeneration;
    if (!reconnect) {
      state.manualClose = false;
      state.endpoints = candidates;
      state.roomCode = normalizeCode(code);
      state.hostToken = hostToken;
      state.reconnectStartedAt = 0;
      state.connectionAttempt = 0;
    }
    setJoining(true);
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      if (generation !== state.connectionGeneration) throw new Error("连接已取消");
      state.connectionAttempt += 1;
      setConnection("busy", `正在连接${state.connectionMode === "internet" ? "服务" : "房主"} ${index + 1}/${candidates.length}`);
      try {
        const welcome = await connectEndpoint(candidates[index], generation, { reconnect, hostToken });
        if (generation === state.connectionGeneration) setJoining(false);
        return welcome;
      } catch (error) {
        lastError = error;
      }
    }
    if (generation === state.connectionGeneration) setJoining(false);
    const advice = state.connectionMode === "internet"
      ? "请检查服务地址、HTTPS 证书及服务器版本，并确认房间仍存在"
      : "请让房主检查 Windows 防火墙是否允许专用网络";
    throw new Error(`已尝试 ${candidates.length} 条连接路径仍无法加入；${advice}。${lastError ? `（${lastError.message}）` : ""}`);
  }

  function handleServerMessage(message) {
    switch (message.type) {
      case "hello":
        break;
      case "welcome":
        state.playerId = message.playerId;
        state.resumeToken = message.resumeToken;
        state.isHost = Boolean(message.host);
        state.room = message.room;
        state.ready = Boolean(message.room.players.find(player => player.id === state.playerId)?.ready);
        state.reconnectStartedAt = 0;
        elements.reconnectOverlay.hidden = true;
        storeSession();
        setConnection("online", state.isHost ? "已创建房间" : "已加入房间");
        if (message.room.state === "lobby") setView("room");
        renderWaitingRoom();
        startConnectionTimers();
        break;
      case "lobby":
        state.room = message.room;
        state.ready = Boolean(message.room.players.find(player => player.id === state.playerId)?.ready);
        if (state.view !== "game" || (state.matchFinishedHandled && message.room.state === "lobby")) {
          if (state.view === "game") {
            state.snapshotBuffer.clear();
            state.latestSnapshot = null;
            state.matchId = "";
            state.baselineId = "";
          }
          setView("room");
          renderWaitingRoom();
        }
        break;
      case "match-start":
        state.latestSnapshot = null;
        state.confirmedRemovedFoodIds.clear();
        state.confirmedRemovedEjectedIds.clear();
        state.snapshotBuffer.clear();
        state.inputHistory = [];
        state.lastAckInputSeq = 0;
        state.lastBaselineRequestAt = 0;
        state.matchFinishedHandled = false;
        state.matchId = message.matchId || "";
        state.baselineId = message.baselineId || "";
        state.lastHudAt = 0;
        state.personalPeakMass = 0;
        state.camera = { x: message.world.width / 2, y: message.world.height / 2, zoom: 0.8 };
        elements.gameRoomCode.textContent = `房间 ${state.roomCode}`;
        elements.networkState.textContent = message.resumed ? "已恢复" : "已连接";
        if (elements.gameModeName) elements.gameModeName.textContent = modeLabel(message.mode || state.room?.settings?.mode || "solo");
        configureModeControls(message.mode || state.room?.settings?.mode || "solo");
        setView("game");
        if (!message.resumed) window.ScaMatchGuide?.show(message.mode || state.room?.settings?.mode || "solo", { multiplayer: true });
        break;
      case "snapshot":
        message = globalThis.ScaSnapshotWire?.decodeSnapshot(message) || message;
        if (state.matchId && message.matchId && message.matchId !== state.matchId) break;
        if (state.baselineId && message.baselineId && message.baselineId !== state.baselineId) {
          state.snapshotBuffer.clear();
          state.baselineId = message.baselineId;
        }
        for (const id of message.foodDelta?.removed || []) state.confirmedRemovedFoodIds.add(id);
        for (const item of message.foodDelta?.added || []) state.confirmedRemovedFoodIds.delete(item.id);
        const previousEjected = state.latestSnapshot?.ejected || [];
        const currentEjectedIds = new Set((message.ejected || []).map(item => item.id));
        for (const item of previousEjected) {
          if (!currentEjectedIds.has(item.id)) state.confirmedRemovedEjectedIds.add(item.id);
        }
        for (const item of message.ejected || []) state.confirmedRemovedEjectedIds.delete(item.id);
        trimIdSet(state.confirmedRemovedFoodIds, 4096);
        trimIdSet(state.confirmedRemovedEjectedIds, 1024);
        state.latestSnapshot = message;
        state.snapshotBuffer.push(message, performance.now());
        {
          const sync = state.snapshotBuffer.getStats();
          const now = performance.now();
          if (sync.needsBaseline && now - state.lastBaselineRequestAt > 1000) {
            state.lastBaselineRequestAt = now;
            send({
              type: "resync-request",
              foodRevision: sync.foodRevision || 0,
              virusRevision: sync.virusRevision || 0
            });
          }
        }
        {
          const me = message.groups?.find(group => group.id === state.playerId);
          if (me && Number.isFinite(me.ackInputSeq)) {
            state.lastAckInputSeq = Math.max(state.lastAckInputSeq, me.ackInputSeq);
            const cutoff = performance.now() - 2000;
            state.inputHistory = state.inputHistory.filter(input => input.seq > state.lastAckInputSeq && input.sentAt >= cutoff);
          }
        }
        elements.networkState.textContent = "已连接";
        for (const event of message.events || []) handleMatchEvent(event);
        break;
      case "event":
        handleMatchEvent(message);
        break;
      case "pong":
        state.latency = Math.max(0, Math.round(performance.now() - message.clientTime));
        elements.latency.textContent = `${state.latency}ms`;
        break;
      case "error":
        showToast(message.message || "联机服务发生错误", true);
        if (state.view === "room" && state.room) renderWaitingRoom();
        if (["host-left", "host-closed", "server-shutdown", "match-finished"].includes(message.code)) returnToLobby(false);
        break;
      default:
        break;
    }
  }

  function handleMatchEvent(message) {
    const event = message.event;
    const data = message.data || {};
    if (event === "eliminated") {
      showToast(`${data.killerName || "星云"} 吞噬了 ${data.victimName || "玩家"}`);
    } else if (event === "downed") {
      showToast(`${data.victimName || "玩家"} 被击倒，剩余 ${data.lives ?? 0} 条生命`);
    } else if (event === "control-captured") {
      showToast(`${data.pointId || "星核"} 据点已被占领`);
    } else if (event === "match-event") {
      showToast(`${data.label || "星潮事件"} 开始`);
    } else if (event === "boss-ability") {
      showToast("魔王释放了引力脉冲");
    } else if (event === "match-finished") {
      if (state.matchFinishedHandled) return;
      state.matchFinishedHandled = true;
      const winner = data.winnerId ? data.ranking?.find(entry => entry.id === data.winnerId) || state.latestSnapshot?.groups?.find(group => group.id === data.winnerId) : null;
      const mode = window.ScaModeCatalog.MODES[state.room?.settings?.mode || "solo"];
      const winnerText = winner ? mode.teams ? `${winner.team === 0 && mode.demon ? "勇者阵营" : winner.team === 1 && mode.demon ? "魔王阵营" : `第 ${winner.team + 1} 队`} 获胜` : `${winner.name} 获胜` : "本局没有胜者";
      showToast(`对局结束：${winnerText}，即将返回房间`);
      showMatchResult(data, winnerText);
    }
  }

  function handleSocketClose() {
    stopConnectionTimers();
    if (state.manualClose) return;
    if (state.view === "game" && state.resumeToken) {
      beginReconnect();
      return;
    }
    if (state.view === "room") {
      showToast("与房间的连接已断开", true);
      returnToLobby(false);
    }
  }

  function beginReconnect() {
    if (!state.reconnectStartedAt) state.reconnectStartedAt = performance.now();
    elements.reconnectOverlay.hidden = false;
    const elapsed = performance.now() - state.reconnectStartedAt;
    const remaining = Math.max(0, RECONNECT_GRACE_MS - elapsed);
    elements.reconnectText.textContent = `剩余 ${Math.ceil(remaining / 1000)} 秒`;
    elements.networkState.textContent = "重连中";
    if (remaining <= 0) {
      showToast("重连超时，AI 已继续接管你的星团", true);
      returnToLobby(false);
      return;
    }
    clearTimeout(state.reconnectTimer);
    const delay = Math.min(2200, 400 + state.connectionAttempt * 350);
    state.reconnectTimer = setTimeout(() => {
      connectRoom(state.endpoints, state.roomCode, { reconnect: true }).catch(() => beginReconnect());
    }, delay);
  }

  function startConnectionTimers() {
    stopConnectionTimers();
    state.inputTimer = setInterval(sendInput, INPUT_INTERVAL_MS);
    state.pingTimer = setInterval(() => send({ type: "ping", clientTime: performance.now() }), 5000);
  }

  function stopConnectionTimers() {
    clearInterval(state.inputTimer);
    clearInterval(state.pingTimer);
    state.inputTimer = null;
    state.pingTimer = null;
  }

  function renderWaitingRoom() {
    const room = state.room;
    if (!room) return;
    elements.roomName.textContent = room.name;
    elements.roomCode.textContent = room.code;
    const selectedMode = modeInfo(room.settings.mode);
    elements.roomMode.textContent = selectedMode.label;
    if (elements.roomModeSelect) {
      if (elements.roomModeSelect.options.length !== state.modes.length) populateModeSelect(elements.roomModeSelect, room.settings.mode);
      elements.roomModeSelect.value = room.settings.mode;
      elements.roomModeSelect.disabled = !state.isHost;
    }
    if (elements.roomModeDescription) elements.roomModeDescription.textContent = selectedMode.description;
    if (elements.roomAutoFill) elements.roomAutoFill.textContent = `目标 ${room.settings.targetParticipants || selectedMode.targetParticipants || 8} 人，真人加入时自动替换 AI`;
    if (elements.roomSettingsPanel) elements.roomSettingsPanel.dataset.host = state.isHost ? "true" : "false";
    elements.roomCapacity.textContent = `${room.players.filter(player => player.connected).length} / ${room.settings.maxPlayers} 真人`;
    elements.roomBots.textContent = `${room.settings.botCount} 个 AI（自动补位）`;
    elements.playerList.replaceChildren();
    for (const player of room.players) {
      const row = document.createElement("div");
      row.className = `player-row${player.connected ? "" : " disconnected"}`;
      const avatar = document.createElement("span");
      avatar.className = "player-avatar";
      avatar.textContent = player.name.slice(0, 1).toUpperCase();
      const skin = cosmeticCatalog.definition("skin", player.cosmetics?.skin);
      if (skin) avatar.style.background = skin.color;
      const identity = document.createElement("span");
      const name = document.createElement("strong");
      const role = document.createElement("small");
      name.textContent = `${player.name}${player.id === state.playerId ? "（你）" : ""}`;
      role.textContent = player.host ? "房主" : player.connected ? "局域网玩家" : "等待重连";
      identity.append(name, role);
      const ready = document.createElement("b");
      ready.className = `ready-state${player.ready ? " ready" : ""}`;
      ready.textContent = player.ready ? "已准备" : "未准备";
      row.append(avatar, identity, ready);
      elements.playerList.append(row);
    }
    const me = room.players.find(player => player.id === state.playerId);
    state.ready = Boolean(me?.ready);
    elements.ready.textContent = state.ready ? "取消准备" : "准备";
    elements.ready.classList.toggle("primary-button", !state.ready);
    elements.ready.classList.toggle("secondary-button", state.ready);
    const connected = room.players.filter(player => player.connected);
    const canStart = connected.length >= 2 && connected.every(player => player.ready);
    elements.startMatch.hidden = !state.isHost;
    elements.startMatch.disabled = !canStart;
    elements.roomHint.textContent = connected.length < 2
      ? "等待至少两名真人加入。"
      : canStart
        ? "所有玩家已准备，房主可以开始。"
        : "等待所有玩家准备。";
  }

  async function leaveRoom() {
    const hostToken = state.hostToken;
    const code = state.roomCode;
    const wasHost = state.isHost;
    state.manualClose = true;
    state.connectionGeneration += 1;
    clearTimeout(state.reconnectTimer);
    stopConnectionTimers();
    clearStoredSessions();
    try { state.socket?.send(JSON.stringify({ type: "leave" })); } catch {}
    try { state.socket?.close(1000, "player-left"); } catch {}
    if (wasHost && hostToken && code) {
      await jsonRequest(`/api/rooms/${code}`, { method: "DELETE", headers: { Authorization: `Bearer ${hostToken}` } }).catch(() => null);
    }
    setJoining(false);
    resetRoomState();
    setView("lobby");
    setConnection("online", "联机服务正常");
    await refreshRooms();
  }

  function returnToLobby(closeSocket = true) {
    state.connectionGeneration += 1;
    if (closeSocket) {
      state.manualClose = true;
      try { state.socket?.close(1000, "return-to-lobby"); } catch {}
    }
    clearTimeout(state.reconnectTimer);
    stopConnectionTimers();
    setJoining(false);
    resetRoomState();
    setView("lobby");
    setConnection("online", "联机服务正常");
    refreshRooms();
  }

  function resetRoomState() {
    state.socket = null;
    state.endpoint = "";
    state.endpoints = [];
    state.roomCode = "";
    state.matchId = "";
    state.baselineId = "";
    state.hostToken = "";
    state.resumeToken = "";
    state.playerId = "";
    state.isHost = false;
    state.room = null;
    state.ready = false;
    state.latestSnapshot = null;
    state.confirmedRemovedFoodIds.clear();
    state.confirmedRemovedEjectedIds.clear();
    state.snapshotBuffer.clear();
    state.inputHistory = [];
    state.lastAckInputSeq = 0;
    state.lastBaselineRequestAt = 0;
    state.matchFinishedHandled = false;
    state.reconnectStartedAt = 0;
    state.connectionAttempt = 0;
    elements.reconnectOverlay.hidden = true;
  }

  function sendInput() {
    if (state.view !== "game") return;
    if (state.inputSuspended) {
      const player = state.latestSnapshot?.groups?.find(group => group.id === state.playerId);
      const cells = player?.cells || [];
      const mass = cells.reduce((sum, cell) => sum + cell.mass, 0);
      if (mass > 0) {
        state.input.targetX = cells.reduce((sum, cell) => sum + cell.x * cell.mass, 0) / mass;
        state.input.targetY = cells.reduce((sum, cell) => sum + cell.y * cell.mass, 0) / mass;
      }
      Object.assign(state.input, { dx: 0, dy: 0, split: false, eject: false, quickMerge: false, special: false });
    }
    state.inputSeq += 1;
    const input = {
      type: "input",
      seq: state.inputSeq,
      dx: state.input.dx,
      dy: state.input.dy,
      targetX: state.input.targetX,
      targetY: state.input.targetY,
      split: state.input.split,
      eject: state.input.eject,
      quickMerge: state.input.quickMerge,
      special: state.input.special
    };
    if (send(input)) {
      if (input.eject) window.ScaAudio?.play("eject");
      if (input.quickMerge || input.special) window.ScaAudio?.play("skill");
      state.inputHistory.push({ ...input, sentAt: performance.now() });
      if (state.inputHistory.length > 120) state.inputHistory.splice(0, state.inputHistory.length - 120);
    }
    state.input.split = false;
    state.input.quickMerge = false;
    state.input.special = false;
  }

  function resizeCanvas() {
    backgroundGradient = null;
    const pixelBudget = qualityPreset.pixelBudget;
    const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, window.innerWidth * window.innerHeight));
    const ratio = clamp(Math.min(window.devicePixelRatio || 1, qualityPreset.maximumDpr, budgetRatio), 0.65, qualityPreset.maximumDpr);
    elements.canvas.width = Math.max(1, Math.floor(window.innerWidth * ratio));
    elements.canvas.height = Math.max(1, Math.floor(window.innerHeight * ratio));
    elements.canvas.style.width = `${window.innerWidth}px`;
    elements.canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function interpolatedSnapshot(now) {
    const snapshot = state.snapshotBuffer.sample(now);
    return snapshot ? predictLocalPlayer(snapshot, now) : null;
  }

  function predictLocalPlayer(snapshot, now) {
    return window.ScaLocalPredictor.predictLocalPlayer(snapshot, {
      playerId: state.playerId,
      estimatedServerTime: state.snapshotBuffer.estimatedServerTime(now),
      currentInput: state.input,
      inputHistory: state.inputHistory,
      estimateInputTime: input => state.snapshotBuffer.estimatedServerTime(input.sentAt)
    });
  }

  function updateCamera(snapshot, elapsedMs) {
    let player = snapshot.groups.find(group => group.id === state.playerId);
    const spectating = Boolean(player?.dead && player.respawnRemaining <= 0);
    const button = document.getElementById("spectateBtn");
    button.hidden = !spectating;
    if (spectating) {
      const alive = snapshot.groups.filter(group => !group.dead && group.cells.length);
      player = alive.find(group => group.id === state.spectatorId) || alive.find(group => group.human) || alive[0];
      state.spectatorId = player?.id || "";
      button.textContent = player ? `观战 ${player.name} · Tab 切换` : "等待对局结束";
    }
    if (!player?.cells.length) return;
    Object.assign(state.camera, gameplayCore.cameraStep(state.camera, player.cells, {
      config: window.ScaModeCatalog.MODES[snapshot.mode],
      width: window.innerWidth, height: window.innerHeight, dt: elapsedMs / 1000
    }));
  }

  function worldToScreen(x, y) {
    return {
      x: (x - state.camera.x) * state.camera.zoom + window.innerWidth / 2,
      y: (y - state.camera.y) * state.camera.zoom + window.innerHeight / 2
    };
  }

  function pointerWorldTarget() {
    const zoom = Math.max(0.08, state.camera.zoom);
    return {
      x: state.camera.x + (state.pointer.x - window.innerWidth / 2) / zoom,
      y: state.camera.y + (state.pointer.y - window.innerHeight / 2) / zoom
    };
  }

  function drawBackground(snapshot) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (!backgroundGradient) {
      backgroundGradient = context.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.45, Math.max(width, height));
      backgroundGradient.addColorStop(0, "#0a1c22");
      backgroundGradient.addColorStop(1, "#030a0e");
    }
    context.fillStyle = backgroundGradient;
    context.fillRect(0, 0, width, height);
    const spacing = 120 * state.camera.zoom;
    if (spacing > 18) {
      const origin = worldToScreen(0, 0);
      context.beginPath();
      context.strokeStyle = "rgba(152, 211, 214, 0.055)";
      context.lineWidth = 1;
      for (let x = origin.x % spacing; x < width; x += spacing) {
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      for (let y = origin.y % spacing; y < height; y += spacing) {
        context.moveTo(0, y);
        context.lineTo(width, y);
      }
      context.stroke();
    }
    const arena = snapshot.arena || { x: 0, y: 0, width: snapshot.world.width, height: snapshot.world.height };
    const topLeft = worldToScreen(arena.x, arena.y);
    const bottomRight = worldToScreen(arena.x + arena.width, arena.y + arena.height);
    context.strokeStyle = "rgba(88, 237, 200, 0.45)";
    context.lineWidth = 3;
    context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
    if (snapshot.safeZone) {
      const center = worldToScreen(snapshot.safeZone.x, snapshot.safeZone.y);
      const radius = snapshot.safeZone.radius * state.camera.zoom;
      context.beginPath();
      context.rect(0, 0, width, height);
      context.arc(center.x, center.y, Math.max(0, radius), 0, Math.PI * 2, true);
      context.fillStyle = "rgba(244, 63, 94, 0.1)";
      context.fill("evenodd");
      context.beginPath();
      context.arc(center.x, center.y, Math.max(0, radius), 0, Math.PI * 2);
      context.strokeStyle = "rgba(251, 113, 133, 0.82)";
      context.lineWidth = 3;
      context.stroke();
    }
  }

  function visible(screen, radius = 20) {
    return screen.x + radius >= -30 && screen.x - radius <= window.innerWidth + 30 && screen.y + radius >= -30 && screen.y - radius <= window.innerHeight + 30;
  }

  function drawCosmeticTrail(group, cell, point, radius, now) {
    if (!group.human) return;
    {
      const definition = cosmeticCatalog.definition("trail", group.cosmetics?.trail);
      return cosmeticRenderer.drawTrail({
        context,
        definition,
        x: point.x,
        y: point.y,
        radius,
        worldRadius: cell.radius,
        vx: cell.vx,
        vy: cell.vy,
        now,
        lineScale: 1,
        splitCount: group.cells?.length || 1,
        lowQuality: gameSettings.quality === "performance",
        baseColor: group.color
      });
    }
  }

  function drawCosmeticHalo(group, point, radius, now) {
    if (!group.human) return;
    {
      const definition = cosmeticCatalog.definition("halo", group.cosmetics?.halo);
      return cosmeticRenderer.drawHalo({
        context,
        definition,
        x: point.x,
        y: point.y,
        radius,
        worldRadius: radius / Math.max(0.08, state.camera.zoom),
        now,
        lineScale: 1,
        splitCount: group.cells?.length || 1,
        lowQuality: gameSettings.quality === "performance",
        baseColor: group.color
      });
    }
  }

  function drawCosmeticSkin(group, point, radius, now) {
    if (!group.human) return;
    {
      const definition = cosmeticCatalog.definition("skin", group.cosmetics?.skin);
      return cosmeticRenderer.drawSkin({
        context,
        definition,
        x: point.x,
        y: point.y,
        radius,
        worldRadius: radius / Math.max(0.08, state.camera.zoom),
        now,
        lineScale: 1,
        splitCount: group.cells?.length || 1,
        lowQuality: gameSettings.quality === "performance",
        baseColor: group.color
      });
    }
  }

  function drawWorld(snapshot, now) {
    for (const point of snapshot.controlPoints || []) {
      const screen = worldToScreen(point.x, point.y);
      const radius = point.radius * state.camera.zoom;
      if (!visible(screen, radius)) continue;
      const owner = (snapshot.teams || []).find(team => team.team === point.owner);
      const capturing = (snapshot.teams || []).find(team => team.team === point.captureTeam);
      context.beginPath();
      context.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
      context.fillStyle = owner ? `${owner.color}24` : "rgba(255,255,255,0.045)";
      context.fill();
      context.strokeStyle = owner?.color || "rgba(255,255,255,0.45)";
      context.lineWidth = point.contested ? 5 : 3;
      context.stroke();
      if (point.progress > 0 && capturing) {
        context.beginPath();
        context.arc(screen.x, screen.y, radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * point.progress / 100);
        context.strokeStyle = capturing.color;
        context.lineWidth = 5;
        context.stroke();
      }
      context.fillStyle = "rgba(248,251,255,0.9)";
      context.font = "800 18px ui-monospace, monospace";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(point.id, screen.x, screen.y);
    }
    for (const virus of snapshot.viruses || []) {
      const point = worldToScreen(virus.x, virus.y);
      const radius = virus.radius * state.camera.zoom;
      if (!visible(point, radius)) continue;
      context.beginPath();
      const spikes = 18;
      for (let index = 0; index < spikes * 2; index += 1) {
        const angle = index / (spikes * 2) * Math.PI * 2;
        const length = index % 2 ? radius * 0.82 : radius;
        const x = point.x + Math.cos(angle) * length;
        const y = point.y + Math.sin(angle) * length;
        if (!index) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.fillStyle = virus.color || (virus.spore ? "#f472b6" : "#5eea80");
      context.globalAlpha = 0.82;
      context.fill();
      context.globalAlpha = 1;
    }
    const foodBatches = foodRenderBatches;
    for (const values of foodBatches.values()) values.length = 0;
    for (const food of snapshot.foods || []) {
      if (state.confirmedRemovedFoodIds.has(food.id)) continue;
      const color = typeof food.color === "number"
        ? FOOD_COLORS[Math.abs(food.color) % FOOD_COLORS.length]
        : food.color || FOOD_COLORS[0];
      if (!foodBatches.has(color)) foodBatches.set(color, []);
      foodBatches.get(color).push(food);
    }
    for (const [color, foods] of foodBatches) {
      context.beginPath();
      let visibleCount = 0;
      for (const food of foods) {
        const point = worldToScreen(food.x, food.y);
        const radius = Math.max(2, food.radius * state.camera.zoom);
        if (!visible(point, radius)) continue;
        context.moveTo(point.x + radius, point.y);
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        visibleCount += 1;
      }
      if (visibleCount) {
        context.fillStyle = color;
        context.fill();
      }
    }
    for (const item of snapshot.ejected || []) {
      if (state.confirmedRemovedEjectedIds.has(item.id)) continue;
      const point = worldToScreen(item.x, item.y);
      const radius = Math.max(3, item.radius * state.camera.zoom);
      if (!visible(point, radius)) continue;
      cosmeticRenderer.drawEjected({ context, x: point.x, y: point.y, radius,
        color: item.color, pattern: item.spore, accent: item.accent, lowQuality: gameSettings.quality === "performance" });
    }
    const cells = cellRenderBuffer;
    let cellCount = 0;
    for (const group of snapshot.groups || []) for (const cell of group.cells || []) {
      const entry = cells[cellCount] || (cells[cellCount] = {});
      entry.group = group; entry.cell = cell; cellCount += 1;
    }
    cells.length = cellCount;
    cells.sort((a, b) => a.cell.radius - b.cell.radius);
    for (const { group, cell } of cells) {
      const point = worldToScreen(cell.x, cell.y);
      const radius = cell.radius * state.camera.zoom;
      if (!visible(point, radius)) continue;
      drawCosmeticTrail(group, cell, point, radius, now);
      drawCosmeticHalo(group, point, radius, now);
      cosmeticRenderer.drawCellBody({ context, x: point.x, y: point.y, radius, worldRadius: cell.radius,
        color: group.color, own: group.id === state.playerId, now, lowQuality: gameSettings.quality === "performance",
        invincibleRemaining: group.invincibleRemaining, mergeDelay: cell.mergeDelay, mergeMax: cell.mergeMax });
      drawCosmeticSkin(group, point, radius, now);
      cosmeticRenderer.drawCellLabel({ context, x: point.x, y: point.y, radius, worldRadius: cell.radius,
        name: group.name, mass: cell.mass, own: group.id === state.playerId,
        showName: group.cells.length <= 4 || cell.radius >= 64 });
    }
  }

  function drawMinimap(snapshot) {
    if (!miniContext || !elements.miniCanvas || !snapshot.world) return;
    const width = elements.miniCanvas.width;
    const height = elements.miniCanvas.height;
    const scaleX = width / Math.max(1, snapshot.world.width);
    const scaleY = height / Math.max(1, snapshot.world.height);
    miniContext.fillStyle = "#061015";
    miniContext.fillRect(0, 0, width, height);
    miniContext.strokeStyle = "rgba(88,237,200,0.28)";
    miniContext.lineWidth = 1;
    miniContext.strokeRect(0.5, 0.5, width - 1, height - 1);
    if (snapshot.safeZone) {
      miniContext.beginPath();
      miniContext.arc(snapshot.safeZone.x * scaleX, snapshot.safeZone.y * scaleY, snapshot.safeZone.radius * Math.min(scaleX, scaleY), 0, Math.PI * 2);
      miniContext.fillStyle = "rgba(251,113,133,0.08)";
      miniContext.fill();
      miniContext.strokeStyle = "rgba(251,113,133,0.78)";
      miniContext.stroke();
    }
    for (const point of snapshot.controlPoints || []) {
      miniContext.beginPath();
      miniContext.arc(point.x * scaleX, point.y * scaleY, 4, 0, Math.PI * 2);
      miniContext.fillStyle = snapshot.teams?.find(team => team.team === point.owner)?.color || "#f8fbff";
      miniContext.fill();
    }
    for (const group of snapshot.groups || []) {
      if (group.dead || !group.cells?.length) continue;
      let mass = 0;
      let x = 0;
      let y = 0;
      for (const cell of group.cells) {
        const weight = Math.max(1, cell.mass || 1);
        mass += weight;
        x += cell.x * weight;
        y += cell.y * weight;
      }
      miniContext.beginPath();
      miniContext.arc(x / mass * scaleX, y / mass * scaleY, group.id === state.playerId ? 4.2 : clamp(Math.sqrt(Math.max(1, group.mass)) / 15, 1.5, 3.4), 0, Math.PI * 2);
      miniContext.fillStyle = group.id === state.playerId ? "#ffffff" : group.color;
      miniContext.fill();
    }
  }

  function updateHud(snapshot) {
    const player = snapshot.groups.find(group => group.id === state.playerId);
    state.personalPeakMass = Math.max(state.personalPeakMass, player?.mass || 0);
    window.ScaAudio?.observe(player);
    elements.mass.textContent = player ? Math.round(player.mass) : "0";
    elements.rank.textContent = player ? `#${player.rank}` : "-";
    elements.kills.textContent = player?.kills || 0;
    if (snapshot.remaining == null) {
      elements.timer.textContent = "生存战";
    } else {
      const seconds = Math.max(0, Math.ceil(snapshot.remaining));
      elements.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    }
    if (elements.gameModeName) elements.gameModeName.textContent = modeLabel(snapshot.mode || "solo");
    if (snapshot.mode === "screen" && player) {
      const quickSeconds = Math.max(0, Number(player.quickMergeCooldown) || 0);
      const specialSeconds = Math.max(0, Number(player.specialCooldown) || 0);
      const quickLabel = elements.touchQuickMerge?.querySelector("small");
      const specialLabel = elements.touchSpecial?.querySelector("small");
      if (quickLabel) quickLabel.textContent = quickSeconds > 0 ? `${quickSeconds.toFixed(1)}s` : "速合";
      if (specialLabel) specialLabel.textContent = specialSeconds > 0 ? `${specialSeconds.toFixed(1)}s` : "冲刺";
      if (elements.touchQuickMerge) elements.touchQuickMerge.disabled = quickSeconds > 0;
      if (elements.touchSpecial) elements.touchSpecial.disabled = specialSeconds > 0;
    }
    if (elements.gameObjective) {
      const objective = snapshot.objective || {};
      let text = objective.description || modeInfo(snapshot.mode).description;
      if (snapshot.mode === "survival" && player) text = `剩余 ${player.lives} 条生命 · 击杀可加命`;
      if (snapshot.mode === "battle" && snapshot.safeZone) text = `安全区半径 ${Math.round(snapshot.safeZone.radius)} · 圈外持续损失质量`;
      if (snapshot.mode === "control") {
        const leader = snapshot.teams?.[0];
        text = leader ? `${leader.name} ${Math.round(leader.score)} / ${objective.targetScore || 240} 分` : "争夺 A / B / C 三个星核";
      }
      if (objective.domination) {
        const leader = snapshot.groups.find(group => group.id === objective.domination.leaderId);
        text = `${leader?.name || "暂无玩家"} 占总质量 ${Math.round(objective.domination.share * 100)}% · 制霸 ${objective.domination.progressSeconds.toFixed(1)} / ${objective.domination.holdSeconds}s`;
      }
      if (snapshot.mode === "demon") text = `剩余魔王 ${objective.bossesAlive ?? 0} · 勇者协作吞噬魔王`;
      if (objective.activeEvent) text += ` · ${objective.activeEvent.label} ${Math.ceil(objective.activeEvent.remaining)}s`;
      if (player?.dead && !player.eliminated) text = `${player.respawnRemaining.toFixed(1)} 秒后复活`;
      if (player?.eliminated) text = "你已出局，可继续观战";
      elements.gameObjective.textContent = text;
    }
    const sync = state.snapshotBuffer.getStats();
    if (elements.gameNetworkDetail) {
      elements.gameNetworkDetail.textContent = `图形 ${Math.round(state.smoothedFps)} FPS / 目标 ${targetRenderFps} · 权威 ${sync.snapshotHz.toFixed(1)} Hz · 抖动 ${Math.round(sync.jitterMs)}ms · 缓冲 ${Math.round(sync.bufferDepthMs)}ms`;
    }
    elements.latency.title = `往返延迟 ${state.latency}ms；快照 ${sync.snapshotHz.toFixed(1)}Hz；抖动 ${sync.jitterMs.toFixed(1)}ms；缓冲欠载 ${sync.bufferUnderruns} 次`;
    elements.ranking.replaceChildren();
    const showTeams = ["team", "control", "demon"].includes(snapshot.mode) && snapshot.teams?.length;
    const entries = showTeams ? snapshot.teams : (snapshot.ranking || []);
    entries.slice(0, 8).forEach((entry, index) => {
      const item = document.createElement("li");
      if (entry.id === state.playerId || (showTeams && entry.team === player?.team)) item.className = "me";
      const rank = document.createElement("b");
      const name = document.createElement("span");
      const mass = document.createElement("em");
      rank.textContent = String(index + 1);
      name.textContent = entry.name;
      mass.textContent = snapshot.mode === "control"
        ? `${Math.round(entry.score || 0)}分`
        : snapshot.mode === "survival"
          ? `${entry.kills || 0}杀`
          : String(Math.round(entry.mass));
      item.append(rank, name, mass);
      elements.ranking.append(item);
    });
  }

  function render(now) {
    const cadence = gameplayCore.advanceRenderCadence(now, state.nextRenderAt, targetRenderInterval);
    state.nextRenderAt = cadence.nextRenderAt;
    if (!cadence.due) {
      state.renderFrame = requestAnimationFrame(render);
      return;
    }
    const elapsed = state.lastRenderAt ? clamp(now - state.lastRenderAt, 0, 100) : 16.67;
    state.lastRenderAt = now;
    if (elapsed > 0) state.smoothedFps += (1000 / elapsed - state.smoothedFps) * 0.04;
    if (state.view === "game") {
      const snapshot = interpolatedSnapshot(now);
      if (snapshot) {
        updateCamera(snapshot, elapsed);
        drawBackground(snapshot);
        drawWorld(snapshot, now);
        if (now - state.lastMinimapAt >= 130) {
          state.lastMinimapAt = now;
          drawMinimap(snapshot);
        }
        if (now - state.lastHudAt >= HUD_INTERVAL_MS) {
          state.lastHudAt = now;
          updateHud(snapshot);
        }
      } else {
        context.fillStyle = "#051014";
        context.fillRect(0, 0, window.innerWidth, window.innerHeight);
      }
      if (!state.inputSuspended) {
        const dx = state.pointer.x - window.innerWidth / 2;
        const dy = state.pointer.y - window.innerHeight / 2;
        const length = Math.hypot(dx, dy) || 1;
        state.input.dx = dx / length;
        state.input.dy = dy / length;
        const target = pointerWorldTarget();
        state.input.targetX = target.x;
        state.input.targetY = target.y;
      }
    }
    state.renderFrame = requestAnimationFrame(render);
  }

  function pointerFromEvent(event) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  }

  function cycleSpectator() {
    const alive = state.latestSnapshot?.groups?.filter(group => !group.dead && group.cells.length) || [];
    const index = alive.findIndex(group => group.id === state.spectatorId);
    state.spectatorId = alive[(index + 1) % Math.max(1, alive.length)]?.id || "";
  }

  function showMatchResult(data, winnerText) {
    window.ScaMatchGuide?.hide();
    const dialog = document.getElementById("matchResult");
    document.getElementById("matchResultTitle").textContent = winnerText;
    const latest = state.latestSnapshot?.groups?.find(group => group.id === state.playerId);
    const own = data.ranking?.find(entry => entry.id === state.playerId) || latest;
    const mode = state.room?.settings.mode || "solo";
    const winner = data.ranking?.find(entry => entry.id === data.winnerId) || state.latestSnapshot?.groups?.find(group => group.id === data.winnerId);
    const reward = data.reason === "server-simulation-error" ? 0 : window.ScaProgression.grantLocalReward(localStorage, state.matchId, {
      rank: latest?.teamRank || latest?.rank || 99, peakMass: state.personalPeakMass, kills: own?.kills || 0,
      controlScore: mode === "control" ? own?.score || 0 : 0, demon: mode === "demon", demonWin: winner?.team === 0
    });
    document.getElementById("matchResultSummary").textContent = `${modeLabel(mode)} · ${data.reason || "比赛结束"} · 你的最高质量 ${Math.round(state.personalPeakMass)} / 淘汰 ${own?.kills || 0}${reward ? ` · 星尘 +${reward}` : ""}`;
    const list = document.getElementById("matchResultRanking");
    list.replaceChildren();
    for (const [index, entry] of (data.ranking || []).slice(0, 5).entries()) {
      const row = document.createElement("li");
      row.textContent = `${index + 1}. ${entry.name}　${Math.round(entry.mass)}　${entry.kills || 0} 淘汰`;
      list.append(row);
    }
    dialog.hidden = false;
    state.inputSuspended = true;
    document.getElementById("matchResultContinue").focus({ preventScroll: true });
  }
  document.getElementById("spectateBtn").addEventListener("click", cycleSpectator);
  document.getElementById("matchResultContinue").addEventListener("click", () => { document.getElementById("matchResult").hidden = true; });

  elements.nickname.value = localStorage.getItem("starClusterPlayerName") || "星友";
  elements.nickname.addEventListener("change", () => localStorage.setItem("starClusterPlayerName", playerName()));
  elements.modeSelect?.addEventListener("change", updateModeDescription);
  elements.roomModeSelect?.addEventListener("change", () => {
    if (state.isHost) send({ type: "update-settings", mode: elements.roomModeSelect.value });
  });
  elements.createRoom.addEventListener("click", createRoom);
  elements.refreshRooms.addEventListener("click", () => refreshRooms(true, true));
  function syncConnectionControls() {
    document.getElementById("privateRoomField").hidden = state.connectionMode !== "internet";
    document.getElementById("connectionFootnote").textContent = state.connectionMode === "internet" ? "公网服务运行对局，朋友无需开放家用路由器端口。邀请链接只发给信任的人。" : "首次创建时，Windows 可能询问网络权限；只需允许专用网络。";
    document.getElementById("connectionMode").value = state.connectionMode;
    const serverInput = document.getElementById("internetServer");
    serverInput.hidden = state.connectionMode !== "internet";
    serverInput.value = state.serviceOrigin;
    document.getElementById("connectionHelp").textContent = state.connectionMode === "internet"
      ? "朋友连接同一个服务即可异地游玩。尚未配置公共服务时，可自行部署；需要主机与域名。"
      : "同一网络的朋友可以直接创建并发现房间。";
  }
  document.getElementById("connectionMode")?.addEventListener("change", event => {
    state.connectionMode = event.target.value;
    state.serviceOrigin = state.connectionMode === "internet" ? connectionApi.load().origin : "";
    state.rooms = []; state.roomListSignature = ""; state.diagnostics = null;
    connectionApi.save({ mode: state.connectionMode, origin: state.serviceOrigin });
    syncConnectionControls(); renderRoomList(); renderNetworkDiagnostics();
    elements.discoveryStatus.textContent = state.connectionMode === "internet" ? "填写服务器地址并检查连接后开始。" : "正在发现局域网房间。";
    setConnection("idle", state.connectionMode === "internet" ? "请配置互联网服务" : "正在扫描");
    if (state.connectionMode === "lan" || state.serviceOrigin) { void loadModes(); void refreshRooms(); }
  });
  document.getElementById("internetServer")?.addEventListener("input", () => {
    if (state.connectionMode === "internet") { setConnection("idle", "检查连接后生效"); state.rooms = []; state.roomListSignature = ""; renderRoomList(); }
  });
  document.getElementById("applyConnectionBtn")?.addEventListener("click", async () => {
    try {
      const mode = document.getElementById("connectionMode").value;
      const origin = mode === "internet" ? connectionApi.serverOrigin(document.getElementById("internetServer").value) : "";
      state.connectionMode = mode;
      state.serviceOrigin = origin;
      state.rooms = [];
      state.roomListSignature = "";
      connectionApi.save({ mode, origin });
      syncConnectionControls();
      await loadModes();
      await refreshRooms(true, true);
    } catch (error) { showToast(error.message, true); }
  });
  elements.roomCodeInput.addEventListener("keydown", event => { if (event.key === "Enter") joinByCode(); });
  elements.joinCode.addEventListener("click", joinByCode);
  elements.openFirewallSettings.addEventListener("click", async () => {
    try {
      await window.starClusterDesktop?.openFirewallSettings?.();
    } catch {
      showToast("无法打开系统设置，请在 Windows 安全中心中允许星团大作战使用专用网络。", true);
    }
  });
  elements.copyRoomCode.addEventListener("click", async () => {
    try {
      const value = state.connectionMode === "internet" ? connectionApi.inviteLink(state.serviceOrigin, state.roomCode) : state.roomCode;
      if (window.starClusterDesktop?.copyText) await window.starClusterDesktop.copyText(value);
      else await navigator.clipboard.writeText(value);
      showToast(state.connectionMode === "internet" ? "邀请链接已复制，发给朋友即可加入" : `房间码 ${state.roomCode} 已复制`);
    } catch {
      showToast(`房间码：${state.roomCode}`);
    }
  });
  elements.ready.addEventListener("click", () => send({
    type: "ready",
    ready: !state.ready,
    configVersion: state.room?.configVersion || 0
  }));
  elements.startMatch.addEventListener("click", () => send({
    type: "start",
    configVersion: state.room?.configVersion || 0
  }));
  elements.leaveRoom.addEventListener("click", openSessionMenu);
  elements.exitMatch.addEventListener("click", openSessionMenu);
  elements.sessionContinue?.addEventListener("click", closeSessionMenu);
  elements.sessionLeave?.addEventListener("click", async () => {
    closeSessionMenu();
    await leaveRoom();
  });
  elements.sessionHome?.addEventListener("click", async () => {
    closeSessionMenu();
    if (state.view !== "lobby") await leaveRoom();
    goToMainMenu();
  });
  elements.canvas.addEventListener("pointermove", pointerFromEvent);
  elements.canvas.addEventListener("pointerdown", pointerFromEvent);
  elements.touchSplit.addEventListener("pointerdown", event => { event.preventDefault(); state.input.split = true; });
  elements.touchEject.addEventListener("pointerdown", event => { event.preventDefault(); state.input.eject = true; });
  elements.touchQuickMerge?.addEventListener("pointerdown", event => { event.preventDefault(); state.input.quickMerge = true; });
  elements.touchSpecial?.addEventListener("pointerdown", event => { event.preventDefault(); state.input.special = true; });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    elements.touchEject.addEventListener(eventName, event => { event.preventDefault(); state.input.eject = false; });
  }
  window.addEventListener("pointerup", () => { state.input.eject = false; });
  const releaseInput = () => {
    state.inputSuspended = true;
    state.input.eject = false;
    state.input.split = false;
    state.input.quickMerge = false;
    state.input.special = false;
    state.input.dx = 0;
    state.input.dy = 0;
    const player = state.latestSnapshot?.groups?.find(group => group.id === state.playerId);
    const cell = player?.cells?.[0];
    if (cell) { state.input.targetX = cell.x; state.input.targetY = cell.y; }
    if (state.view === "game") send({ type: "input", seq: ++state.inputSeq, ...state.input });
  };
  window.addEventListener("blur", releaseInput);
  window.addEventListener("focus", () => { state.inputSuspended = Boolean(elements.sessionMenu && !elements.sessionMenu.hidden); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseInput(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (!document.getElementById("matchResult").hidden) { document.getElementById("matchResult").hidden = true; return; }
      if (elements.sessionMenu && !elements.sessionMenu.hidden) closeSessionMenu();
      else openSessionMenu();
      return;
    }
    if (state.view !== "game") return;
    if (event.key === "Tab" && !document.getElementById("spectateBtn").hidden) { event.preventDefault(); cycleSpectator(); return; }
    if (state.matchFinishedHandled) return;
    if (elements.sessionMenu && !elements.sessionMenu.hidden) return;
    if (event.code === "Space" && !event.repeat) {
      event.preventDefault();
      state.input.split = true;
    }
    if (event.key.toLowerCase() === "w") {
      event.preventDefault();
      state.input.eject = true;
    }
    if (event.key.toLowerCase() === "a" && !event.repeat) {
      event.preventDefault();
      state.input.quickMerge = true;
    }
    if (event.key.toLowerCase() === "d" && !event.repeat) {
      event.preventDefault();
      state.input.special = true;
    }
  });
  document.addEventListener("keyup", event => {
    if (event.key.toLowerCase() === "w") state.input.eject = false;
  });
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("beforeunload", () => {
    state.manualClose = true;
    clearStoredSessions();
    try { state.socket?.send(JSON.stringify({ type: "leave" })); } catch {}
    try { state.socket?.close(1000, "window-closed"); } catch {}
  });

  resizeCanvas();
  document.documentElement.classList.toggle("hide-performance", !gameSettings.showPerformance);
  document.querySelector(".back-link")?.addEventListener("click", event => {
    event.preventDefault();
    goToMainMenu();
  });
  if (new URLSearchParams(location.search).has("debug")) {
    window.__starClusterMultiplayerDebug = Object.freeze({
      snapshot: () => {
        const snapshot = state.snapshotBuffer.sample(performance.now()) || state.latestSnapshot;
        const groups = snapshot?.groups || [];
        return {
          protocol: PROTOCOL_VERSION,
          targetRenderFps,
          displayRefresh,
          inputHz: Math.round(1000 / INPUT_INTERVAL_MS),
          settings: { ...gameSettings },
          view: state.view,
          connectionMode: state.connectionMode,
          serviceOrigin: state.serviceOrigin,
          playerId: state.playerId,
          roomCode: state.roomCode,
          spectatorId: state.spectatorId,
          inputSuspended: state.inputSuspended,
          input: { ...state.input },
          measuredFps: Math.round(state.smoothedFps),
          synchronization: state.snapshotBuffer.getStats(),
          world: snapshot?.world || null,
          foodCount: snapshot?.foods?.length || 0,
          leaderMass: groups.reduce((maximum, group) => Math.max(maximum, Number(group.mass) || 0), 0),
          totalKills: groups.reduce((total, group) => total + (Number(group.kills) || 0), 0)
        };
      }
    });
  }
  syncConnectionControls();
  const invitedRoom = new URLSearchParams(location.search).get("room");
  if (invitedRoom && /^[A-Za-z0-9]{6}$/.test(invitedRoom)) {
    state.connectionMode = "internet";
    state.serviceOrigin = location.origin;
    syncConnectionControls();
    elements.roomCodeInput.value = invitedRoom;
    showToast("邀请已填入。输入昵称后点击加入房间。");
  }
  loadModes();
  refreshRooms(false, true);
  state.roomRefreshTimer = setInterval(() => refreshRooms(), 1200);
  state.renderFrame = requestAnimationFrame(render);
})();
