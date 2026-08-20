import { EventEmitter } from "node:events";
import {
  MAX_BOTS,
  MAX_HUMAN_PLAYERS,
  PROTOCOL_VERSION,
  ProtocolError,
  createRoomCode,
  encodeMessage,
  integerInRange,
  normalizeRoomCode,
  parseClientMessage,
  publicRoomSummary,
  sanitizeName,
  secureToken
} from "./protocol.mjs";
import { normalizeBotCountForMode, normalizeMode } from "./modes.mjs";
import { AuthoritativeSimulation, SIMULATION_CONSTANTS } from "./simulation.mjs";
import { compactSnapshot } from "./snapshot-wire.mjs";

const ROOM_STATES = Object.freeze({ LOBBY: "LOBBY", RUNNING: "RUNNING", FINISHED: "FINISHED", CLOSED: "CLOSED" });
const LOBBY_DISCONNECT_GRACE_MS = 5_000;
const MATCH_DISCONNECT_GRACE_MS = 15_000;
const DISCONNECT_GRACE_MS = MATCH_DISCONNECT_GRACE_MS;
const EMPTY_ROOM_TTL_MS = 60_000;
const RETURN_TO_LOBBY_MS = 4_000;
const SNAPSHOT_BACKPRESSURE_LIMIT_BYTES = 256 * 1024;
const MAX_CATCH_UP_STEPS = 4;
const STEP_MS = SIMULATION_CONSTANTS.STEP_SECONDS * 1000;

function safeSend(socket, value) {
  if (socket?.readyState !== 1) return false;
  try {
    socket.send(typeof value === "string" ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function socketClose(socket, code, reason) {
  try {
    socket.close(code, reason.slice(0, 120));
  } catch {
    try { socket.terminate?.(); } catch {}
  }
}

export class RoomManager extends EventEmitter {
  constructor({ logger = console, now = () => Date.now(), allowSinglePlayerStart = false } = {}) {
    super();
    this.logger = logger;
    this.now = now;
    this.allowSinglePlayerStart = allowSinglePlayerStart;
    this.rooms = new Map();
    this.connectionSequence = 0;
  }

  createRoom(options = {}) {
    let code;
    do code = createRoomCode(); while (this.rooms.has(code));
    const createdAt = this.now();
    const hostName = sanitizeName(options.name, "房主");
    const mode = normalizeMode(options.mode);
    const room = {
      code,
      name: sanitizeName(options.roomName, `${hostName}的星团`).slice(0, 28),
      hostToken: secureToken(),
      state: ROOM_STATES.LOBBY,
      createdAt,
      updatedAt: createdAt,
      players: new Map(),
      revision: 1,
      matchId: "",
      baselineId: "",
      settings: {
        mode,
        maxPlayers: integerInRange(options.maxPlayers, 2, MAX_HUMAN_PLAYERS, MAX_HUMAN_PLAYERS),
        botCount: normalizeBotCountForMode(mode, integerInRange(options.botCount, 0, MAX_BOTS, 6))
      },
      simulation: null,
      interval: null,
      loopState: null,
      networkStats: {
        bytes: 0,
        snapshots: 0,
        snapshotDrops: 0,
        tickDrift: 0,
        maxTickDrift: 0,
        skippedSimulationMs: 0,
        catchUpClamps: 0
      },
      closeTimer: null,
      finishTimer: null,
      seed: Number.parseInt(options.seed, 10) >>> 0 || Math.floor(Math.random() * 0xffffffff)
    };
    this.rooms.set(code, room);
    this.emit("rooms-changed");
    return {
      code,
      hostToken: room.hostToken,
      room: publicRoomSummary(room)
    };
  }

  getRoom(code) {
    return this.rooms.get(normalizeRoomCode(code)) || null;
  }

  roomList(endpointFactory = () => "") {
    return [...this.rooms.values()]
      .filter(room => room.state !== ROOM_STATES.CLOSED)
      .map(room => publicRoomSummary(room, endpointFactory(room)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  discoveryRooms() {
    return [...this.rooms.values()]
      .filter(room => room.state === ROOM_STATES.LOBBY)
      .map(room => publicRoomSummary(room));
  }

  publicLobby(room) {
    return {
      code: room.code,
      name: room.name,
      state: room.state.toLowerCase(),
      settings: { ...room.settings },
      configVersion: room.revision,
      players: [...room.players.values()].map(player => ({
        id: player.id,
        name: player.name,
        host: player.host,
        ready: player.ready,
        connected: player.connected
      }))
    };
  }

  broadcast(room, type, payload = {}) {
    const message = encodeMessage(type, payload);
    for (const player of room.players.values()) safeSend(player.socket, message);
  }

  broadcastLobby(room) {
    room.updatedAt = this.now();
    this.broadcast(room, "lobby", { room: this.publicLobby(room) });
    this.emit("rooms-changed");
  }

  connectSocket(socket, code, metadata = {}) {
    const room = this.getRoom(code);
    if (!room) {
      safeSend(socket, { type: "error", code: "room-not-found", message: "没有找到这个房间" });
      socketClose(socket, 1008, "room-not-found");
      return null;
    }
    const connection = {
      id: `connection-${++this.connectionSequence}`,
      socket,
      room,
      player: null,
      joined: false,
      remoteAddress: metadata.remoteAddress || "unknown",
      connectedAt: this.now(),
      lastMessageAt: this.now(),
      messageWindowAt: this.now(),
      messageCount: 0,
      voluntaryLeave: false
    };
    socket.on("message", raw => this.handleRawMessage(connection, raw));
    socket.on("close", () => this.disconnect(connection));
    socket.on("error", error => this.logger.warn?.(`WebSocket ${connection.id}: ${error.message}`));
    safeSend(socket, { type: "hello", protocol: PROTOCOL_VERSION, room: room.code });
    return connection;
  }

  enforceMessageRate(connection) {
    const now = this.now();
    if (now - connection.messageWindowAt >= 1000) {
      connection.messageWindowAt = now;
      connection.messageCount = 0;
    }
    connection.messageCount += 1;
    if (connection.messageCount > 80) throw new ProtocolError("rate-limited", "消息频率过高");
  }

  handleRawMessage(connection, raw) {
    try {
      this.enforceMessageRate(connection);
      connection.lastMessageAt = this.now();
      const message = parseClientMessage(raw);
      if (!connection.joined) {
        if (message.type !== "join") throw new ProtocolError("join-required", "请先加入房间");
        this.join(connection, message);
        return;
      }
      this.handlePlayerMessage(connection, message);
    } catch (error) {
      const code = error instanceof ProtocolError ? error.code : "server-error";
      const message = error instanceof ProtocolError ? error.message : "服务器处理消息失败";
      safeSend(connection.socket, { type: "error", code, message });
      if (error instanceof ProtocolError && ["message-too-large", "rate-limited", "invalid-json"].includes(error.code)) {
        socketClose(connection.socket, error.closeCode, error.code);
      }
      if (!(error instanceof ProtocolError)) this.logger.error?.(error);
    }
  }

  join(connection, message) {
    const room = connection.room;
    if (message.protocol !== PROTOCOL_VERSION) {
      throw new ProtocolError("protocol-mismatch", `协议不兼容：需要 ${PROTOCOL_VERSION}`);
    }

    let player = null;
    if (message.resumeToken) {
      player = [...room.players.values()].find(candidate => candidate.resumeToken === message.resumeToken);
      const withinGrace = player && (!player.disconnectedAt || this.now() - player.disconnectedAt <= DISCONNECT_GRACE_MS);
      if (!withinGrace) player = null;
    }

    if (player) {
      if (player.socket && player.socket !== connection.socket) socketClose(player.socket, 1000, "session-replaced");
      player.socket = connection.socket;
      player.connected = true;
      player.disconnectedAt = 0;
      if (room.simulation) room.simulation.setConnected(player.id, true);
    } else {
      if (room.state !== ROOM_STATES.LOBBY) throw new ProtocolError("match-in-progress", "对局已经开始");
      const connectedPlayers = [...room.players.values()].filter(candidate => candidate.connected).length;
      if (connectedPlayers >= room.settings.maxPlayers) throw new ProtocolError("room-full", "房间已满");
      const isHost = Boolean(message.hostToken && message.hostToken === room.hostToken && ![...room.players.values()].some(candidate => candidate.host));
      player = {
        id: `player-${secureToken(8)}`,
        name: message.name,
        host: isHost,
        ready: false,
        connected: true,
        socket: connection.socket,
        resumeToken: secureToken(),
        joinedAt: this.now(),
        disconnectedAt: 0,
        removalTimer: null,
        needsFullSnapshot: true
      };
      room.players.set(player.id, player);
    }

    if (player.removalTimer) clearTimeout(player.removalTimer);
    player.removalTimer = null;
    connection.player = player;
    connection.joined = true;
    safeSend(connection.socket, {
      type: "welcome",
      playerId: player.id,
      resumeToken: player.resumeToken,
      host: player.host,
      room: this.publicLobby(room),
      protocol: PROTOCOL_VERSION
    });
    if (room.state === ROOM_STATES.RUNNING && room.simulation) {
      player.needsFullSnapshot = true;
      safeSend(connection.socket, {
        type: "match-start",
        seed: room.seed,
        world: room.simulation.snapshot({ foodMode: "none" }).world,
        serverTime: room.simulation.serverTime,
        resumed: true,
        mode: room.settings.mode,
        matchId: room.matchId,
        baselineId: room.baselineId,
        configVersion: room.revision
      });
      this.sendFullSnapshot(room, player);
    }
    this.broadcastLobby(room);
  }

  handlePlayerMessage(connection, message) {
    const { room, player } = connection;
    switch (message.type) {
      case "ready":
        if (room.state !== ROOM_STATES.LOBBY) return;
        if (message.configVersion !== room.revision) {
          throw new ProtocolError("settings-changed", "房间设置已更新，请按最新设置重新准备");
        }
        player.ready = message.ready;
        this.broadcastLobby(room);
        break;
      case "start":
        if (message.configVersion !== room.revision) {
          throw new ProtocolError("settings-changed", "房间设置已更新，请按最新设置重新开始");
        }
        this.startRoom(room, player);
        break;
      case "leave":
        this.leave(connection);
        break;
      case "update-settings":
        this.updateRoomSettings(room, player, message);
        break;
      case "resync-request":
        if (room.state === ROOM_STATES.RUNNING && room.simulation) {
          player.needsFullSnapshot = true;
          this.sendFullSnapshot(room, player);
        }
        break;
      case "input":
        if (room.state === ROOM_STATES.RUNNING && room.simulation) room.simulation.setInput(player.id, message);
        break;
      case "ping":
        safeSend(connection.socket, { type: "pong", clientTime: message.clientTime, serverTime: this.now() });
        break;
      default:
        throw new ProtocolError("invalid-state-message", "当前不能处理这条消息");
    }
  }

  updateRoomSettings(room, player, message) {
    if (!player.host) throw new ProtocolError("host-only", "只有房主可以修改房间设置");
    if (room.state !== ROOM_STATES.LOBBY) throw new ProtocolError("invalid-room-state", "对局开始后不能修改房间设置");

    const mode = Object.hasOwn(message, "mode") ? normalizeMode(message.mode) : room.settings.mode;
    const requestedBots = Object.hasOwn(message, "botCount") ? message.botCount : room.settings.botCount;
    const botCount = normalizeBotCountForMode(mode, requestedBots, room.settings.botCount);
    if (mode === room.settings.mode && botCount === room.settings.botCount) return false;

    room.settings.mode = mode;
    room.settings.botCount = botCount;
    room.revision += 1;
    for (const candidate of room.players.values()) candidate.ready = false;
    this.broadcastLobby(room);
    return true;
  }

  startRoom(room, player) {
    if (!player.host) throw new ProtocolError("host-only", "只有房主可以开始游戏");
    if (room.state !== ROOM_STATES.LOBBY) throw new ProtocolError("invalid-room-state", "房间不在等待状态");
    const connected = [...room.players.values()].filter(candidate => candidate.connected);
    const minimum = this.allowSinglePlayerStart ? 1 : 2;
    if (connected.length < minimum) throw new ProtocolError("not-enough-players", `至少需要 ${minimum} 名真人`);
    if (!connected.every(candidate => candidate.ready)) throw new ProtocolError("players-not-ready", "还有玩家没有准备");

    room.state = ROOM_STATES.RUNNING;
    room.matchId = `match-${secureToken(9)}`;
    room.baselineId = `baseline-${secureToken(7)}`;
    room.simulation = new AuthoritativeSimulation({
      players: connected.map(candidate => ({ id: candidate.id, name: candidate.name, connected: true })),
      botCount: room.settings.botCount,
      mode: room.settings.mode,
      seed: room.seed,
      now: this.now()
    });
    const initialState = room.simulation.snapshot({ foodMode: "none" });
    this.broadcast(room, "match-start", {
      seed: room.seed,
      world: initialState.world,
      serverTime: room.simulation.serverTime,
      mode: room.settings.mode,
      matchId: room.matchId,
      baselineId: room.baselineId,
      configVersion: room.revision
    });
    for (const candidate of room.players.values()) candidate.needsFullSnapshot = true;
    this.broadcastSnapshot(room, { forceFull: true });

    const loopStartedAt = this.now();
    room.loopState = {
      lastWallTime: loopStartedAt,
      simulationTime: room.simulation.serverTime,
      accumulator: 0
    };
    room.interval = setInterval(() => this.runRoomLoop(room, this.now()), STEP_MS);
    room.interval.unref?.();
    this.emit("rooms-changed");
  }

  snapshotPayload(room, foodMode) {
    const snapshot = {
      ...room.simulation.snapshot({ foodMode }),
      matchId: room.matchId,
      baselineId: room.baselineId,
      configVersion: room.revision
    };
    return encodeMessage("snapshot", compactSnapshot(snapshot));
  }

  recordSnapshotSend(room, payload) {
    room.networkStats.bytes += Buffer.byteLength(payload);
    room.networkStats.snapshots += 1;
  }

  sendFullSnapshot(room, player) {
    const socket = player?.socket;
    if (!room.simulation || socket?.readyState !== 1) return false;
    if ((Number(socket.bufferedAmount) || 0) > SNAPSHOT_BACKPRESSURE_LIMIT_BYTES) {
      player.needsFullSnapshot = true;
      room.networkStats.snapshotDrops += 1;
      return false;
    }
    const payload = this.snapshotPayload(room, "full");
    if (!safeSend(socket, payload)) {
      player.needsFullSnapshot = true;
      room.networkStats.snapshotDrops += 1;
      return false;
    }
    player.needsFullSnapshot = false;
    this.recordSnapshotSend(room, payload);
    return true;
  }

  broadcastSnapshot(room, { forceFull = false } = {}) {
    if (!room.simulation) return 0;
    const baselineInterval = SIMULATION_CONSTANTS.FULL_FOOD_SNAPSHOT_INTERVAL_TICKS || 100;
    const baselineTick = forceFull || room.simulation.tick % baselineInterval === 0;
    let fullPayload = null;
    let deltaPayload = null;
    let sent = 0;

    try {
      for (const player of room.players.values()) {
        const socket = player.socket;
        if (!player.connected || socket?.readyState !== 1) continue;
        if ((Number(socket.bufferedAmount) || 0) > SNAPSHOT_BACKPRESSURE_LIMIT_BYTES) {
          player.needsFullSnapshot = true;
          room.networkStats.snapshotDrops += 1;
          continue;
        }

        const needsFull = baselineTick || player.needsFullSnapshot;
        if (needsFull && fullPayload == null) fullPayload = this.snapshotPayload(room, "full");
        if (!needsFull && deltaPayload == null) deltaPayload = this.snapshotPayload(room, "delta");
        const payload = needsFull ? fullPayload : deltaPayload;
        if (!safeSend(socket, payload)) {
          player.needsFullSnapshot = true;
          room.networkStats.snapshotDrops += 1;
          continue;
        }
        if (needsFull) player.needsFullSnapshot = false;
        this.recordSnapshotSend(room, payload);
        sent += 1;
      }
    } finally {
      room.simulation.clearFoodDelta();
    }
    return sent;
  }

  runRoomLoop(room, now = this.now()) {
    if (room.state !== ROOM_STATES.RUNNING || !room.simulation || !room.loopState) return 0;
    const loop = room.loopState;
    const elapsed = Number.isFinite(now) && now >= loop.lastWallTime ? now - loop.lastWallTime : 0;
    loop.lastWallTime = Number.isFinite(now) ? now : loop.lastWallTime;
    loop.accumulator += elapsed;
    const maximumAccumulator = STEP_MS * MAX_CATCH_UP_STEPS;
    if (loop.accumulator > maximumAccumulator) {
      const skipped = loop.accumulator - maximumAccumulator;
      loop.accumulator = maximumAccumulator;
      loop.simulationTime += skipped;
      room.networkStats.skippedSimulationMs += skipped;
      room.networkStats.catchUpClamps += 1;
    }

    let steps = 0;
    while (loop.accumulator >= STEP_MS && steps < MAX_CATCH_UP_STEPS && !room.simulation.finished) {
      loop.accumulator -= STEP_MS;
      loop.simulationTime += STEP_MS;
      room.simulation.step(loop.simulationTime);
      this.broadcastSnapshot(room);
      steps += 1;
    }

    room.networkStats.tickDrift = Math.max(0, Math.round(loop.accumulator * 10) / 10);
    room.networkStats.maxTickDrift = Math.max(room.networkStats.maxTickDrift, room.networkStats.tickDrift);
    if (room.simulation.finished) this.finishRoom(room);
    return steps;
  }

  finishRoom(room) {
    if (room.state !== ROOM_STATES.RUNNING) return;
    room.state = ROOM_STATES.FINISHED;
    if (room.interval) clearInterval(room.interval);
    room.interval = null;
    room.loopState = null;
    this.broadcast(room, "event", {
      event: "match-finished",
      data: {
        reason: room.simulation.finishReason,
        winnerId: room.simulation.winnerId,
        ranking: room.simulation.ranking().slice(0, 8),
        returnInMs: RETURN_TO_LOBBY_MS
      }
    });
    room.finishTimer = setTimeout(() => this.returnRoomToLobby(room), RETURN_TO_LOBBY_MS);
    room.finishTimer.unref?.();
    this.emit("rooms-changed");
  }

  returnRoomToLobby(room) {
    if (!room || room.state !== ROOM_STATES.FINISHED || this.rooms.get(room.code) !== room) return false;
    if (room.finishTimer) clearTimeout(room.finishTimer);
    room.finishTimer = null;
    const connectedHost = [...room.players.values()].find(player => player.host && player.connected);
    if (!connectedHost) return this.closeRoom(room.code, "host-left");
    room.state = ROOM_STATES.LOBBY;
    room.simulation = null;
    room.matchId = "";
    room.baselineId = "";
    for (const player of room.players.values()) {
      player.ready = false;
      player.needsFullSnapshot = true;
    }
    this.broadcastLobby(room);
    return true;
  }

  leave(connection) {
    if (connection.voluntaryLeave || !connection.joined || !connection.player) return;
    connection.voluntaryLeave = true;
    const { room, player, socket } = connection;
    if (player.host) {
      this.closeRoom(room.code, "host-left");
      return;
    }

    if (player.removalTimer) clearTimeout(player.removalTimer);
    player.removalTimer = null;
    player.socket = null;
    player.connected = false;
    player.ready = false;
    player.resumeToken = secureToken();
    if (room.simulation) room.simulation.setConnected(player.id, false);
    room.players.delete(player.id);
    this.broadcastLobby(room);
    this.scheduleEmptyRoomCleanup(room);
    socketClose(socket, 1000, "player-left");
  }

  disconnect(connection) {
    if (connection.voluntaryLeave || !connection.joined || !connection.player) return;
    const { room, player } = connection;
    if (player.socket !== connection.socket) return;
    player.socket = null;
    player.connected = false;
    player.ready = false;
    player.disconnectedAt = this.now();
    if (room.simulation) room.simulation.setConnected(player.id, false);
    if (player.removalTimer) clearTimeout(player.removalTimer);
    const graceMs = room.state === ROOM_STATES.LOBBY ? LOBBY_DISCONNECT_GRACE_MS : MATCH_DISCONNECT_GRACE_MS;
    player.removalTimer = setTimeout(() => {
      player.removalTimer = null;
      if (player.connected) return;
      if (room.state === ROOM_STATES.LOBBY) room.players.delete(player.id);
      if (player.host && room.state !== ROOM_STATES.RUNNING) {
        this.closeRoom(room.code, "host-left");
        return;
      }
      this.broadcastLobby(room);
      this.scheduleEmptyRoomCleanup(room);
    }, graceMs);
    player.removalTimer.unref?.();
    this.broadcastLobby(room);
    this.scheduleEmptyRoomCleanup(room);
  }

  scheduleEmptyRoomCleanup(room) {
    if ([...room.players.values()].some(player => player.connected)) {
      if (room.closeTimer) clearTimeout(room.closeTimer);
      room.closeTimer = null;
      return;
    }
    if (room.closeTimer) return;
    room.closeTimer = setTimeout(() => this.closeRoom(room.code, "empty-room"), EMPTY_ROOM_TTL_MS);
    room.closeTimer.unref?.();
  }

  deleteRoom(code, hostToken) {
    const room = this.getRoom(code);
    if (!room) return false;
    if (!hostToken || hostToken !== room.hostToken) throw new ProtocolError("host-token-required", "房主令牌无效");
    return this.closeRoom(room.code, "host-closed");
  }

  closeRoom(code, reason = "server-closed") {
    const room = this.getRoom(code);
    if (!room || room.state === ROOM_STATES.CLOSED) return false;
    room.state = ROOM_STATES.CLOSED;
    if (room.interval) clearInterval(room.interval);
    if (room.closeTimer) clearTimeout(room.closeTimer);
    if (room.finishTimer) clearTimeout(room.finishTimer);
    room.interval = null;
    room.loopState = null;
    room.closeTimer = null;
    room.finishTimer = null;
    this.broadcast(room, "error", { code: reason, message: reason === "host-left" ? "房主已离线" : "房间已关闭" });
    for (const player of room.players.values()) {
      if (player.removalTimer) clearTimeout(player.removalTimer);
      socketClose(player.socket, 1001, reason);
    }
    room.players.clear();
    this.rooms.delete(room.code);
    this.emit("rooms-changed");
    return true;
  }

  stats() {
    let connections = 0;
    let bytes = 0;
    let snapshots = 0;
    let snapshotDrops = 0;
    let tickDrift = 0;
    let skippedSimulationMs = 0;
    let catchUpClamps = 0;
    for (const room of this.rooms.values()) {
      connections += [...room.players.values()].filter(player => player.connected).length;
      bytes += room.networkStats.bytes;
      snapshots += room.networkStats.snapshots;
      snapshotDrops += room.networkStats.snapshotDrops;
      tickDrift = Math.max(tickDrift, room.networkStats.tickDrift);
      skippedSimulationMs += room.networkStats.skippedSimulationMs;
      catchUpClamps += room.networkStats.catchUpClamps;
    }
    return {
      rooms: this.rooms.size,
      connections,
      runningRooms: [...this.rooms.values()].filter(room => room.state === ROOM_STATES.RUNNING).length,
      bytes,
      snapshots,
      snapshotDrops,
      tickDrift,
      skippedSimulationMs,
      catchUpClamps,
      protocol: PROTOCOL_VERSION
    };
  }

  async close() {
    for (const code of [...this.rooms.keys()]) this.closeRoom(code, "server-shutdown");
    this.removeAllListeners();
  }
}

export {
  ROOM_STATES,
  DISCONNECT_GRACE_MS,
  LOBBY_DISCONNECT_GRACE_MS,
  MATCH_DISCONNECT_GRACE_MS,
  SNAPSHOT_BACKPRESSURE_LIMIT_BYTES,
  MAX_CATCH_UP_STEPS,
  RETURN_TO_LOBBY_MS
};
