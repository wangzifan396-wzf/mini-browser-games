# Star Cluster Arena（星团大作战）

一个前后端分离、面向高刷新率屏幕优化的浏览器吞噬竞技游戏。后端默认监听 `127.0.0.1:25555`，提供运行时 API 与前端静态资源；前端包含 WebGL2 GPU 渲染、Canvas 2D 前景、100 人 AI 对局、多个游戏模式与局外成长系统。

项目位于 [wangzifan396-wzf/mini-browser-games](https://github.com/wangzifan396-wzf/mini-browser-games) 仓库的 `star-cluster-arena/` 目录。

## 启动

要求 Node.js 20 或更高版本，不需要安装第三方依赖。

```powershell
cd star-cluster-arena
node backend\server.mjs
```

推荐直接双击 `start.cmd`。启动器会完成以下操作：

1. 检查或启动 `127.0.0.1:25555` 后端。
2. 使用独立的 Edge/Chrome 进程打开游戏。
3. 加入 RTX 高性能 GPU、D3D11、GPU 光栅化参数，避免复用已经绑定核显的普通浏览器进程。

启动后地址为：

```text
http://127.0.0.1:25555
```

运行检查：

```powershell
npm.cmd run check
```

## 目录

```text
backend/server.mjs          本地 HTTP/API 服务、压缩和缓存
frontend/index.html         页面结构
frontend/css/game.css       页面样式
frontend/js/game.js         游戏逻辑与 Canvas 2D 前景
frontend/js/gpu-renderer.js WebGL/WebGL2 GPU 背景渲染器
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

启动日志位于 `%LOCALAPPDATA%\StarClusterArena\logs`。

## 许可证

本项目遵循仓库根目录的 [MIT License](../LICENSE)。
