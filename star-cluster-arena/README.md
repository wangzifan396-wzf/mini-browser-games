# 星团大作战 · Star Cluster Arena

十种玩法的星域吞噬竞技游戏。鼠标控制球体，吃食点发育、分裂围猎、吐球协作、喂刺反击；既能独自挑战 AI，也能和朋友进入同一战场。

当前为 **1.0.0 发布候选 1**，发布标签 `sca-v1.0.0-rc.1`（安装包内构建版本为 1.0.0）。它继承工程 v4.0 的十模式源码，单人和联机执行同一份玩法，不是重做一个简化联机游戏。Windows 成品见 [下载页面](https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v1.0.0-rc.1)。

本轮已完成源码、网络、长局压力和便携包回归；最终包前台长时间闪屏复测按用户要求停止。已有源码前台测量中，4K 全屏平均约 67 FPS，未达到稳定 120 FPS。故以预发布交付，不声称已完成正式版 / Steam 全部验收。[验收记录与未完成项](docs/QA-1.0.0.md)。

## 普通玩家怎么玩

- 安装版：运行 `StarClusterArena-Setup-1.0.0-win-x64.exe`，选择安装位置，之后双击桌面 / 开始菜单游戏图标。
- 便携版：完整解压 `StarClusterArena-Portable-1.0.0-win-x64.zip`，双击目录中的 `StarClusterArena.exe`。不要单独复制 EXE；不需要安装 Node.js。
- 单人：首页选择「单人游戏」，挑选模式并开始。个人中心可装备皮肤、孢子、光环、拖尾，以及进行商店、锻造和成长。
- LAN：一人创建房间，同局域网朋友在游戏里自动发现加入；准备后房主开局。需要允许可信专用网络访问，程序不会静默修改防火墙。
- 异地：选择「互联网」，填写运营者提供的 HTTPS 服务器地址，检查连接后建房。朋友通过房间码或邀请链接加入。**源码提供公网服务，但本项目不附带已经运行的免费公共服务器。** [部署说明](docs/INTERNET-MULTIPLAYER.md)。

鼠标移动；`Space` 分裂；`W` 吐球 / 喂刺；霸屏模式 `A` 快合、`D` 冲刺种刺。单人 `Esc / P` 暂停，联机 `Esc` 只打开菜单，服务器不会暂停。阵亡后的大逃杀支持观战和 `Tab` 切换目标。

## 十种模式

| 模式 | 总参与者（真人 + AI） | 目标 |
|---|---:|---|
| 自由 | 100 | 12 分钟内发育，允许复活，按质量结算 |
| 团队 | 40，10 队 × 4 | 队友互接分身，累计团队质量 |
| 生存 | 64 | 3 条生命，吞噬加命，耗尽出局 |
| 大逃杀 | 100 | 安全区收缩，最后存活者获胜 |
| 闪电 | 88 | 约 3 分钟快节奏、高密度事件，可提前制霸 |
| 孢子风暴 | 48 | 孢子刺爆出可争夺质量，攻守博弈 |
| 霸屏 | 22 | 方形战场、64 分身、速合与冲刺，88% 覆盖保持 6 秒 |
| 据点 | 28，4 队 × 7 | 争夺三座星核，先达到 240 分 |
| 巨行星 | 36 | 巨球开局、固定圆形战场，完成区域霸屏 |
| 魔王 | 10 | 勇者合作击败魔王 / 魔兵，限时讨伐 |

好友房间通常支持 2–8 真人，魔王合作为 2–4 勇者，其余槽位由原模式 AI 自动补满。例如 4 真人大逃杀仍是 100 个参与者，配 96 AI。团队模式按原队伍分配，不保证所有好友都在同一队。

## 1.0 更新重点

- 修复暂停计时、误重开、后台持续输入、房主阵亡后的错误结算、暂时复活等待导致提前结束、魔王英雄超员。
- 公平真人出生基线；外观和进度保留，本地成长属性不成为联机战力优势。
- 同源材质、护盾、合球提示、孢子与镜头；60Hz 玩法、20Hz 权威快照、高刷新率画面分别运行。
- 惰性世界快照、减小重复复制、缓存绘制数据；首页低频渲染，避免菜单空转。
- 玩家化首页、始终可见的开始按钮、首次模式提示、阵亡观战、联机结算和本地星尘奖励。
- 程序生成的声音与音量设置；稳定桌面存档、自动备份、原子写入与损坏恢复。
- 互联网连接 / 私密好友房 / 邀请；HTTPS/WSS 服务部署配置；Electron 44.5.1。

[完整发布说明](docs/RELEASE-NOTES-1.0.0.md) · [SDD 规格与缺陷记录](docs/SDD-RELEASE-1.0.md) · [实际测试记录](docs/QA-1.0.0.md)

## 三种版本的关系

| 形态 | 位置 | 用途 |
|---|---|---|
| 单 HTML 历史版 | 根目录 `ball-arena.html` | 独立浏览器单文件，保持原状，不含房间服务 |
| 前后端源码版 | `star-cluster-arena/` | 网页前端、共享玩法、Node 房间服务、测试和桌面配置 |
| Windows 封装版 | Releases / 本地 `star-cluster-arena-desktop/v1.0.0/` | 同一前后端代码打包成普通 Windows 游戏 |

后续开发从当前源码主分支继续升级 1.x；v3.x / v4.0 属于可追溯工程历史，不需要维持三份玩法代码。发行安装包 / ZIP 不放入源码 Git。

## 从源码运行

建议 Node.js 24 LTS；完整桌面开发要求 Node.js ≥ 22.13。先安装依赖：

```powershell
cd star-cluster-arena
npm.cmd ci
npm.cmd start
```

默认本机 `http://127.0.0.1:25555`。桌面会内置启动服务，端口占用时选择备用端口；LAN 发现使用 UDP 25556。纯网页需要一台设备运行服务，其他人使用房间 UI 加入。

```powershell
npm.cmd run desktop
npm.cmd run make:desktop
```

成品输出到独立封装目录 `../star-cluster-arena-desktop/v1.0.0/`，包含安装 EXE、便携 ZIP、SHA-256、说明和测试 / 部署文档。更改安装目录、端口或正常卸载不会主动删除进度；桌面进度和日志位于 Windows 用户应用数据目录，具体路径见日志。升级前建议从个人中心导出一份存档。

若本机构建下载报证书链错误，应修复可信 CA / 代理配置，不要关闭 TLS 校验。已安装且校验过官方 Electron 的机器可复用 `node_modules/electron/dist`：`npm.cmd exec -- electron-builder --config desktop/electron-builder.yml --config.electronDist=node_modules/electron/dist --win nsis zip --x64`，成功后运行 `node scripts/organize-desktop-artifacts.mjs` 整理发行目录。

## 验证

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:desktop-release
npm.cmd run test:desktop-display
npm.cmd run test:desktop-navigation
npm.cmd run test:desktop-readiness
npm.cmd run test:desktop-modes
npm.cmd run test:desktop-visual
npm.cmd run test:soak
```

模式压力测试可设置 `SCA_SOAK_TICKS=7200`、`SCA_SOAK_HUMANS=8`。桌面全模式测试顺序启动独立进程，避免多个测试互相争抢 GPU；可设置 `SCA_QA_REPORT=docs/qa/desktop-performance-1.0.json` 保存测量。

`test:desktop-readiness` 顺序验证比赛 / 观战 / 结算、原生全屏和导航。设置 `SCA_PACKAGED_EXE` 为打包后的绝对 EXE 路径，可以直接验证独立成品；Smoke 使用隔离临时存档，不覆盖玩家进度。`test:desktop-visual` 在窗口 / 全屏各跑五分钟，监测合成近白帧，测试时避免其他 GPU 压力程序干扰。

桌面性能 / 全屏测试可能占用前台，请在允许中断电脑操作时执行。仅做不启动窗口的成品检查：设置 `SCA_PACKAGED_EXE` 后运行 `node scripts/verify-desktop-bundle.mjs`，逐字节对比运行源码、检查便携运行时与许可证；这不代替实际帧率或干净机器安装测试。

十模式共享源码、关键玩法、人数、结算、存档恢复、真实 HTTP/WebSocket、可信 TLS 反向代理 / WSS 双客户端都有回归测试。性能测量是本机结果，不保证每台机器相同；本机双客户端不等于跨城实测。完整条件、原始数据和未覆盖项见 [QA](docs/QA-1.0.0.md)。

## 架构与运营

```text
frontend/js/game.js                 单人和服务器实际执行的十模式玩法
frontend/js/game-mode-catalog.js    共享模式与数值
frontend/js/gameplay-core.js        共享移动、分裂、喂刺与镜头
frontend/js/cosmetic-renderer.js    共享球体、护盾、孢子及外观
frontend/js/audio.js               公共合成声音
frontend/js/progression.js         公共结算奖励
frontend/js/multiplayer.js         联机房间、输入、预测和画面适配
backend/multiplayer/               房间、源码权威运行器、紧凑快照、LAN 发现
desktop/                          Electron 显示、存档、权限隔离与打包
deploy/                           公网容器和 HTTPS/WSS 反向代理
docs/                             SDD、QA、发布与上架前置清单
```

`GET /api/health` 检查健康，`GET /api/runtime` 查看真实 60/20Hz 和服务配置。公开服务器应从最多两间房开始，按 CPU、延迟和流量实测扩容。当前是好友房间，不是带账号 / 排名匹配 / 商业防作弊的运营平台。

没有 Steam AppID、云主机和部署权限时，不能替发行者注册、购买或提交平台审核。SDK 好友邀请、SDR、成就、云存档、Steam Deck / 手柄支持尚未接入；不要在商店声明这些已实现。见 [Steam 发行前置清单](docs/STEAM-RELEASE-CHECKLIST.md)。

## 开源与反馈

[GitHub](https://github.com/wangzifan396-wzf/mini-browser-games) · [CSDN](https://blog.csdn.net/m0_74023007) · [哔哩哔哩](https://space.bilibili.com/319363325)。QQ：530142376；小黑盒：45509815（原网页版个人链接失效，游戏内改为复制 ID）。

报告问题时请附模式、单人 / 联机、复现步骤、版本、显示设置和日志；联机再附双方网络类型 / 延迟，不要公开房主令牌或私人服务器凭据。

## 许可

[MIT License](LICENSE)。运行时第三方许可见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)，保留便携目录中的 Electron / Chromium 许可文件。
