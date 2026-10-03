import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const executable = process.env.SCA_PACKAGED_EXE ? resolve(process.env.SCA_PACKAGED_EXE) : null;
if (executable) await access(executable);
const jobs = [
  { name: "release", flags: { SCA_DESKTOP_SMOKE_RELEASE: "1", SCA_DESKTOP_SMOKE_GAMEPLAY_MODE: "battle", SCA_DESKTOP_SMOKE_DURATION: "8" } },
  { name: "display", flags: { SCA_DESKTOP_SMOKE_DISPLAY: "1" } },
  { name: "navigation", flags: { SCA_DESKTOP_SMOKE_NAVIGATION: "1" } }
];
const results = [];
const repetitions = Math.min(5, Math.max(1, Number.parseInt(process.env.SCA_READINESS_REPEATS || "1", 10) || 1));
for (let iteration = 1; iteration <= repetitions; iteration += 1) for (const job of jobs) {
  console.log(`READINESS_START ${job.name} ${executable ? "packaged" : "source"}`);
  const output = await new Promise((resolveRun, rejectRun) => {
    const env = { ...process.env, SCA_DESKTOP_SMOKE: "1", ...job.flags };
    for (const key of ["ELECTRON_RUN_AS_NODE", "SCA_PERF_VISUAL", "SCA_PERF_DISPLAY_MODE", "SCA_DESKTOP_SMOKE_VISUAL", "SCA_DESKTOP_SMOKE_GAMEPLAY_DISPLAY_MODE"]) delete env[key];
    const child = executable
      ? spawn(executable, [], { cwd: dirname(executable), env, windowsHide: true })
      : spawn(process.execPath, [resolve(root, "node_modules/@electron-forge/cli/dist/electron-forge.js"), "start"], { cwd: root, env, windowsHide: true });
    let stdout = "", stderr = "";
    const timeout = setTimeout(() => { child.kill(); rejectRun(new Error(`${job.name} timed out\n${stdout}\n${stderr}`)); }, 120_000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", error => { clearTimeout(timeout); rejectRun(error); });
    child.once("exit", code => {
      clearTimeout(timeout);
      code === 0 ? resolveRun(stdout) : rejectRun(new Error(`${job.name} failed (${code})\n${stdout}\n${stderr}`));
    });
  });
  const match = output.match(/DESKTOP_SMOKE_OK (\{[^\r\n]+\})/);
  assert.ok(match, `${job.name} completion report missing`);
  const result = { iteration, name: job.name, report: JSON.parse(match[1]) };
  results.push(result);
  console.log(`READINESS_OK ${JSON.stringify(result)}`);
}
const destination = resolve(root, process.env.SCA_READINESS_REPORT || "docs/qa/desktop-readiness-1.0.json");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify({ version: "1.0.0", generatedAt: new Date().toISOString(), executable, results }, null, 2) + "\n");
