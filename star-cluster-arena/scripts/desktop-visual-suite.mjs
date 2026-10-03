import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const results = [];
for (const displayMode of ["windowed", "borderless-fullscreen"]) {
  console.log(`VISUAL_START ${displayMode}`);
  const output = await new Promise((resolveRun, rejectRun) => {
    const env = { ...process.env, SCA_PERF_VISUAL: "1", SCA_PERF_DURATION: "300", SCA_PERF_MODE: "solo", SCA_PERF_DISPLAY_MODE: displayMode };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.SCA_DESKTOP_SMOKE_RELEASE;
    delete env.SCA_PERF_MULTIPLAYER;
    const child = spawn(process.execPath, [resolve(root, "scripts/desktop-performance-smoke.mjs")], { cwd: root, env, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; }); child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", rejectRun);
    child.once("exit", code => code === 0 ? resolveRun(stdout) : rejectRun(new Error(`${displayMode} (${code})\n${stdout}\n${stderr}`)));
  });
  const match = output.match(/DESKTOP_SMOKE_OK (\{[^\r\n]+\})/);
  if (!match) throw new Error("Visual report missing");
  const report = JSON.parse(match[1]);
  const result = { displayMode, durationSeconds: 300, visual: report.visual, gameplay: report.gameplay.summary, renderer: report.renderer };
  results.push(result); console.log(`VISUAL_OK ${JSON.stringify(result)}`);
}
await mkdir(resolve(root, "docs/qa"), { recursive: true });
await writeFile(resolve(root, "docs/qa/desktop-visual-1.0.json"), JSON.stringify({ version: "1.0.0", generatedAt: new Date().toISOString(), executable: process.env.SCA_PACKAGED_EXE || null, note: "Composition sampling adds capture overhead; use fullscreen-performance-1.0.json for a no-capture measurement.", results }, null, 2) + "\n");
