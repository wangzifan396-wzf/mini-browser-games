# Star Cluster Arena（星团大作战）

一个支持单机、局域网联机和 Windows 桌面封装的吞噬竞技游戏。原有 10 种单机玩法保持不变；局域网版同样开放全部 10 种玩法，支持 2–8 名真人、AI 补位、房间内改模式、准备、断线重连和服务端权威同步。

项目位于 [wangzifan396-wzf/mini-browser-games](https://github.com/wangzifan396-wzf/mini-browser-games) 仓库的 `star-cluster-arena/` 目录。

## 从源码启动网页版

要求 Node.js 20 或更高版本。首次运行先安装依赖：

```powershell
cd star-cluster-arena
npm.cmd install
npm.cmd start
```

也可以直接双击 `start.cmd`。服务默认监听局域网，本机地址为 `http://127.0.0.1:25555`；首页的“局域网联机”会进入房间大厅。

局域网联机时，房主创建房间，其他玩家可在大厅自动发现并点击加入；UDP 广播不可用时，也可以输入 6 位房间码。游戏界面不要求玩家手工输入房主 IP。

### 联机稳定性与防火墙

- 桌面版优先使用 TCP `25555`，占用时回退到 `25557` 或动态端口；UDP 房间发现使用 `25556`。
- 大厅会主动查询房间，并在第一个网络地址不可达时自动尝试其他候选地址。
- 玩家点击“离开房间”会立即从等待列表移除；只有意外断网才进入短暂的重连保留期。
- 如果大厅显示“防火墙阻止”，请点击“打开防火墙设置”，删除旧的阻止规则或允许当前版本使用专用网络。程序不会静默修改系统规则。
- 路由器开启 AP/客户端隔离、双方不在同一子网或 Windows 网络被设为“公用”时，纯局域网发现仍可能被系统阻止。

详细流程与验收标准见 [`docs/SDD-LAN-STABILITY-V3.1.md`](docs/SDD-LAN-STABILITY-V3.1.md) 和 [`docs/SDD-MULTIPLAYER-MODES-PERFORMANCE-V3.2.md`](docs/SDD-MULTIPLAYER-MODES-PERFORMANCE-V3.2.md)。

### v3.2 联机同步

- 房主可在创建房间或等待房间中选择自由、团队、生存、大逃杀、闪电、孢子、霸屏、据点、巨行星和魔王模式。
- 服务端以 20 Hz 权威模拟并发送紧凑动态快照；客户端使用服务器时间轴、历史帧、自适应 80～180 ms 抖动缓冲及本地移动预测。
- 食物和刺球使用完整基线加 revision 增量；发现修订链断裂会自动请求新基线。
- 慢客户端不会让旧快照无限排队；恢复后会收到完整基线。
- 联机画布限制内部像素预算，食物按颜色批量绘制，HUD 降频更新，避免高分辨率屏幕产生额外主线程停顿。

发布候选已通过 92 项自动化测试。每种模式均完成真实 HTTP/WebSocket 双客户端开局；压力脚本分别以 8 和 16 个参与者运行每模式 1200 tick。8 参与者档动态快照 p95 为 2.8～6.3 KiB，单客户端动态数据约 45～96 KiB/s；16 参与者压力档 p95 为 7.3～14.9 KiB。详细口径和仍需完成的双机人工验收见 v3.2 SDD。

## Windows 桌面版

桌面版把同一套前端、权威服务器和局域网发现模块装进一个 Electron 应用。玩家无需安装 Node.js，也无需单独启动服务器：创建房间的电脑会在应用内部启动房主服务。

开发启动与构建：

```powershell
npm.cmd run desktop
npm.cmd run make:desktop
```

最终成品固定输出到仓库顶层的 `star-cluster-arena-desktop/`，其中：

- `星团大作战-安装程序.exe`：双击安装，安装后从桌面或开始菜单启动游戏。
- `星团大作战-便携版-3.2.0-win-x64.zip`：解压后双击目录内的 `StarClusterArena.exe`，不能只把 EXE 单独拷走。

源码检查与测试：

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run test:soak
```

## 目录

```text
backend/server.mjs                 HTTP/API/WebSocket 服务入口
backend/multiplayer/               房间、协议、权威模拟、局域网发现
frontend/index.html                单机游戏首页
frontend/multiplayer.html          联机大厅和联机对局界面
frontend/js/game.js                原有单机游戏逻辑
frontend/js/multiplayer.js         联机客户端、房间交互和输入同步
frontend/js/snapshot-*.js          紧凑快照解码、历史缓冲和自适应插值
frontend/js/local-predictor.js     本地移动预测和未确认输入重放
desktop/                           Electron 入口、权限隔离和打包配置
docs/SDD-LAN-MULTIPLAYER-DESKTOP.md 需求、架构、协议和验收规范
test/                              单元与双客户端集成测试
```

## 性能接口

- `GET /api/health`：服务健康状态。
- `GET /api/runtime`：渲染和自适应配置。
- `POST /api/telemetry`：页面关闭时上报一条本机内存性能样本，不写磁盘。
- `GET /api/telemetry`：查看当前进程聚合性能数据。

页面标题旁会显示实际渲染后端和 FPS。应用会请求高性能 WebGL2 上下文；最终使用独立显卡还是集成显卡仍由浏览器和操作系统的图形策略决定。WebGL 不可用时会自动切换到 Canvas 2D，不影响游戏运行。

本机验证中，普通 Edge 进程选择了 AMD 核显，而 `start.cmd` 创建的专用进程成功识别为 `NVIDIA GeForce RTX 5070 Ti / Direct3D 11`。页面左上角会直接显示实际使用的 RTX 型号。

## 2.1 性能模式

- 游戏逻辑固定为 60Hz，显示帧使用位置插值，不再随 160Hz 屏幕重复运行 160 次 AI 与碰撞。
- 食物改由 WebGL 点精灵批量提交，降低 Canvas 2D 绘制调用。
- 4K 前景画布限制为约 320 万内部像素，DOM 界面仍保持原生清晰度。
- GPU 背景使用独立低倍率渲染，减少双画布合成带宽。
- 启动器自动检测显示器刷新率；高刷屏以 120 FPS 帧预算调整画质。
- 高像素压力下关闭面板实时背景模糊，并按窗口像素预算选择稳定的初始渲染倍率。

## 2.2 稳帧模式

- 游戏过程中不再反复改变 4K 画布尺寸，避免纹理重建导致的闪白与长停顿。
- WebGL 背景先写入隐藏缓存，最终只提交一个不透明可见画布，降低核显的透明双层合成压力。
- 插值过程不再逐帧创建临时数组，减少垃圾回收停顿。
- 碰撞空间、可见球体、吐出物候选列表改为循环复用。
- 空间网格改用数值键，并缓存球体包装对象，降低主线程分配频率。
- 吐出物吞噬取消逐对象排序，并缩小空间查询范围。
- 调试数据会记录最长帧时间与超过 80ms 的长帧次数。

直接打开 `frontend/index.html` 现在也可以作为离线模式运行，但不会连接后端，也无法保证浏览器切换到 5070 Ti；需要完整功能时请使用 `start.cmd` 或访问 `http://127.0.0.1:25555`。

`start.cmd` 的启动日志位于 `%LOCALAPPDATA%\StarClusterArena\logs`；桌面版运行日志位于 `%APPDATA%\星团大作战\logs\desktop.log`。

## 许可证

本项目遵循仓库根目录的 [MIT License](../LICENSE)。
