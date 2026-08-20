import test from "node:test";
import assert from "node:assert/strict";
import { summarizeFirewallRules } from "../backend/multiplayer/windows-network-diagnostics.mjs";

const base = { Enabled: true, Direction: "Inbound", Profile: "Private" };

test("an enabled inbound block rule wins over allow rules", () => {
  const result = summarizeFirewallRules([
    { ...base, Action: "Allow", Protocol: "TCP" },
    { ...base, Action: "Allow", Protocol: "UDP" },
    { ...base, Action: "Block", Protocol: "TCP" }
  ]);
  assert.equal(result.status, "blocked");
  assert.equal(result.blockedRules, 1);
});

test("private TCP and UDP allow rules produce an allowed diagnosis", () => {
  const result = summarizeFirewallRules([
    { ...base, Action: "Allow", Protocol: "TCP" },
    { ...base, Action: "Allow", Protocol: "UDP" }
  ]);
  assert.equal(result.status, "allowed");
});

test("missing or partial rules require a first-run permission prompt", () => {
  assert.equal(summarizeFirewallRules([]).status, "missing");
  assert.equal(summarizeFirewallRules([{ ...base, Action: "Allow", Protocol: "TCP" }]).status, "missing");
});

test("numeric Windows firewall enums are interpreted correctly", () => {
  assert.equal(summarizeFirewallRules([
    { Enabled: 1, Direction: 1, Action: 4, Profile: 2, Protocol: "TCP" }
  ]).status, "blocked");
  assert.equal(summarizeFirewallRules([
    { Enabled: 1, Direction: 1, Action: 2, Profile: 2, Protocol: "TCP" },
    { Enabled: 1, Direction: 1, Action: 2, Profile: 2, Protocol: "UDP" }
  ]).status, "allowed");
});
