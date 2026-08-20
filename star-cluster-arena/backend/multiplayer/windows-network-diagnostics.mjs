import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function normalizedBoolean(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}

function includesPrivateProfile(value) {
  if (typeof value === "number") return value === 0 || (value & 2) === 2;
  const text = String(value ?? "").toLowerCase();
  return text.includes("private") || text.includes("any") || text === "0";
}

function isInboundDirection(value) {
  return value === 1 || String(value).toLowerCase().includes("inbound");
}

function normalizedAction(value) {
  if (value === 4) return "block";
  if (value === 2) return "allow";
  return String(value ?? "").toLowerCase();
}

function normalizedProtocol(value) {
  const text = String(value ?? "").toLowerCase();
  if (text === "6" || text.includes("tcp")) return "tcp";
  if (text === "17" || text.includes("udp")) return "udp";
  if (text.includes("any") || text === "256") return "any";
  return text;
}

export function summarizeFirewallRules(rules = []) {
  const inbound = rules.filter(rule => normalizedBoolean(rule.Enabled) && isInboundDirection(rule.Direction) && includesPrivateProfile(rule.Profile));
  const blocked = inbound.filter(rule => normalizedAction(rule.Action).includes("block"));
  const allowed = inbound.filter(rule => normalizedAction(rule.Action).includes("allow"));
  const allowedProtocols = new Set(allowed.map(rule => normalizedProtocol(rule.Protocol)));
  const completeAllow = allowedProtocols.has("any") || (allowedProtocols.has("tcp") && allowedProtocols.has("udp"));

  if (blocked.length) {
    return {
      status: "blocked",
      message: "Windows 防火墙正在阻止此版本接收入站连接，当前电脑无法可靠作为房主。",
      ruleCount: inbound.length,
      blockedRules: blocked.length
    };
  }
  if (completeAllow) {
    return {
      status: "allowed",
      message: "Windows 防火墙已允许专用网络上的 TCP 与 UDP 联机。",
      ruleCount: inbound.length,
      blockedRules: 0
    };
  }
  return {
    status: "missing",
    message: "尚未发现完整的专用网络入站允许规则；首次建房时请在系统提示中允许专用网络。",
    ruleCount: inbound.length,
    blockedRules: 0
  };
}

export async function inspectWindowsFirewall({
  executablePath = process.execPath,
  platform = process.platform,
  timeoutMs = 4000,
  logger = console
} = {}) {
  if (platform !== "win32") {
    return { status: "unknown", message: "当前系统不是 Windows，未执行 Windows 防火墙检查。", ruleCount: 0, blockedRules: 0 };
  }

  const script = [
    "$items = @()",
    "$filters = Get-NetFirewallApplicationFilter -PolicyStore ActiveStore -ErrorAction SilentlyContinue",
    "foreach ($filter in $filters) {",
    "  if ([string]::Equals($filter.Program, $env:SCA_EXE_PATH, [System.StringComparison]::OrdinalIgnoreCase)) {",
    "    $rules = @(Get-NetFirewallRule -AssociatedNetFirewallApplicationFilter $filter -PolicyStore ActiveStore -ErrorAction SilentlyContinue)",
    "    foreach ($rule in $rules) {",
    "      $ports = @(Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule -ErrorAction SilentlyContinue)",
    "      if ($ports.Count -eq 0) { $items += [pscustomobject]@{ Enabled=$rule.Enabled; Direction=$rule.Direction; Action=$rule.Action; Profile=$rule.Profile; Protocol='Any' } }",
    "      foreach ($port in $ports) { $items += [pscustomobject]@{ Enabled=$rule.Enabled; Direction=$rule.Direction; Action=$rule.Action; Profile=$rule.Profile; Protocol=$port.Protocol } }",
    "    }",
    "  }",
    "}",
    "ConvertTo-Json -Compress -InputObject @($items)"
  ].join("; ");

  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      env: { ...process.env, SCA_EXE_PATH: executablePath }
    });
    const parsed = JSON.parse(stdout.trim() || "[]");
    return summarizeFirewallRules(Array.isArray(parsed) ? parsed : [parsed]);
  } catch (error) {
    logger.warn?.(`Windows firewall diagnostics unavailable: ${error.message}`);
    return { status: "unknown", message: "无法读取 Windows 防火墙状态，请手动确认已允许专用网络。", ruleCount: 0, blockedRules: 0 };
  }
}
