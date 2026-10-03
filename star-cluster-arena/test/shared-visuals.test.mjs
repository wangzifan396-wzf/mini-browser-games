import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);

async function source(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

function recordingContext() {
  const calls = [];
  const gradient = { addColorStop: (...values) => calls.push(["addColorStop", ...values]) };
  const context = new Proxy({
    calls,
    createRadialGradient: (...values) => {
      calls.push(["createRadialGradient", ...values]);
      return gradient;
    }
  }, {
    get(target, property) {
      if (property in target) return target[property];
      return (...values) => calls.push([String(property), ...values]);
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
  return context;
}

test("single and multiplayer load and call one cosmetic renderer", async () => {
  const [singleHtml, multiplayerHtml, singleClient, multiplayerClient] = await Promise.all([
    source("frontend/index.html"),
    source("frontend/multiplayer.html"),
    source("frontend/js/game.js"),
    source("frontend/js/multiplayer.js")
  ]);
  assert.match(singleHtml, /js\/cosmetic-renderer\.js/);
  assert.match(multiplayerHtml, /js\/cosmetic-renderer\.js/);
  assert.match(singleClient, /sharedCosmeticRenderer\.drawSkin/);
  assert.match(singleClient, /sharedCosmeticRenderer\.drawHalo/);
  assert.match(singleClient, /sharedCosmeticRenderer\.drawTrail/);
  assert.match(multiplayerClient, /cosmeticRenderer\.drawSkin/);
  assert.match(multiplayerClient, /cosmeticRenderer\.drawHalo/);
  assert.match(multiplayerClient, /cosmeticRenderer\.drawTrail/);
  for (const method of ["drawCellBody", "drawCellLabel", "drawEjected"]) {
    assert.ok(singleClient.includes(`sharedCosmeticRenderer.${method}`), `single ${method}`);
    assert.ok(multiplayerClient.includes(`cosmeticRenderer.${method}`), `multiplayer ${method}`);
  }
});

test("shared cosmetic renderer covers special skin, halo and trail patterns", async () => {
  const context = { Math };
  context.globalThis = context;
  vm.runInNewContext(await source("frontend/js/cosmetic-renderer.js"), context);
  const canvas = recordingContext();
  const common = {
    context: canvas,
    x: 120,
    y: 90,
    radius: 42,
    worldRadius: 60,
    splitCount: 1,
    now: 1500,
    lineScale: 1,
    lowQuality: false,
    baseColor: "#44d7b6"
  };
  assert.equal(context.ScaCosmeticRenderer.drawSkin({ ...common, definition: { type: "special", pattern: "flare", color: "#ef4444", accent: "#ffd166", tier: "epic" } }), true);
  assert.equal(context.ScaCosmeticRenderer.drawHalo({ ...common, definition: { type: "special", pattern: "gravity", color: "#111827", accent: "#c084fc" } }), true);
  assert.equal(context.ScaCosmeticRenderer.drawTrail({ ...common, vx: 90, vy: 30, definition: { type: "special", pattern: "petals", color: "#f472b6", accent: "#fff1f2" } }), true);
  assert.ok(canvas.calls.some(call => call[0] === "arc"));
  assert.ok(canvas.calls.some(call => call[0] === "ellipse"));
  assert.ok(canvas.calls.some(call => call[0] === "stroke"));
  assert.ok(canvas.calls.some(call => call[0] === "fill"));
});

test("small split-cell labels can retain mass without repeating the full name", async () => {
  const context = { Math };
  context.globalThis = context;
  vm.runInNewContext(await source("frontend/js/cosmetic-renderer.js"), context);
  const canvas = recordingContext();
  assert.equal(context.ScaCosmeticRenderer.drawCellLabel({ context: canvas, x: 40, y: 40, radius: 40, mass: 101.2, name: "Player", own: true, showName: false }), true);
  const text = canvas.calls.filter(call => call[0] === "fillText");
  assert.equal(text.length, 1);
  assert.equal(text[0][1], 101);
});

test("low-quality large AI cells do not restore expensive glow effects", async () => {
  const context = { Math };
  context.globalThis = context;
  vm.runInNewContext(await source("frontend/js/cosmetic-renderer.js"), context);
  const canvas = recordingContext();
  const blur = [];
  Object.defineProperty(canvas, "shadowBlur", { configurable: true, set: value => blur.push(value) });
  context.ScaCosmeticRenderer.drawCellBody({ context: canvas, x: 100, y: 100, radius: 200, color: "#44d7b6", lowQuality: true });
  assert.ok(blur.every(value => value === 0));
  assert.ok(canvas.calls.some(call => call[0] === "createRadialGradient"), "retain material shading");
});

test("dark navigation transition covers the old page before committing", async () => {
  const elements = new Map();
  const body = {
    appendChild(element) {
      elements.set(element.id, element);
    }
  };
  const documentElement = { dataset: {} };
  const document = {
    body,
    documentElement,
    getElementById: id => elements.get(id) || null,
    createElement: () => ({ style: {}, setAttribute() {}, getBoundingClientRect: () => ({}) })
  };
  let destination = "";
  const context = {
    document,
    location: { assign: value => { destination = value; } },
    requestAnimationFrame: callback => callback(),
    setTimeout: () => 1
  };
  context.globalThis = context;
  vm.runInNewContext(await source("frontend/js/page-transition.js"), context);
  assert.equal(context.ScaPageTransition.navigate("http://127.0.0.1:25555/multiplayer.html"), true);
  const curtain = elements.get("scaNavigationCurtain");
  assert.equal(curtain.style.opacity, "1");
  assert.match(curtain.style.cssText, /background:#061015/);
  assert.equal(destination, "http://127.0.0.1:25555/multiplayer.html");
  assert.equal(documentElement.dataset.scaNavigating, "true");
});

test("both HTML entry points establish a dark first paint", async () => {
  const [singleHtml, multiplayerHtml] = await Promise.all([
    source("frontend/index.html"),
    source("frontend/multiplayer.html")
  ]);
  for (const html of [singleHtml, multiplayerHtml]) {
    assert.match(html, /name="color-scheme" content="dark"/);
    assert.match(html, /html,body\{[^}]*background:#061015/);
    assert.match(html, /js\/page-transition\.js/);
  }
});
