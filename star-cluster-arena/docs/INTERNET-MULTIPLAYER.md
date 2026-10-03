# 异地联机与服务器部署

1.0 已实现「互联网服务器 + 房间码 / 邀请链接」连接方式。服务器仍执行单人十模式原始玩法；LAN 自动发现保留。所有客户端与服务端必须使用同一版 `sca-v1` 协议。

## 玩家怎么用

进入 **联机游戏 → 互联网**，填写运营者提供的 `https://game.你的域名`，检查连接，正常创建 / 加入房间。房主复制邀请链接，朋友粘贴到游戏的加入输入框，或在浏览器打开链接。外观照常带入。

没有公共服务器时，游戏不会显示「异地联机已就绪」。公网房间不依赖房主家庭宽带端口映射，但房主离开仍关闭本房间。当前是好友房间服务，不是带账号、匹配分、云存档、反作弊的平台运营系统。不能中途加入新的参赛者，原玩家支持短时重连。

## Linux 云主机 + 域名

需要有权限操作的公网主机、DNS 域名和 Docker Compose。初始最多开放 2 间，再按 CPU 延迟扩容。每个百人房间执行完整 AI / 物理，不能仅凭显卡或百兆宽带保证服务器容量。

1. 域名 A 记录指向云主机。不要发布无法使用的 AAAA。开放 TCP 80 / 443，UDP 443 为可选 HTTP/3；25555 只在容器内部开放，公网不需 UDP 25556。
2. 复制源码到服务器，进入 `star-cluster-arena/deploy/`。
3. 将 `.env.example` 复制为 `.env`，填写真实 `GAME_DOMAIN`，保留 `MAX_ROOMS=2`。不要提交真实 `.env`。
4. 启动并检查：

   ```sh
   docker compose config
   docker compose up -d --build
   docker compose ps
   docker compose logs --tail=100 game caddy
   ```

5. 打开 `https://你的域名/api/health`，应返回版本 `1.0.0`；`/api/runtime` 的 `connection.publicUrl` 应是这个 HTTPS origin。有效域名由 Caddy 自动申请 TLS，反向代理支持 WebSocket 升级。[Caddy 文档](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
6. 用家庭 Wi-Fi 和移动热点两条真实不同网络验证创建、准备、开局、喂刺、复活、重连、退出后再开。记录 RTT、掉帧和权威物理耗时，之后再公开上线。

容器使用非 root、只读文件系统、有界日志。服务提供心跳、入房超时、请求超时、来源校验、消息大小限制、创建限频与房间上限。房主 / 重连令牌不进入公共列表；没有付费账号验证，不应未经运营防护就作为大规模公开排名服务。

当前创建限频以服务看到的 TCP 来源地址计数（8 次 / 分钟），不盲目信任 `X-Forwarded-For`。同一 Caddy 代理后的玩家会共享这个限制，适合默认两间好友房；扩大运营前需由可信代理层做真实来源限频 / 鉴权，并评估 CPU 与出口带宽，而不是简单调高房间数。

浏览器来源只接受本机 / LAN IP、公网 `PUBLIC_URL` 或显式 `ALLOWED_ORIGINS`，不从请求的 Host 自动信任任意域名。LAN 自动发现使用 IP，不受影响；若刻意使用电脑名或其他域名访问网页，需要明确将对应 origin 加入白名单。

当前机器没有 Docker 引擎，配置未在本机拉起。网络实现有自动化测试；真实 DNS、TLS 证书、跨城链路和云主机性能需部署后验收，不能用 localhost 代替。

## 不使用 Docker

安装维护中的 Node.js LTS，`npm ci --omit=dev --ignore-scripts`。设置 `HOST=127.0.0.1`、`PORT=25555`、`PUBLIC_URL=https://你的域名`、`MAX_ROOMS=2` 后运行 `node backend/server.mjs`，配进程守护和 Caddy / Nginx HTTPS/WebSocket 反向代理。正式服务使用 HTTPS/WSS；本地测试也支持 HTTP。部署在域名根路径，不支持任意 `/game/` 前缀。

## Steam 联机边界

SteamNetworkingSockets / SDR 可作为下一阶段传输适配，不需要重做玩法。但开源 GameNetworkingSockets 并不提供 Valve 中继权限；需要 Steamworks 账号、AppID、SDK 集成与验证，Electron WebSocket 不能直接调用原生 SDK。[Steam 网络](https://partner.steamgames.com/doc/features/multiplayer/networking)、[SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)、[开源库](https://github.com/ValveSoftware/GameNetworkingSockets)

本次先交付通用公网权威服务。代部署真实服务需要目标主机 / 平台及授权；不能在缺少这些信息时替你购买主机、域名或注册 Steam。
