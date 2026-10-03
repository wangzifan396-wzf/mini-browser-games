import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { createProfileStore } from "../desktop/profile-store.mjs";

test("desktop saves survive port changes, reject unknown keys and recover from a corrupt main file", async t => {
  const directory = await mkdtemp(join(tmpdir(), "sca-profile-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createProfileStore(directory, { logger: {} });
  assert.equal(store.set("ballArenaSkin", "dragon"), true);
  assert.equal(store.set("hostToken", "secret"), false);
  assert.equal(store.set("ballArenaMeta", "x".repeat(65 * 1024)), false);
  await store.flush();
  assert.equal(JSON.parse(await readFile(join(directory, "profile.json"), "utf8")).values.ballArenaSkin, "dragon");
  store.set("ballArenaSkin", "aqua"); await store.flush();
  await writeFile(join(directory, "profile.json"), "broken", "utf8");
  const recovered = await createProfileStore(directory, { logger: {} });
  assert.equal(recovered.snapshot().ballArenaSkin, "dragon");
});

test("browser storage remains usable when localStorage throws", async () => {
  const source = await readFile(new URL("../frontend/js/safe-storage.js", import.meta.url), "utf8");
  const context = vm.createContext({ get localStorage() { throw new Error("denied"); } });
  vm.runInContext(source, context);
  context.ScaStorage.setItem("ballArenaSkin", "aqua");
  assert.equal(context.ScaStorage.getItem("ballArenaSkin"), "aqua");
  assert.equal(context.ScaStorage.getItem("missing"), null);
});

test("legacy browser profile migrates while stable desktop values take precedence", async () => {
  const source = await readFile(new URL("../frontend/js/safe-storage.js", import.meta.url), "utf8");
  const writes = [];
  const context = vm.createContext({
    localStorage: { getItem: key => key === "ballArenaSkin" ? "aqua" : "mint", setItem() {} },
    starClusterDesktop: { loadProfile: () => ({ ballArenaSkin: "dragon" }), saveProfileValue: (key, value) => writes.push([key, value]) }
  });
  vm.runInContext(source, context);
  assert.equal(context.ScaStorage.getItem("ballArenaSkin"), "dragon");
  assert.equal(context.ScaStorage.getItem("ballArenaSpore"), "mint");
  assert.deepEqual(writes, [["ballArenaSpore", "mint"]]);
});
