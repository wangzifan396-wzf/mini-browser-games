import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pngPath = join(projectRoot, "desktop", "assets", "icon.png");
const icoPath = join(projectRoot, "desktop", "assets", "icon.ico");
const png = await readFile(pngPath);

if (png.length < 24 || png.subarray(1, 4).toString("ascii") !== "PNG") {
  throw new Error("desktop/assets/icon.png 不是有效的 PNG 文件");
}
if (png.readUInt32BE(16) !== 256 || png.readUInt32BE(20) !== 256) {
  throw new Error("桌面图标必须是 256 × 256 像素");
}

// Windows Vista 及后续版本允许 ICO 容器直接保存一张 256px PNG。
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt8(0, 6);
header.writeUInt8(0, 7);
header.writeUInt8(0, 8);
header.writeUInt8(0, 9);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(header.length, 18);

await writeFile(icoPath, Buffer.concat([header, png]));
console.log(`Windows 图标已生成：${icoPath}`);
