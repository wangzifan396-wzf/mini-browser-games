(function (root) {
  "use strict";
  const KEY = "starClusterConnectionV1";
  function serverOrigin(value) {
    let url;
    try { url = new URL(String(value || "").trim()); }
    catch { throw new Error("请填写完整服务地址，例如 https://game.example.com"); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("请使用 http:// 或 https:// 服务地址");
    if (url.pathname !== "/" && url.pathname !== "/multiplayer.html") throw new Error("服务地址不能包含额外路径");
    if (/^(0\.0\.0\.0|\[?::\]?)$/.test(url.hostname)) throw new Error("请填写可连接的服务器地址");
    return url.origin;
  }
  function parseInvite(value) {
    const text = String(value || "").trim();
    if (/^[A-Za-z0-9]{6}$/.test(text)) return { code: text.toUpperCase(), origin: "" };
    const url = new URL(text);
    const origin = serverOrigin(url.href);
    const code = url.searchParams.get("room") || "";
    if (!/^[A-Za-z0-9]{6}$/.test(code)) throw new Error("邀请链接缺少完整的 6 位房间码");
    return { origin, code: code.toUpperCase() };
  }
  function load() {
    try {
      const saved = JSON.parse((root.ScaStorage || root.localStorage)?.getItem(KEY) || "null");
      return saved?.mode === "internet" ? { mode: "internet", origin: saved.origin ? serverOrigin(saved.origin) : "" } : { mode: "lan", origin: "" };
    } catch { return { mode: "lan", origin: "" }; }
  }
  function save(profile) {
    const result = { mode: profile.mode === "internet" ? "internet" : "lan", origin: profile.origin ? serverOrigin(profile.origin) : "" };
    try { (root.ScaStorage || root.localStorage)?.setItem(KEY, JSON.stringify(result)); } catch {}
    return result;
  }
  function inviteLink(origin, code) {
    const url = new URL("/multiplayer.html", serverOrigin(origin));
    url.searchParams.set("room", code);
    return url.href;
  }
  root.ScaConnectionProfile = Object.freeze({ serverOrigin, parseInvite, inviteLink, load, save });
})(typeof globalThis !== "undefined" ? globalThis : window);
