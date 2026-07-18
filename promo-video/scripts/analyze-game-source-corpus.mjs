import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "..", "..");
const outputDir = path.join(rootDir, "docs", "images", "source-corpus-analysis");
const outputFile = path.join(outputDir, "source-analysis.json");
const sourceRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: rootDir,
  encoding: "utf8",
}).trim();
await mkdir(outputDir, { recursive: true });

const htmlFiles = (await readdir(rootDir))
  .filter(file => file.endsWith(".html"))
  .sort((a, b) => a.localeCompare(b));
const auditMarkdown = await readFile(path.join(rootDir, "GAME_AUDIT.md"), "utf8");

function sectionBetween(source, startPattern, endPattern) {
  const start = source.search(startPattern);
  if (start < 0) return "";
  const tail = source.slice(start);
  const firstLineEnd = tail.indexOf("\n");
  if (firstLineEnd < 0) return tail;
  const body = tail.slice(firstLineEnd + 1);
  const endMatch = body.search(endPattern);
  return endMatch < 0
    ? tail
    : tail.slice(0, firstLineEnd + 1 + endMatch);
}

const ratings = {};
for (const [rating, next] of [["S", "A"], ["A", "B"], ["B", "C"], ["C", "D"], ["D", null]]) {
  const section = sectionBetween(
    auditMarkdown,
    new RegExp(`^### ${rating} 级`, "m"),
    next ? new RegExp(`^### ${next} 级`, "m") : /^## /m,
  );
  for (const match of section.matchAll(/`([^`]+\.html)`/g)) ratings[match[1]] = rating;
}

const featureDefinitions = {
  canvasElement: "Contains a canvas element.",
  canvas2d: "Calls getContext('2d').",
  webgl: "Calls getContext('webgl') or getContext('webgl2').",
  svg: "Contains an inline SVG element outside data URLs.",
  animationFrame: "Uses requestAnimationFrame.",
  intervalTimer: "Uses setInterval.",
  localStorage: "Uses localStorage.",
  jsonSerialization: "Uses JSON.stringify or JSON.parse.",
  exportImportSave: "Contains an explicit save/archive export-import path.",
  saveChecksum: "Contains checksum/hash language near save handling.",
  webAudio: "Uses AudioContext or webkitAudioContext.",
  htmlAudio: "Constructs Audio or contains an audio element.",
  pointerInput: "Uses pointer events.",
  touchInput: "Uses touch events directly.",
  keyboardInput: "Uses keyboard events.",
  mouseInput: "Uses mouse events directly.",
  clickInput: "Uses click listeners or onclick.",
  responsiveCss: "Contains a CSS media query.",
  viewportMeta: "Contains a viewport meta tag.",
  aria: "Contains an ARIA attribute.",
  cssAnimation: "Contains CSS keyframes or animation declarations.",
  cssCustomProperties: "Contains CSS custom properties.",
  gradient: "Uses CSS or Canvas gradients.",
  shadow: "Uses CSS box-shadow or Canvas shadow properties.",
  debugHook: "Exposes a window.__* debug/test hook.",
  typedArray: "Uses a JavaScript typed array.",
  offscreenCanvas: "Uses OffscreenCanvas.",
  worker: "Constructs a Web Worker.",
  fetch: "Calls fetch.",
  clipboard: "Uses the Clipboard API.",
  textEncoding: "Uses TextEncoder or TextDecoder.",
  moduleScript: "Contains a type=module script.",
  externalResource: "Loads an HTTP(S) script or stylesheet.",
};

function test(pattern, source) {
  return pattern.test(source);
}

function extractBlocks(source, tag) {
  const regex = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  return [...source.matchAll(regex)].map(match => match[1]);
}

function detectFeatures(source, js, css) {
  const noDataUrls = source.replace(/data:[^"']+/gi, "");
  return {
    canvasElement: test(/<canvas\b/i, source),
    canvas2d: test(/getContext\s*\(\s*["']2d["']/i, js),
    webgl: test(/getContext\s*\(\s*["'](?:webgl2?|experimental-webgl)["']/i, js),
    svg: test(/<svg\b/i, noDataUrls),
    animationFrame: test(/requestAnimationFrame\s*\(/, js),
    intervalTimer: test(/setInterval\s*\(/, js),
    localStorage: test(/\blocalStorage\b/, js),
    jsonSerialization: test(/JSON\.(?:stringify|parse)\s*\(/, js),
    exportImportSave: test(/(?:导出|导入).{0,14}(?:存档|档案)|(?:export|import)(?:Save|Career|Meta|Archive)|(?:encode|decode)(?:Save|Career|Meta)/i, source),
    saveChecksum: test(/checksum|saveHash|careerHash|metaHash|校验失败|存档码校验/i, source),
    webAudio: test(/(?:webkit)?AudioContext\b/, js),
    htmlAudio: test(/new\s+Audio\s*\(|<audio\b/i, source),
    pointerInput: test(/pointer(?:down|move|up|cancel)|PointerEvent/i, source),
    touchInput: test(/touch(?:start|move|end|cancel)|TouchEvent/i, source),
    keyboardInput: test(/key(?:down|up|press)|KeyboardEvent/i, source),
    mouseInput: test(/mouse(?:down|move|up)|MouseEvent/i, source),
    clickInput: test(/addEventListener\s*\(\s*["']click["']|\.onclick\s*=/i, source),
    responsiveCss: test(/@media\b/i, css),
    viewportMeta: test(/<meta\b[^>]*name\s*=\s*["']viewport["']/i, source),
    aria: test(/\baria-[\w-]+\s*=/i, source),
    cssAnimation: test(/@keyframes\b|\banimation(?:-name)?\s*:/i, css),
    cssCustomProperties: test(/--[a-z][\w-]*\s*:/i, css),
    gradient: test(/(?:linear|radial|conic)-gradient\s*\(|create(?:Linear|Radial)Gradient\s*\(/i, source),
    shadow: test(/box-shadow\s*:|\.shadow(?:Blur|Color|OffsetX|OffsetY)\b/i, source),
    debugHook: test(/window\.__[A-Za-z_$][\w$]*/, js),
    typedArray: test(/\b(?:Uint|Int|Float)(?:8|16|32|64)?(?:Clamped)?Array\b/, js),
    offscreenCanvas: test(/\bOffscreenCanvas\b/, js),
    worker: test(/new\s+(?:Shared)?Worker\s*\(/, js),
    fetch: test(/\bfetch\s*\(/, js),
    clipboard: test(/navigator\.clipboard\b/, js),
    textEncoding: test(/\bText(?:Encoder|Decoder)\b/, js),
    moduleScript: test(/<script\b[^>]*type\s*=\s*["']module["']/i, source),
    externalResource: test(/<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//i, source),
  };
}

function renderingCategory(features) {
  if (features.webgl && features.canvas2d) return "WebGL + Canvas 2D";
  if (features.webgl) return "WebGL";
  if (features.canvas2d) return "Canvas 2D";
  if (features.canvasElement) return "Canvas (context indirect)";
  if (features.svg) return "DOM + SVG";
  return "DOM/CSS";
}

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower));
}

function histogram(values, buckets) {
  return buckets.map((bucket, index) => {
    const lower = bucket.min;
    const upper = bucket.max;
    return {
      label: bucket.label,
      min: lower,
      max: Number.isFinite(upper) ? upper : null,
      count: values.filter(value => value >= lower && value < upper).length,
      order: index,
    };
  });
}

function correlation(xs, ys) {
  const avgX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const avgY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  let numerator = 0;
  let squareX = 0;
  let squareY = 0;
  for (let index = 0; index < xs.length; index += 1) {
    const dx = xs[index] - avgX;
    const dy = ys[index] - avgY;
    numerator += dx * dy;
    squareX += dx * dx;
    squareY += dy * dy;
  }
  return numerator / Math.sqrt(squareX * squareY);
}

const functionFileCounts = new Map();
const functionOccurrenceCounts = new Map();
const files = [];

for (const file of htmlFiles) {
  const source = await readFile(path.join(rootDir, file), "utf8");
  const scripts = extractBlocks(source, "script");
  const styles = extractBlocks(source, "style");
  const js = scripts.join("\n");
  const css = styles.join("\n");
  const features = detectFeatures(source, js, css);
  const functionNames = [...js.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(match => match[1]);
  const uniqueFunctionNames = [...new Set(functionNames)];
  for (const name of uniqueFunctionNames)
    functionFileCounts.set(name, (functionFileCounts.get(name) || 0) + 1);
  for (const name of functionNames)
    functionOccurrenceCounts.set(name, (functionOccurrenceCounts.get(name) || 0) + 1);

  const externalScripts = [...source.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const externalStyles = [...source.matchAll(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const bytes = Buffer.byteLength(source);
  files.push({
    file,
    rating: ratings[file],
    bytes,
    kilobytes: Math.round(bytes / 102.4) / 10,
    lines: source.split(/\r?\n/).length,
    nonEmptyLines: source.split(/\r?\n/).filter(line => line.trim()).length,
    inlineScriptBytes: Buffer.byteLength(js),
    inlineStyleBytes: Buffer.byteLength(css),
    inlineScriptCount: scripts.length,
    inlineStyleCount: styles.length,
    externalScripts,
    externalStyles,
    functionDeclarations: functionNames.length,
    eventListenerCalls: (source.match(/addEventListener\s*\(/g) || []).length,
    rendering: renderingCategory(features),
    features,
  });
}

const featureCounts = Object.fromEntries(
  Object.keys(featureDefinitions).map(key => [
    key,
    files.filter(file => file.features[key]).length,
  ]),
);
const renderingCounts = Object.fromEntries(
  [...new Set(files.map(file => file.rendering))]
    .sort()
    .map(category => [category, files.filter(file => file.rendering === category).length]),
);
const sizeBuckets = [
  { label: "< 5 KB", min: 0, max: 5_000 },
  { label: "5–15 KB", min: 5_000, max: 15_000 },
  { label: "15–30 KB", min: 15_000, max: 30_000 },
  { label: "30–60 KB", min: 30_000, max: 60_000 },
  { label: "60–120 KB", min: 60_000, max: 120_000 },
  { label: "≥ 120 KB", min: 120_000, max: Infinity },
];

const gradeScore = { S: 5, A: 4, B: 3, C: 2, D: 1 };
const byRating = Object.fromEntries(
  ["S", "A", "B", "C", "D"].map(rating => {
    const group = files.filter(file => file.rating === rating);
    const values = group.map(file => file.bytes);
    const selectedFeatures = [
      "canvas2d",
      "localStorage",
      "exportImportSave",
      "webAudio",
      "pointerInput",
      "keyboardInput",
      "responsiveCss",
      "debugHook",
    ];
    return [rating, {
      count: group.length,
      totalBytes: values.reduce((sum, value) => sum + value, 0),
      medianBytes: quantile(values, 0.5),
      p25Bytes: quantile(values, 0.25),
      p75Bytes: quantile(values, 0.75),
      featureCounts: Object.fromEntries(
        selectedFeatures.map(key => [key, group.filter(file => file.features[key]).length]),
      ),
    }];
  }),
);

const topFunctionNames = [...functionFileCounts.entries()]
  .map(([name, fileCount]) => ({
    name,
    fileCount,
    occurrences: functionOccurrenceCounts.get(name) || 0,
  }))
  .sort((a, b) => b.fileCount - a.fileCount || b.occurrences - a.occurrences || a.name.localeCompare(b.name))
  .slice(0, 30);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const allBytes = files.map(file => file.bytes);
const analysis = {
  generatedAt: new Date().toISOString(),
  sourceRevision,
  analysisVersion: 1,
  scope: {
    description: "The 100 root-level HTML game pages in mini-browser-games. Multi-file enhanced editions are outside the corpus unless referenced by a root page.",
    files: files.length,
    zeroDependencyClaim: "External dependency detection only checks HTTP(S) script and stylesheet tags; data URLs and license comments are not external loads.",
  },
  methodology: {
    staticOnly: true,
    caveats: [
      "Regex-based static detection can miss dynamically constructed API calls and can count dead code.",
      "Byte size is not a quality score; minified and formatted files are directly comparable in bytes but not in line count.",
      "S/A/B/C/D are project-internal editorial ratings, not user or market scores.",
      "Correlation is descriptive and does not establish that larger files cause higher quality.",
    ],
    featureDefinitions,
  },
  totals: {
    files: files.length,
    bytes: totalBytes,
    megabytes: Math.round(totalBytes / 104857.6) / 10,
    lines: files.reduce((sum, file) => sum + file.lines, 0),
    nonEmptyLines: files.reduce((sum, file) => sum + file.nonEmptyLines, 0),
    inlineScriptBytes: files.reduce((sum, file) => sum + file.inlineScriptBytes, 0),
    inlineStyleBytes: files.reduce((sum, file) => sum + file.inlineStyleBytes, 0),
    functionDeclarations: files.reduce((sum, file) => sum + file.functionDeclarations, 0),
    eventListenerCalls: files.reduce((sum, file) => sum + file.eventListenerCalls, 0),
  },
  size: {
    minBytes: Math.min(...allBytes),
    p25Bytes: quantile(allBytes, 0.25),
    medianBytes: quantile(allBytes, 0.5),
    p75Bytes: quantile(allBytes, 0.75),
    maxBytes: Math.max(...allBytes),
    histogram: histogram(allBytes, sizeBuckets),
  },
  featureCounts,
  renderingCounts,
  byRating,
  correlations: {
    log10BytesVsInternalRatingScore: Math.round(
      correlation(
        files.map(file => Math.log10(file.bytes)),
        files.map(file => gradeScore[file.rating]),
      ) * 1000,
    ) / 1000,
  },
  topFunctionNames,
  largestFiles: [...files]
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map(({ file, rating, bytes, kilobytes, rendering }) => ({ file, rating, bytes, kilobytes, rendering })),
  smallestFiles: [...files]
    .sort((a, b) => a.bytes - b.bytes)
    .slice(0, 12)
    .map(({ file, rating, bytes, kilobytes, rendering }) => ({ file, rating, bytes, kilobytes, rendering })),
  files,
};

assert.equal(htmlFiles.length, 100, "root game count");
assert.equal(Object.keys(ratings).length, 100, "rating coverage");
assert.equal(files.filter(file => file.features.viewportMeta).length, 100, "viewport coverage");
assert.equal(Object.values(byRating).reduce((sum, group) => sum + group.count, 0), 100, "rating total");
await writeFile(outputFile, `${JSON.stringify(analysis, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  checks: "PASS",
  output: path.relative(rootDir, outputFile),
  totals: analysis.totals,
  size: analysis.size,
  renderingCounts,
  selectedFeatures: Object.fromEntries([
    "canvas2d",
    "webgl",
    "animationFrame",
    "localStorage",
    "exportImportSave",
    "webAudio",
    "pointerInput",
    "keyboardInput",
    "responsiveCss",
    "aria",
    "debugHook",
    "externalResource",
  ].map(key => [key, featureCounts[key]])),
  correlation: analysis.correlations,
  topFunctions: topFunctionNames.slice(0, 12),
}, null, 2));
