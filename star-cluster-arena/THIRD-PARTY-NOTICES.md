# 第三方许可与素材

游戏源码遵循随包提供的 MIT License，作者 wangzifan396-wzf。界面、球体、孢子、光环、拖尾与音效由项目代码程序生成；没有使用《球球大作战》等商业游戏的贴图、音频或源码。

Windows 发行包包含 Electron、Chromium 和 Node.js。Electron 为 MIT，Chromium 及其依赖包含 BSD 等多种许可证，Node.js 以 MIT 为主并包含第三方组件。运行时完整许可文件 `LICENSE.electron.txt`、`LICENSES.chromium.html` 随 Electron 发行目录一并保留，不得删去。

应用运行依赖：

| 组件 | 许可 | 来源 |
|---|---|---|
| Electron 44.5.1 | MIT；依赖各自许可 | https://github.com/electron/electron |
| ws | MIT | https://github.com/websockets/ws |
| electron-squirrel-startup | MIT | https://github.com/mongodb-js/electron-squirrel-startup |

开发 / 构建工具包括 Electron Forge、electron-builder 与 NSIS；它们不是另一个玩法内核。服务器容器基于 Node.js 官方镜像，反向代理使用 Caddy（Apache-2.0）。实际版本与完整依赖锁定在 `package-lock.json`；部署者应持续跟进安全更新。

Steam 及其他平台的商标归其各自所有者。本项目未表示与 Valve 有隶属关系，未包含 Steamworks SDK，也未声称已通过 Steam 审核。
