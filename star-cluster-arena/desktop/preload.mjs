import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("starClusterDesktop", Object.freeze({
  desktop: true,
  platform: process.platform,
  electron: process.versions.electron,
  openFirewallSettings: () => ipcRenderer.invoke("desktop:open-firewall-settings")
}));
