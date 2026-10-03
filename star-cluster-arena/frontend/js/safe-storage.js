(function (root) {
  "use strict";
  const cache = new Map();
  const persistent = new Set(["ballArenaMeta", "ballArenaSkin", "ballArenaSpore", "ballArenaHalo", "ballArenaTrail", "ballArenaMusic", "starClusterGameSettingsV1", "starClusterPlayerName", "starClusterConnectionV1", "starClusterHelpSeenV1"]);
  try {
    const values = root.starClusterDesktop?.loadProfile?.() || {};
    for (const [key, value] of Object.entries(values)) if (persistent.has(key) && typeof value === "string") cache.set(key, value);
  } catch {}
  function setItem(key, value) {
    const text = String(value);
    cache.set(key, text);
    try { root.localStorage?.setItem(key, text); } catch {}
    if (persistent.has(key)) { try { root.starClusterDesktop?.saveProfileValue?.(key, text); } catch {} }
  }
  function getItem(key) {
    if (cache.has(key)) return cache.get(key);
    let value = null;
    try { value = root.localStorage?.getItem(key) ?? null; } catch {}
    if (value !== null) setItem(key, value); // Migrate legacy per-port browser saves without erasing them.
    return value;
  }
  root.ScaStorage = Object.freeze({ getItem, setItem });
})(typeof globalThis !== "undefined" ? globalThis : window);
