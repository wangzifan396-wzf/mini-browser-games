(function attachMatchGuide(scope) {
  "use strict";
  let panel = null, timer = null;
  const tips = {
    battle: "优先留在安全区内。被吞噬后可观战，最后存活者获胜。",
    team: "同色是队友，可以接住你的分身。队伍总质量决定名次。",
    survival: "只有 3 条初始生命；吞噬对手可获得生命，耗尽后出局。",
    blitz: "快速吃点发育，留意密集事件与缩圈，强者也能提前制霸。",
    spore: "碰孢子刺会损失一半质量并散落孢子，及时回收或抢夺。",
    screen: "A 快速合球，D 冲刺种刺；保持 88% 区域覆盖 6 秒获胜。",
    giant: "巨球开局，固定圆形战场；保持 88% 区域覆盖 6 秒获胜。",
    control: "进入 A / B / C 星核争夺据点，为队伍积攒 240 分。",
    demon: "你是勇者，和同阵营合作吞掉魔王；魔王也会被普通刺分裂。",
    solo: "可以反复复活。稳步吃点、躲避大球，12 分钟后按质量结算。"
  };
  function hide() { clearTimeout(timer); if (panel) panel.hidden = true; }
  function show(mode, { multiplayer = false, force = false } = {}) {
    if (!scope.document?.body || scope.location?.protocol === "headless:") return false;
    const storage = scope.ScaStorage || scope.localStorage;
    let seen = {};
    try { seen = JSON.parse(storage.getItem("starClusterHelpSeenV1") || "{}"); } catch {}
    if (!seen || Array.isArray(seen) || typeof seen !== "object") seen = {};
    if (seen[mode] && !force) return false;
    if (!panel) {
      panel = document.createElement("aside"); panel.className = "match-guide"; panel.setAttribute("role", "status");
      const heading = document.createElement("strong"), goal = document.createElement("p"), controls = document.createElement("small"), close = document.createElement("button");
      close.textContent = "知道了"; close.type = "button"; close.addEventListener("click", hide);
      panel.append(heading, goal, controls, close); document.body.append(panel);
    }
    panel.children[0].textContent = scope.ScaModeCatalog?.MODES[mode]?.label || "开始游戏";
    panel.children[1].textContent = tips[mode] || tips.solo;
    panel.children[2].textContent = `鼠标移动 · Space 分裂 · W 吐球 / 喂刺 · Esc ${multiplayer ? "菜单（服务器不暂停）" : "暂停"}`;
    panel.hidden = false;
    try { storage.setItem("starClusterHelpSeenV1", JSON.stringify({ ...seen, [mode]: true })); } catch {}
    clearTimeout(timer); timer = setTimeout(hide, 9000);
    return true;
  }
  scope.ScaMatchGuide = Object.freeze({ show, hide });
})(typeof globalThis !== "undefined" ? globalThis : window);
