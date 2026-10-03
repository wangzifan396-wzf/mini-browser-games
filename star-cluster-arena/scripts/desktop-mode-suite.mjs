import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MODE_KEYS } from "../backend/multiplayer/modes.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const modes = process.env.SCA_QA_MODES ? process.env.SCA_QA_MODES.split(",") : MODE_KEYS;
const sessions = process.env.SCA_QA_SESSION ? [process.env.SCA_QA_SESSION] : ["single", "multiplayer"];
const durationSeconds = Math.min(300, Math.max(8, Math.round(Number(process.env.SCA_QA_DURATION) || 16)));
assert.ok(modes.every(mode => MODE_KEYS.includes(mode)));
assert.ok(sessions.every(session => ["single", "multiplayer"].includes(session)));
const results = [];
for (const session of sessions) for (const mode of modes) {
  console.log(`DESKTOP_MODE_START ${session} ${mode}`);
  const output = await new Promise((resolveRun, rejectRun) => {
    const env = { ...process.env, SCA_PERF_MODE: mode, SCA_PERF_DURATION: String(durationSeconds), SCA_PERF_MULTIPLAYER: session === "multiplayer" ? "1" : "0" };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.SCA_DESKTOP_SMOKE_RELEASE;
    const child = spawn(process.execPath, [resolve(root, "scripts/desktop-performance-smoke.mjs")], { cwd: root, env, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk;
      if (process.env.SCA_PERF_STREAM === "1") process.stdout.write(chunk);
    });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("exit", code => resolveRun({ code, stdout, stderr }));
  });
  const match = output.stdout.match(/DESKTOP_SMOKE_(?:OK|FAILED) (\{[^\r\n]+\})/);
  if (output.code !== 0) {
    if (process.env.SCA_QA_REPORT) {
      const target = resolve(root, process.env.SCA_QA_REPORT);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, JSON.stringify({ version: "1.0.0", generatedAt: new Date().toISOString(), durationSeconds, passed: false, results, failure: { session, mode, code: output.code, state: match ? JSON.parse(match[1]) : null, diagnostics: output.stderr.slice(-4000) } }, null, 2) + "\n", "utf8");
    }
    throw new Error(`${session}/${mode} failed (${output.code})\n${output.stdout}\n${output.stderr}`);
  }
  assert.ok(match, `${session}/${mode} has no completed desktop report`);
  const result = JSON.parse(match[1]);
  const entry = { session, mode, ...result.gameplay.summary, refresh: Number(result.refresh), renderer: result.renderer || "Canvas 2D", runtime: result.runtime, nativeStart: result.nativeStart, nativeEnd: result.nativeEnd, samples: result.gameplay.samples };
  results.push(entry);
  console.log(`DESKTOP_MODE_OK ${JSON.stringify({ session, mode, ...result.gameplay.summary })}`);
}
const report = { version: "1.0.0", generatedAt: new Date().toISOString(), durationSeconds, passed: true, note: "Sequential fresh Electron processes on this machine; multiplayer uses two local clients, not a cross-city test. nativeStart/nativeEnd identify foreground and display conditions.", results };
if (process.env.SCA_QA_REPORT) {
  const target = resolve(root, process.env.SCA_QA_REPORT);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(report, null, 2) + "\n", "utf8");
}
console.table(results.map(({ session, mode, steadyAverageFps, steadyMinimumFps, maximumWorkMs, averageSnapshotHz }) => ({ session, mode, steadyAverageFps, steadyMinimumFps, maximumWorkMs, averageSnapshotHz })));
