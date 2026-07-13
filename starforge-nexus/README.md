# Starforge Nexus（星炉工坊）

以仓库中的 `starforge-idle.html` 为模板扩展出的前后端版本。完整保留生产链、研究矩阵、委托、专员、远航、自动战斗、装备、星环、天象、成就与星核重启，并针对高 DPI、高刷新率和独立显卡进行了渲染优化。

## 启动

需要 Node.js 20 或更高版本，不需要安装第三方依赖。

```powershell
cd starforge-nexus
node backend\server.mjs
```

打开：

```text
http://127.0.0.1:25555
```

Windows 推荐双击 `start.cmd`。启动器会：

1. 检查并启动本地后端；
2. 检测显示器刷新率；
3. 使用独立的 Edge/Chrome 配置启动游戏；
4. 请求高性能 GPU、D3D11、GPU 光栅化与零复制路径。

页面标题下方会显示实际 GPU 型号和实时 FPS。浏览器或显卡不可用时会自动回退 Canvas 2D。

## 性能设计

- WebGL2 程序化绘制星云、星点、轨道、恒星核心与天象光效；
- GPU 背景以 60Hz 写入隐藏缓存，最终只提交一个不透明可见画布；
- 数值生产和战斗使用固定 30Hz 模拟，不随 120/160Hz 屏幕重复计算；
- Canvas 内部像素上限约 180 万，避免高 DPI 过度渲染；
- HUD 更新降至 2Hz，复杂活动页按 1Hz 更新；
- 粒子使用原地回收，避免逐帧 `filter` 分配；
- 画布只在窗口真正变化时重建，避免纹理重分配闪屏；
- 持续记录平均帧时间、主线程耗时、最长帧和长帧数量。

## 目录

```text
backend/server.mjs          HTTP/API 服务、压缩和静态缓存
frontend/index.html         页面结构
frontend/css/game.css       UI、响应式布局与过渡动画
frontend/js/game.js         游戏模拟、存档、DOM 与 Canvas 前景
frontend/js/gpu-renderer.js WebGL/WebGL2 程序化背景
scripts/launch.ps1          Windows 独显启动器
start.cmd                   双击入口
```

## API

- `GET /api/health`：健康状态；
- `GET /api/runtime`：渲染与性能配置；
- `POST /api/telemetry`：页面关闭时提交一条内存性能样本，不写磁盘；
- `GET /api/telemetry`：查看当前进程的聚合样本。

直接打开 `frontend/index.html` 也可离线运行，但不会连接后端，也不能保证浏览器选择独立显卡。

启动日志位于 `%LOCALAPPDATA%\StarforgeNexus\logs`。

## 许可证

本项目遵循仓库根目录的 [MIT License](../LICENSE)。
