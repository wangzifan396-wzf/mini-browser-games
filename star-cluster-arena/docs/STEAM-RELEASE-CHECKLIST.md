# Steam / 游戏平台发行前置清单

当前交付为可独立运行的 Windows x64 游戏和通用公网房间服务。代码、安装包和自动化门禁可以在本地完成；平台账号、购买服务、提交审核与商业发行由拥有权限的发行者完成，不把「正式产品 1.0」等同于平台已审核。

## 发行者需提供

- Steamworks 合作伙伴账号、真实 AppID、发布权限与应用基本资料；不要在仓库提交密钥或账号。
- 确定售价 / 免费、支持语言、销售地区、内容评级、隐私与支持联系方式。
- 真实游戏截图、胶囊图、商店说明和宣传片；截图不能将不存在的 Steam 好友、云存档、匹配系统写成已实现。
- 实体最低配置机器和网络测试者，完成两台不同硬件、不同家庭网络与热点的验收；当前 RTX 测量不能用于捏造最低显卡要求。
- 如公开异地服务，提供主机、域名、容量 / 流量预算、监控与备份负责人。付费发布前完成真实跨城及高峰容量测量。

Steam 商店页面和游戏构建分别有发布检查与审核，二者通过后才能由发行者正式发布；具体权限与流程以 [Steam Release Process](https://partner.steamgames.com/doc/store/releasing) 为准。

## 构建清单

- [x] 普通 Windows 安装 / 便携入口，无需 Node；引导式安装目录可选。
- [x] 本地十模式与服务器同源，暂停 / 继续 / 观战 / 结算 / 再开回归。
- [x] 稳定本地进度路径、原子保存、自动备份和错误恢复。
- [x] 画面、声音、键位说明、首次模式目标、关于 / 联系方式与外部链接。
- [x] 公网服务配置、HTTPS/WSS 与好友房间邀请，私密房间不公开列表。
- [ ] Steam depot / launch option 指向 `StarClusterArena.exe`，从 Steam 客户端实际安装运行。
- [ ] 商店资料和构建审核、卸载 / 升级 / 防火墙干净机器测试。
- [ ] 最低配置、无独显、不同 DPI、多显示器与实体跨城验收；确认可接受延迟和收费服务容量。
- [ ] 发行者决定是否购买代码签名，避免将 SmartScreen 提示错误描述为病毒。
- [ ] 对所有素材和第三方许可作发行者最终确认，保留随包运行时许可。

## 可选 Steam 功能路线

不接 Steamworks SDK 也可以先交付普通 Windows 游戏；平台成就、好友邀请、身份校验等必须另做 SDK 集成。现有 WebSocket 不能直接调用原生 SteamNetworkingSockets，未来在传输层桥接，不重写玩法。

SDR / SteamNetworkingSockets 的服务资格与接口见 [Steam Networking](https://partner.steamgames.com/doc/features/multiplayer/networking)、[SDR](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)。开源 [GameNetworkingSockets](https://github.com/ValveSoftware/GameNetworkingSockets) 不是免费获得 Valve 中继服务的凭证。

Steam Cloud 可通过 API 或 Auto-Cloud 路径配置，见 [Steam Cloud](https://partner.steamgames.com/doc/features/cloud)。当前 `profile.json` 同时包含进度与机器画面设置，正式接云存档前应拆分「账号进度」和「本机配置」，并按 SteamID 分目录；不要直接同步整个 Electron userData 或让多账号互相覆盖。未完成这些步骤前不勾选商店的云存档声明。

## 运营边界

当前为好友房间，不提供账号排行榜、匹配分、商业防作弊或无房主持续比赛。公网权威规则阻止客户端直接改局内质量，但本地存档本来就是开放、可导入的，不能拿它做公平付费排名依据。正式竞技运营需补身份、限频、防刷、封禁、容量隔离与持续安全维护。
