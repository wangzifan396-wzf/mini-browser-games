import { copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = resolve(projectRoot, "../star-cluster-arena-desktop");
const makeRoot = join(releaseRoot, "make");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));

async function listFiles(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

async function selectLargest(files, extension) {
  const matching = files.filter(file => extname(file).toLowerCase() === extension);
  const ranked = await Promise.all(matching.map(async file => ({ file, size: (await stat(file)).size })));
  ranked.sort((left, right) => right.size - left.size);
  return ranked[0];
}

await mkdir(releaseRoot, { recursive: true });
const files = await listFiles(makeRoot);
const installer = await selectLargest(files.filter(file => !file.toLowerCase().endsWith(".nupkg")), ".exe");
const portable = await selectLargest(files, ".zip");

if (!installer || installer.size < 1024 * 1024) throw new Error("没有找到有效的桌面安装程序");
if (!portable || portable.size < 1024 * 1024) throw new Error("没有找到有效的桌面便携版压缩包");

for (const file of files) {
  if (extname(file).toLowerCase() !== ".zip" || resolve(file) === resolve(portable.file)) continue;
  if (basename(file).startsWith("星团大作战-win32-x64-")) await unlink(file);
}

const installerTarget = join(releaseRoot, "星团大作战-安装程序.exe");
const portableTarget = join(releaseRoot, `星团大作战-便携版-${packageJson.version}-win-x64.zip`);
for (const entry of await readdir(releaseRoot, { withFileTypes: true })) {
  if (!entry.isFile() || !/^星团大作战-便携版-.*-win-x64\.zip$/u.test(entry.name)) continue;
  const existing = join(releaseRoot, entry.name);
  if (resolve(existing) !== resolve(portableTarget)) await unlink(existing);
}
if (resolve(installer.file) !== resolve(installerTarget)) await copyFile(installer.file, installerTarget);
if (resolve(portable.file) !== resolve(portableTarget)) await copyFile(portable.file, portableTarget);
await writeFile(join(releaseRoot, "使用说明.txt"), [
  `星团大作战 ${packageJson.version}（Windows x64）`,
  "",
  "安装版：双击“星团大作战-安装程序.exe”，安装后从桌面或开始菜单启动。",
  `便携版：完整解压“${basename(portableTarget)}”，再双击解压目录内的 StarClusterArena.exe。`,
  "请勿只从便携版目录单独复制 EXE，否则游戏资源和内置联机服务会缺失。",
  "",
  "局域网联机：一名玩家在游戏内创建房间，其他玩家从“局域网联机”大厅自动发现并加入，无需手工输入 IP。",
  "如 Windows 防火墙询问网络访问权限，请只允许可信的专用网络。未购买代码签名证书的构建可能触发 SmartScreen 提示。",
  "",
  "协议：sca-lan-v2；联机模式：10 种；真人上限：8。"
].join("\r\n"), "utf8");

console.log(`安装程序：${installerTarget}`);
console.log(`便携版：${portableTarget}`);
