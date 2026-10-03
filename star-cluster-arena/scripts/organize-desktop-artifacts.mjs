import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const releaseRoot = resolve(projectRoot, "../star-cluster-arena-desktop");
const buildRoot = join(releaseRoot, "build");
const packageJson = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
const versionRoot = join(releaseRoot, `v${packageJson.version}`);

async function listFiles(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await listFiles(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

async function sha256(file) {
  const bytes = await readFile(file);
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function selectArtifact(files, extension, marker) {
  const version = packageJson.version.toLowerCase();
  return files.find(file => {
    const name = basename(file).toLowerCase();
    return extname(name) === extension && name.includes(version) && name.includes(marker);
  });
}

await mkdir(versionRoot, { recursive: true });
const files = await listFiles(buildRoot);
const installer = selectArtifact(files, ".exe", "安装程序");
const portable = selectArtifact(files, ".zip", "便携版");

if (!installer || (await stat(installer)).size < 1024 * 1024) throw new Error("没有找到有效的 NSIS 桌面安装程序");
if (!portable || (await stat(portable)).size < 1024 * 1024) throw new Error("没有找到有效的桌面便携版压缩包");

const installerTarget = join(versionRoot, `StarClusterArena-Setup-${packageJson.version}-win-x64.exe`);
const portableTarget = join(versionRoot, `StarClusterArena-Portable-${packageJson.version}-win-x64.zip`);
await copyFile(installer, installerTarget);
await copyFile(portable, portableTarget);

const checksums = [
  `${await sha256(installerTarget)}  ${basename(installerTarget)}`,
  `${await sha256(portableTarget)}  ${basename(portableTarget)}`
];
await writeFile(join(versionRoot, "SHA256SUMS.txt"), `${checksums.join("\r\n")}\r\n`, "utf8");
await writeFile(join(versionRoot, "README-WINDOWS.txt"), [
  `星团大作战 ${packageJson.version}（Windows x64）`,
  "1.0.0 发布候选 1（sca-v1.0.0-rc.1）；v4.0 是之前的工程历史版本，不是另一份开发源码。",
  "候选包尚未完成全部正式验收；本机 4K 全屏未稳定达到 120 FPS，实际异地与干净机器安装仍待测。",
  "",
  `安装版：双击“${basename(installerTarget)}”，可在安装向导中选择安装位置、桌面快捷方式和当前用户/所有用户安装。`,
  `便携版：完整解压“${basename(portableTarget)}”，再双击解压目录内的 StarClusterArena.exe。`,
  "请勿只从便携版目录单独复制 EXE，否则游戏资源和内置联机服务会缺失。",
  "升级或更改安装目录不会主动删除用户存档，卸载时也默认保留存档。",
  "",
  "局域网联机：一名玩家在游戏内创建房间，其他玩家从联机大厅自动发现并加入，无需手工输入 IP。",
  "异地联机：进入联机游戏 → 互联网，填写运营者提供的 HTTPS 服务器地址，检查连接后创建 / 加入房间。没有公网服务器时请使用局域网。",
  "双方使用同一版本；互联网私密房间通过 6 位房间码或邀请链接加入，默认不公开列出。",
  "如 Windows 防火墙询问网络访问权限，请只允许可信的专用网络。未购买代码签名证书的构建可能触发 SmartScreen 提示。",
  "",
  "协议：sca-v1；联机模式：10 种；通常最多 8 真人，魔王合作最多 4 勇者；AI 自动补满原模式人数。",
  "鼠标移动；Space 分裂；W 吐球 / 喂刺；霸屏模式 A 速合 / D 冲刺；Esc 打开菜单（单人暂停、联机不暂停服务器）。",
  "本地进度位于 Windows 用户应用数据目录内，附带自动备份；请勿删除该目录来升级游戏。",
  "本发行包尚未代码签名，未接入 Steamworks，也不代表已经通过 Steam 审核。"
].join("\r\n"), "utf8");
for (const document of ["RELEASE-NOTES-1.0.0.md", "QA-1.0.0.md", "INTERNET-MULTIPLAYER.md", "STEAM-RELEASE-CHECKLIST.md"]) {
  await copyFile(join(projectRoot, "docs", document), join(versionRoot, document));
}

console.log(`发行目录：${versionRoot}`);
console.log(`安装程序：${installerTarget}`);
console.log(`便携版：${portableTarget}`);
console.log(`SHA-256：${join(versionRoot, "SHA256SUMS.txt")}`);
