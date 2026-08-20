import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseRoot = resolve(projectRoot, "../star-cluster-arena-desktop");
const iconPath = resolve(projectRoot, "desktop/assets/icon.ico");

export default {
  outDir: releaseRoot,
  packagerConfig: {
    asar: true,
    executableName: "StarClusterArena",
    icon: iconPath,
    ...(process.env.SCA_ELECTRON_ZIP_DIR
      ? { electronZipDir: resolve(process.env.SCA_ELECTRON_ZIP_DIR) }
      : {}),
    win32metadata: {
      CompanyName: "Star Cluster Arena",
      FileDescription: "星团大作战局域网联机版",
      InternalName: "StarClusterArena",
      OriginalFilename: "StarClusterArena.exe",
      ProductName: "星团大作战"
    },
    ignore: [
      /^\/docs(?:\/|$)/,
      /^\/test(?:\/|$)/,
      /^\/scripts(?:\/|$)/,
      /^\/start(?:\/|$)/,
      /^\/README\.md$/
    ]
  },
  makers: [
    new MakerSquirrel({
      name: "StarClusterArena",
      setupExe: "星团大作战-安装程序.exe",
      setupIcon: iconPath,
      noMsi: true
    }),
    new MakerZIP({}, ["win32"])
  ]
};
