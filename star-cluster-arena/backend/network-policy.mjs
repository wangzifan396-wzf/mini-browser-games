import { isIP } from "node:net";

export function normalizePublicUrl(value) {
  if (!value) return "";
  const url = new URL(String(value));
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("PUBLIC_URL 必须是完整的 http/https 服务地址，不能包含路径、密码或参数");
  }
  return url.origin;
}

export function isLocalHostname(hostname) {
  const host = String(hostname).replace(/^\[|\]$/g, "").toLowerCase();
  return ["localhost", "127.0.0.1", "::1"].includes(host) || (isIP(host) === 4 && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host));
}

export function originAllowed(origin, { publicUrl = "", allowedOrigins = [] } = {}) {
  if (!origin) return true; // 原生客户端、运维 CLI 不携带浏览器 Origin。
  if (origin === "null") return false;
  try {
    const url = new URL(normalizePublicUrl(origin));
    // Host is controlled by the requester. Reflecting it here would let an
    // unrelated / rebinding website authorize itself for the local service.
    return isLocalHostname(url.hostname) || url.origin === publicUrl || allowedOrigins.includes(url.origin);
  } catch { return false; }
}

export function socketEndpoint(origin, code) {
  const url = new URL(origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.searchParams.set("room", code);
  return url.href;
}
