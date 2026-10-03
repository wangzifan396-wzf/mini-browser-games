import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractFile, listPackage } from "@electron/asar";

// Static verification only: never launch a window or change the player's data.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
assert.ok(process.env.SCA_PACKAGED_EXE, "Set SCA_PACKAGED_EXE to the extracted portable executable");
const executable = resolve(process.env.SCA_PACKAGED_EXE);
const bundleRoot = dirname(executable);
const archive = join(bundleRoot, "resources/app.asar");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const excluded = new Set(["desktop/forge.config.mjs", "desktop/electron-builder.yml"]);
const requiredRuntime = ["StarClusterArena.exe", "resources/app.asar", "icudtl.dat", "resources.pak", "v8_context_snapshot.bin", "ffmpeg.dll", "d3dcompiler_47.dll", "locales/zh-CN.pak", "LICENSE.electron.txt", "LICENSES.chromium.html"];
for (const relative of requiredRuntime) assert.ok((await stat(join(bundleRoot, relative))).size > 0, `Empty runtime file: ${relative}`);
await access(archive);

async function collect(relative) {
  const result = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const child = `${relative}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await collect(child));
    else if (entry.isFile() && !excluded.has(child)) result.push(child);
  }
  return result;
}
const files = ["LICENSE", "THIRD-PARTY-NOTICES.md"];
for (const directory of ["backend", "frontend", "desktop"]) files.push(...await collect(directory));
const checked = [];
for (const relative of files.sort()) {
  const expected = await readFile(join(root, relative));
  const actual = extractFile(archive, normalize(relative));
  assert.equal(digest(actual), digest(expected), `Stale or missing source in portable bundle: ${relative}`);
  checked.push({ file: relative, bytes: actual.length, sha256: digest(actual) });
}
const packagedMetadata = JSON.parse(extractFile(archive, "package.json").toString("utf8"));
// electron-builder intentionally omits build scripts and devDependencies.
const sourceMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
for (const key of ["keywords", "scripts", "devDependencies"]) delete sourceMetadata[key];
assert.deepEqual(packagedMetadata, sourceMetadata, "Packaged runtime metadata differs from source");
assert.equal(packagedMetadata.version, "1.0.0");
const entries = listPackage(archive).map(entry => entry.replaceAll("\\", "/"));
assert.ok(entries.some(entry => entry.endsWith("/node_modules/ws/LICENSE")), "ws license missing");
assert.ok(!entries.some(entry => /\/node_modules\/(electron-builder|@electron-forge)\//.test(entry)), "Development build chain shipped to players");
const report = {
  version: packagedMetadata.version,
  generatedAt: new Date().toISOString(),
  passed: true,
  note: "Static byte-for-byte comparison against current runtime source; not a foreground FPS, clean-machine installation, or cross-city test.",
  executable,
  archiveSha256: digest(await readFile(archive)),
  metadataChecked: true,
  requiredRuntime,
  checked
};
const destination = resolve(root, process.env.SCA_BUNDLE_REPORT || "docs/qa/portable-bundle-1.0.json");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(`BUNDLE_OK ${checked.length} runtime files match current source; licenses and portable runtime present.`);
