(function attachProgression(scope) {
  "use strict";
  const bounded = (value, fallback, minimum, maximum) => Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : fallback));
  function matchReward({ rank = 99, peakMass = 0, kills = 0, controlScore = 0, demon = false, demonWin = false, forgeLevel = 1, multiplier = 1 } = {}) {
    const rankBonus = Math.max(0, 30 - bounded(rank, 99, 1, 100) * 4);
    const massBonus = Math.min(42, Math.floor(bounded(peakMass, 0, 0, 1e9) / 120));
    const killBonus = Math.min(36, bounded(kills, 0, 0, 1000) * 5);
    const controlBonus = Math.min(28, Math.floor(bounded(controlScore, 0, 0, 100000) / 8));
    const demonBonus = demon ? demonWin ? 140 : 45 : 0;
    return Math.max(10, Math.round((14 + rankBonus + massBonus + killBonus + controlBonus + demonBonus + bounded(forgeLevel, 1, 1, 100) * 2) * bounded(multiplier, 1, 1, 10)));
  }
  function grantLocalReward(storage, matchId, stats) {
    if (typeof matchId !== "string" || !matchId || matchId.length > 128) return 0;
    try {
      const meta = JSON.parse(storage.getItem("ballArenaMeta") || "null");
      if (!meta || typeof meta !== "object" || Array.isArray(meta)) return 0;
      const completed = Array.isArray(meta.completedOnlineMatches) ? meta.completedOnlineMatches.filter(id => typeof id === "string").slice(-63) : [];
      if (completed.includes(matchId)) return 0;
      const reward = matchReward({ ...stats, forgeLevel: meta.forgeLevel || 1 });
      storage.setItem("ballArenaMeta", JSON.stringify({ ...meta, dust: bounded(meta.dust, 0, 0, 100_000_000 - reward) + reward, totalDust: bounded(meta.totalDust, 0, 0, 100_000_000 - reward) + reward, completedOnlineMatches: [...completed, matchId] }));
      return reward;
    } catch { return 0; }
  }
  scope.ScaProgression = Object.freeze({ matchReward, grantLocalReward });
})(typeof globalThis !== "undefined" ? globalThis : window);
