# 迷你游戏合集

[![在线试玩](https://img.shields.io/website?url=https%3A%2F%2Fwangzifan396-wzf.github.io%2Fmini-browser-games%2F&style=for-the-badge&label=GitHub%20Pages&logo=github&logoColor=white)](https://wangzifan396-wzf.github.io/mini-browser-games/)
[![Pages 部署](https://img.shields.io/github/actions/workflow/status/wangzifan396-wzf/mini-browser-games/pages.yml?branch=main&style=for-the-badge&label=Pages%20Deploy)](https://github.com/wangzifan396-wzf/mini-browser-games/actions/workflows/pages.yml)
![活跃游戏](https://img.shields.io/badge/Active%20Games-106-176B91?style=for-the-badge)
![历史废案](https://img.shields.io/badge/Archived-18-66767B?style=for-the-badge)
[![MIT License](https://img.shields.io/badge/License-MIT-24735F?style=for-the-badge)](LICENSE)

开源网页游戏与桌面游戏合集。根目录保留 **106 款活跃单文件 HTML 游戏 + 18 款历史归档**，可在线或离线游玩；另有《星团大作战》Windows 1.0.0 正式版，以及独立展示的《回声禁区》测试版。质量优先：重复内容退出维护，不以换皮关卡凑数量。

[打开在线合集](https://wangzifan396-wzf.github.io/mini-browser-games/) · [下载星团大作战 1.0.0](https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v1.0.0) · [完整更新日志](CHANGELOG.md)

## 推荐先玩

按你想玩的类型选，不必先翻完整目录：

| 想玩什么 | 入口 | 从这里开始 |
| --- | --- | --- |
| 吞噬竞技 / 好友联机 | [星团大作战 1.0.0 · Windows](https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v1.0.0) | 十种模式，可独自挑战 AI 或与朋友建房；LAN 自动发现，异地需自部署服务。免安装可选便携 ZIP |
| 卡牌肉鸽 | [山海伏魔录](https://wangzifan396-wzf.github.io/mini-browser-games/shan-hai.html) | 选行者、组牌、拿遗物，在分支事件和首领间做构筑取舍 |
| 放置经营 | [星炉工坊](https://wangzifan396-wzf.github.io/mini-browser-games/starforge-idle.html) | 经营生产链、研究和远航，逐步进入战斗、装备与重启循环 |
| 自由创作 / 音乐 | [脉冲音乐室 · 自由编曲](https://wangzifan396-wzf.github.io/mini-browser-games/pulse-studio.html) | 自己写旋律、复制变奏、安排整曲；可保存完整工程、分享工程码和导出真正的 WAV |
| 自由建厂 | [微型流水线 · 开放工区](https://wangzifan396-wzf.github.io/mini-browser-games/tiny-factory.html) | 种子矿区与自主产线；公平汇流、暂停搬迁、独立筛选配置和堵塞诊断，旧合同保留 |
| 回合潜入 / 撤离 | [回声禁区 · 测试版](https://wangzifan396-wzf.github.io/mini-browser-games/development/echo-expedition.html) | 看敌人预告避险，权衡载重与撤退；可自由搜刮或完成灯塔行动链，当前仍在打磨 |
| 塔防构筑 | [芽阵前线](https://wangzifan396-wzf.github.io/mini-browser-games/garden-front.html) | 选择植物和本局进化，针对不同敌人与挑战词条调整阵地 |

想找其他类型？[查看完整目录](#游戏总览)。星团的[历史单 HTML 版](https://wangzifan396-wzf.github.io/mini-browser-games/ball-arena.html)与桌面联机版分开维护，不能把网页版当作 Windows 联机客户端。

## 快速开始

- **直接玩网页**：[打开在线合集](https://wangzifan396-wzf.github.io/mini-browser-games/)，或下载源码后双击 `index.html` / 任意根目录游戏 HTML。单文件游戏无需构建、Node.js 或后端；手机支持情况以各游戏为准。
- **双击玩桌面版**：[下载星团大作战 1.0.0](https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v1.0.0)。安装版可选安装位置；便携 ZIP 要完整解压后运行 `StarClusterArena.exe`，不需要额外安装 Node.js。
- **开发或自部署**：见[前后端扩展项目](#前后端扩展项目)与[源码运行说明](#如何运行)。互联网好友房需所有人连接同一台已部署的 HTTPS/WSS 服务，不包含免费公共服务器。

## 最新更新

- **2026-10-23**：音乐室升级自由编曲与 WAV 导出；开放工厂修复物流、搬迁和配置；冻结 9 款重复作品，乐园降至 C。
- **2026-10-16**：星团大作战 1.0.0 正式发布；重新整理推荐、下载入口、简介和标签。
- **2026-10-05**：回声禁区新增灯塔行动链与敌人角色；修复背包装备效果、自走棋攻速和存档兼容等问题。

[阅读完整更新日志与历史记录 →](CHANGELOG.md) · [自由编曲设计与测试](docs/pulse-composer-qa.md) · [去同质化依据](docs/curation-2026-10-23/README.md)

## 游戏总览

本表只收录 106 款 `SSS–D` 活跃作品；`D` 级是具备明确重制价值的候选池，允许在没有合适候选时保持为空；`E` 级历史废案仅保留源码与链接，不进入主动更新和日常审计。评级唯一名单位于 [GAME_TIERS.json](GAME_TIERS.json)，准入线与升降级规则见 [游戏质量评级标准](RATING_STANDARD.md)，逐款依据见 [GAME_AUDIT.md](GAME_AUDIT.md)。本轮不是对所有历史评级重新认证，每款游戏名称均可直接点击打开。

<details>
<summary>展开全部 106 款活跃游戏（按玩法分类）</summary>

### 策略、养成与大型玩法

| 评级 | 游戏 | 内容与玩法 | 操作 |
| --- | --- | --- | --- |
| SSS | [星团大作战](https://wangzifan396-wzf.github.io/mini-browser-games/ball-arena.html) | 自由、团队、生存、大逃杀、据点、霸屏、魔王等模式；吞噬成长、分裂围猎、外观商店与铁匠铺 | 鼠标/手指或摇杆移动；`Space` 分裂，`W` 吐球，`A` 合球，`D` 冲刺，`P` 暂停，`R` 重开；大厅可切模式，商店可导入导出存档 |
| SSS | [星炉工坊](https://wangzifan396-wzf.github.io/mini-browser-games/starforge-idle.html) | 挂机生产链、研究矩阵、专员、远航、自动战斗、装备、遗物、星环、天象和星核重启 | 点击校准与各分页按钮经营；战斗姿态和星炉协议用页面按钮切换；自动存档，存档页支持兑换码及导入导出 |
| SS | [霓虹装甲](https://wangzifan396-wzf.github.io/mini-browser-games/tank-arena.html) | 八种坦克规则、六底盘与六主炮、12 种局内模块、六系永久科技、方位装甲、熟练度、里程碑与战役纪录 | `WASD/方向键` 移动，鼠标/手指瞄准，左键/`Space` 开火，右键/`Shift/E` 技能，`P` 暂停，`R` 重开；车库可导出、导入存档码 |
| SS | [芽阵前线](https://wangzifan396-wzf.github.io/mini-browser-games/garden-front.html) | 六境 18 关选卡守线、24 株植物、19 类敌人、三位章节首领、四种挑战词条、叶能进化、无尽、传送带和每日模式 | 选卡后点击格子部署，点击日光/叶滴收集；数字键 `1–8` 选卡，`Space/P` 暂停，`Esc` 取消工具；远征大厅可导出、导入存档码 |
| SS | [薯仔突围](https://wangzifan396-wzf.github.io/mini-browser-games/spud-arena.html) | 自动射击肉鸽、六角色、六区域、12 种武器与进化、地区首领、遗物、主动战技、营地任务和永久升级 | `WASD/方向键`、鼠标或摇杆移动，`Shift` 冲刺，`Q` 战技，`Space/P` 暂停；营地可导出、导入存档码 |
| SSS | [山海伏魔录](https://wangzifan396-wzf.github.io/mini-browser-games/shan-hai.html) | 三行者卡牌肉鸽、三章 18 层分支地图、33 张双形态卡牌、12 件遗物、12 类普通妖物、六类精英、三位首领、六类事件、行者倾向牌池、五系道场、五重劫数和自动断点 | 选择行者与劫数后点击地图节点推进，点击手牌出牌并结束回合；安全节点自动保存，顶部“存档码”可跨设备恢复道场、纪录与远征断点 |
| SS | [晶塔前线](https://wangzifan396-wzf.github.io/mini-browser-games/moba-frontier.html) | 六英雄、六种 3v3 规则、三线推塔、双远古晶兽、12 项星契三次构筑、六类补给、S/A/B/C 评价、六枚勋章、英雄熟练度、天梯连胜和六项永久研究 | `WASD/方向键` 移动，点击战场移动或锁敌；`Q/W/E/R` 施放当前英雄技能，等级 2/4/6 选择星契，`Space/P` 暂停；大厅可导出、导入存档码并切换音效 |
| S | [符文自走棋](https://wangzifan396-wzf.github.io/mini-browser-games/auto-chess-forge.html) | 18 名英雄、10 类双系羁绊、格子接敌与射程、升星装备、利息连胜、锁店、同阵容侦察、赛季强化与 20 回合生存 | 购买英雄后部署到棋盘，围绕羁绊和装备调整阵型；刷新或锁定商店、侦察对手后开战，档案页支持跨设备存档码 |
| A | [灵兽远征](https://wangzifan396-wzf.github.io/mini-browser-games/monster-tamer.html) | 18 只灵兽、五岛路线、属性与状态克制、捕捉换兽、8 级进化、徽章和完整图鉴 | 点击技能进行回合战斗，压低生命后捕捉；根据敌方属性主动换兽，岛屿档案支持跨设备存档码 |
| S | [余烬战棋：九境远征](https://wangzifan396-wzf.github.io/mini-browser-games/ember-tactics.html) | 三章九任务、清剿/封印/守卫/撤离/首领五类目标、六名差异英雄、八枚双槽规则徽记、墙体/掩体/熔流地形、职业技能、三星与 `EMBER2` 档案 | 非战斗时编组三名英雄与至多两枚徽记；战斗中点击英雄后移动或攻击，消耗星火释放裂阵、贯星、星爆、壁垒、复燃或闪袭，再结束回合处理敌方 AI |
| S | [四季小农场](https://wangzifan396-wzf.github.io/mini-browser-games/pocket-farm.html) | 四季 16 种作物、再生与轮作、三种出身、居民关系、节庆、三份动态订单、六类建筑和年度图鉴 | 选择种子或工具后点击土地；通过每日体力规划种植、灌溉和收获，在溪谷镇送礼、交付订单并建设农场；档案支持跨设备存档码 |
| A | [口袋地铁](https://wangzifan396-wzf.github.io/mini-browser-games/metro-weaver.html) | 五座城市、六类线路与目的地、程序化新站、换乘寻路、桥隧地形、车辆分配、枢纽容量和每周升级 | 选择线路后点击车站规划网络，按线路增配列车并控制拥堵；跨河与长距线段消耗桥隧组件，城市档案支持跨设备存档码 |
| A | [孤岛十日：潮痕求生](https://wangzifan396-wzf.github.io/mini-browser-games/island-survival.html) | 三条十日路线、30 个固定事件、天气资源、采集制作、事件抉择、三星、命令回放与 `ISLAND2` 档案 | 每天规划四次采集、探索或补给行动，按天气制作设施并处理路线事件；可重放完整求生决策检查不同选择的后果 |
| A | [拍卖风云：三席竞局](https://wangzifan396-wzf.github.io/mini-browser-games/auction-fever.html) | 三座拍卖行、12 件固定拍品、12 条行情事件、三种对手性格、鉴定转售、三星、命令回放与 `AUCTION2` 档案 | 根据拍品类别、行情和对手出价习惯决定举牌、鉴定或放弃；席位结束后复盘竞价日志并经营藏品资产 |
| A | [背包角斗场](https://wangzifan396-wzf.github.io/mini-browser-games/backpack-arena.html) | 24 件装备、8 条合成链、四方向形状旋转与邻接、耐力冷却、三种流派、十胜或五败赛季 | 购买、旋转并摆放装备，利用合成和邻接形成流派后自动战斗；赛季档案支持跨设备存档码 |
| A | [微型流水线：开放工区](https://wangzifan396-wzf.github.io/mini-browser-games/tiny-factory.html) | 种子矿脉、自由扩产、配方与研究、公平汇流、筛选/分流物流、具体出口诊断、自定吞吐目标、`FACTORYFREE1` 档案；保留旧合同与 `FACTORY2` | 自主铺设产线、检查缺料与堵塞；暂停可整机搬迁且保留库存和进度，筛选配置与旋转分离；可单步与导出工厂 |
| A | [生态方舟：群落演替](https://wangzifan396-wzf.github.io/mini-browser-games/ecosystem-keeper.html) | 六个生态区、12 个物种、确定性气候序列、生产者/草食/捕食/分解四层趋势图、三类环境工程、三个长期项目、15 年目标、勋章与 `ECO2` 档案 | 引入物种、补水修土或建设长期项目后推进年份；观察趋势图并平衡多样性、稳定度、水源与捕食者，避免灭绝 |
| A | [微境协议：四域演算](https://wangzifan396-wzf.github.io/mini-browser-games/pathogen-protocol.html) | 四种传播情景、八地区网络、三套初始协议、12 项演化、24 个政策事件、周期预测、三星、命令回放与 `PATH2` 档案 | 选择初始协议并按周期购买演化、处理政策事件；结合下一周期预测控制传播、研究与损耗，自动演算或回放整套方案 |
| A | [方格帝国：六境远征](https://wangzifan396-wzf.github.io/mini-browser-games/pocket-empire.html) | 六张固定大陆、三种文明学派、六项科技、迷雾与持续疆域、确定性敌军、差异副目标、三星参考远征与 `EMPIRE2` 档案 | 选择学派后点击军团与相邻方格移动或作战；围绕资源地建设城市、招募军团、研究科技并按固定敌军军令推进时代 |
| A | [绿茵经理：临场冠军路](https://wangzifan396-wzf.github.io/mini-browser-games/touchline-manager.html) | 四支俱乐部、18 人阵容、21 场联赛杯赛、10 套对手模型、四类阶段指令、三段确定性 xG/进球/体能结算、对位换人、训练转会、六类设施和 `TM4` 档案 | 赛前配置首发、阵型、心态、逼抢、节奏与进攻重心；比赛中读取三段对手计划，从稳态试探、前场强压、控球降速、收缩反击中逐段下令，并在中场完成一次对位换人 |
| A | [前线指挥部](https://wangzifan396-wzf.github.io/mini-browser-games/frontier-command.html) | 三战线实时攻防、六兵种、六类基地建筑、三种指挥学说、战术技能、五章战役、精英波次和永久科技 | 选择战线部署部队，在资源、人口和能源间取舍；建设经济与军工设施，发动空袭、维修、超载或全线反攻；战役档案支持跨设备存档码 |
| A | [交易风暴：周期实验室](https://wangzifan396-wzf.github.io/mini-browser-games/market-pulse.html) | 六种 18 日确定性情景、八家公司成长/负债/壁垒/分红/波动差异、持续或定向新闻冲击、模型价值回归、交易费、分红、回撤授权、六项研究工具与 `MARKET2` 档案 | 阅读新闻的行业/公司范围与持续时间，按现金比例买入或减仓并逐日收盘；同时满足收益、最大回撤和特殊持仓授权，完成后用洞察安装研究工具 |
| C | [奇想乐园：经营原型](https://wangzifan396-wzf.github.io/mini-browser-games/wonder-park.html) | 票价、游客偏好、设施容量与跨日清洁联动；当前六园可被同布局覆盖，目标偏松，降级保留为经营原型 | 铺路建设、调整票价再开园；记录支持 `PARK2`，不再以六城数量宣传内容深度 |
| A | [蜂巢女王：四季谱系](https://wangzifan396-wzf.github.io/mini-browser-games/hive-sovereign.html) | 四条确定性十二日情景、48 天固定事件、三种女王谱系、五类工蜂岗位、六项双级设施、天气/威胁/热压模型、参考方案三星与 `HIVE2` 档案 | 选择情景与女王谱系，按每日天气和威胁分配采蜜、育幼、守卫、筑巢与侦察岗位；建设设施后结束当天，围绕蜂群、蜂蜜和健康目标完成四季谱系 |
| A | [极速配送网：三城班表](https://wangzifan396-wzf.github.io/mini-browser-games/courier-grid.html) | 三座差异路网、十二班固定班表、60 单急件/冷链/易碎订单、拥堵边、三种车型、最短路预测、三星参考路线与 `COURIER2` 档案 | 根据订单截止时间、车型容量和拥堵边点击站点编排路线；右侧实时预测覆盖、准时率和用时，确认发车后车辆沿每段最短道路执行 |
| A | [怪潮军议：十二城破阵](https://wangzifan396-wzf.github.io/mini-browser-games/monster-horde.html) | 四区十二城、48 个攻城阶段、9 类怪物、8 类英雄塔、三位统帅、固定塔阵与路线规则、逐夜标签反制、10 项异变、三种邪术、三星与 `HORDE2` 档案 | 选择合同与统帅后，点击路线和怪物契约编排进场顺序；释放怪潮后按路线施放黑雾、裂地或血契，逐夜选择异变并针对英雄 AI 的补防换编队 |
| A | [萝卜边境：十二线守望](https://wangzifan396-wzf.github.io/mini-browser-games/radish-guard.html) | 四区十二份固定合同、三张地图、72 个可复现波次、五类炮塔、六类敌人、三名守边人、差异经济与倍率、生命线/技能预算三星及 `RADISH2` 档案 | 选择合同与守边人，点击空地建塔、炮塔升级/出售或障碍清理；选择技能后点击战场施放，顶部控制开波、倍速、暂停与重开 |
| A | [信标车队：十二线护送战役](https://wangzifan396-wzf.github.io/mini-browser-games/signal-caravan.html) | 三区十二条确定性路线、78 波固定敌袭、自动射击、维修/脉冲/信标模块、三星与 `BEACON2` 档案 | `WASD/方向键` 移动护卫并自动攻击；用按钮维修、扫描或部署信标，`Space` 触发脉冲，`P` 暂停，`R` 重开 |

### 动作、射击与即时反应

| 评级 | 游戏 | 内容与玩法 | 操作 |
| --- | --- | --- | --- |
| SS | [霓虹贪吃蛇](https://wangzifan396-wzf.github.io/mini-browser-games/snake-game.html) | 三章 18 节点连续远征，每关拥有独立障碍、速度、猎手、裂隙与双挑战三星；另含三场多层首领、六模式、六框架、12 种协议、五系实验室、断点续航与里程碑 | `WASD/方向键`、滑动或方向按钮转向，`Shift` 释放脉冲，`Space` 暂停；远征站可继续未完成航线并导出、导入存档码 |
| S | [雷霆先锋：裂空战役](https://wangzifan396-wzf.github.io/mini-browser-games/thunder-vanguard.html) | 三空域九场确定性空战、七类编队、三类首领、三架差异战机、六件双槽模块、七种固定协议、连击雷暴、三星、勋章与 `THUNDER2` 档案 | `WASD/方向键` 或按住、拖动画布移动，战机自动开火；雷暴充满后按 `Space` 或点击雷暴清弹，`P` 暂停，战役机库可管理配置与档案码 |
| S | [彗尾织者：星幕远征](https://wangzifan396-wzf.github.io/mini-browser-games/comet-weaver.html) | 三章十二幕规则弹幕、圆环/扇面/车道/螺旋/折返/弯曲/交叉/猎手/迷宫敌幕、擦弹充能、彗核清屏、相位闪现、六件双槽星械、三星与 `COMET2` 档案 | `WASD/方向键`、拖动画布或方向按钮移动，`Space`/相位按钮闪现，`Q`/彗核按钮满能清屏并重创核心；贴近弹幕外缘积攒彗能 |
| A | [巷馆对决：八门擂台](https://wangzifan396-wzf.github.io/mini-browser-games/dojo-duel.html) | 四名可选武者、六名完整角色、八门三局两胜战役、八种馆主 AI 风格、专注与专属技、三星和 `DOJO2` 档案 | `A/D` 移动，`W` 跃步，`J/K` 轻重击，`L` 格挡，`Shift` 闪避，专注满后按 `I` 发动专属技 |
| S | [烛火地牢](https://wangzifan396-wzf.github.io/mini-browser-games/dungeon-delver.html) | 三职业、五层分支路线、祭坛商店、精英、五名守门者、12 件遗物、12 类祝福与余烬天赋 | `WASD/方向键` 移动，鼠标瞄准，点击/`Space` 攻击，`Shift` 冲刺，`Q` 战技；完整触屏操作，远征档案支持跨设备存档码 |
| A | [塔台指挥官：三港联调](https://wangzifan396-wzf.github.io/mini-browser-games/air-traffic-control.html) | 海湾/山谷/极昼三机场九班次、55 架固定计划航班、四类机型与尾流、天气漂移、限制空域、跑道关闭、优先任务、三星与 `ATC2` 档案 | 点击雷达航班后调整航向和高度、分配开放跑道并许可进近；建立高度与尾流间隔，避开低空限制区，在固定班次内完成目标落地 |
| A | [午夜监控室](https://wangzifan396-wzf.github.io/mini-browser-games/midnight-monitor.html) | 六个故事夜、五类可学习行为的异常体、九路监控、双门、通风口、音乐盒、诱饵、电力信号与六类设备升级 | 通过摄像头和声音征兆判断威胁路线，针对目标使用闸门、灯光、通风封锁或音乐盒并控制耗电；夜班档案支持跨设备存档码 |
| S | [深渊声呐：静默航线](https://wangzifan396-wzf.github.io/mini-browser-games/abyss-sonar.html) | 八次潜航、猎潜艇/护卫/水雷差异行为、被动噪声与主动辨认、残骸扫描、六项双槽潜艇模块、三星和跨设备档案 | 主动声呐辨认接触后点击锁定，调整航向并发射鱼雷；静默航行降低噪声，诱饵打断敌方解算，航线页管理模块与存档码 |
| A | [爆格特攻：连锁战役](https://wangzifan396-wzf.github.io/mini-browser-games/bomb-grid.html) | 十二份固定爆破合同、脉冲/贯穿/震荡三类模块、连锁引信、木箱阻挡、护盾与重核目标、三名行动员、三星、四枚勋章和 `BOMB2` 档案 | 选择模块后点击空地布置，第一枚为引信；让后续模块进入已有爆区形成完整连锁，再执行引爆；战术提示可逐枚呈现参考方案 |
| A | [潮汐电网：三相合同](https://wangzifan396-wzf.github.io/mini-browser-games/tidal-grid.html) | 十二份固定电网合同、低潮/平潮/高潮三相负载、潮能站、负载岛、蓄电站、横通/全通/纵通继电器、三星与 `GRID2` 档案 | 点击电缆顺时针旋转，切换三个潮位观察供电区域；同一接线必须在三相都满足连接与容量后才能通过验收 |
| A | [百果试刀：十二席料理委托](https://wangzifan396-wzf.github.io/mini-browser-games/fruit-slice.html) | 十二份固定出果脚本、499 个事件、297 份五色订单、78 枚铁胆、33 层首领果、三种刀具、四枚双槽刀印、三星与 `FRUIT2` 档案 | 按住鼠标或手指划过食材形成刀光；短划避开铁胆，分层果需等待切口冷却后补刀，委托外可配置刀具与两枚刀印 |
| A | [霓虹迷宫：十二夜巡线](https://wangzifan396-wzf.github.io/mini-browser-games/maze-chase.html) | 十二张固定夜图、58 枚信标、36 个能量核、36 条固定巡逻、三名差异巡线员、追猎者下一步预告、等待/相位冻结/能量反击、三星与 `MAZE2` 档案 | `WASD/方向键` 移动，`Space` 原地等待，`Q` 相位冻结；根据实心当前位置和空心下一步预告错开巡逻，收齐信标后抵达出口 |
| A | [潮汐拾荒：深蓝远征](https://wangzifan396-wzf.github.io/mini-browser-games/tide-salvage.html) | 五片星级航线、十六件分级遗物、强流/水母/水雷/电鳗、周期潮汐事件、水面结算、六类四级装备与 `TIDE2` 档案 | `WASD/方向键`、拖动画面或屏幕按钮移动，`Shift`/声呐按钮扫描；只有返回水面才会结算船舱，按风险主动结束航次 |

### 竞速、平台、体育与物理

| 评级 | 游戏 | 内容与玩法 | 操作 |
| --- | --- | --- | --- |
| SS | [弹弓风暴](https://wangzifan396-wzf.github.io/mini-browser-games/slingstorm.html) | 三章 18 节点物理解谜，四类技能弹丸、可破坏材料、风向与重力异常、三场风眼首领、独立挑战三星、五系工坊、里程碑和跨设备档案 | 鼠标/触屏向后拖拽蓄力并松开发射；飞行中点击或按 `Space` 用技能，`Q` 换风，`P` 暂停，`R` 重开；远征站可导出、导入存档码并切换音效 |
| A | [松果快跑：十二径巡游](https://wangzifan396-wzf.github.io/mini-browser-games/forest-dash.html) | 四区十二条固定有限路线、四类障碍、三类补给、三名差异跑者、松果/动作/错线/补给/得分验收、三星与 `DASH2` 档案 | `A/D` 或左右键换线，`W/↑/Space` 跳跃，`S/↓` 下滑，`P` 暂停；移动端可用屏幕按钮或滑动操作，抵达固定终点后按三项目标结算 |
| A | [雪岭巡降：十二道风雪赛段](https://wangzifan396-wzf.github.io/mini-browser-games/snow-ridge.html) | 四区十二条固定有限雪线、坡面/横风/雪崩差异、雪徽/翻转/救援/领先距离任务、三名滑手、三块雪板、参考与个人最佳幽灵、三星和 `RIDGE2` 档案 | `A/D` 或左右键旋转，`W/↑/Space` 跳跃，`S/↓` 稳身，`Shift/E` 冲刺，`P` 暂停；赛历可切换滑手、雪板与档案码 |
| S | [巅峰漂移巡回赛](https://wangzifan396-wzf.github.io/mini-browser-games/drift-racer.html) | 三条独立赛道与九站生涯赛事，四台车辆、八件双槽调校、星章解锁与车币购置、晴天/雨战/热浪/夜赛规则、弯心漂移、三星目标、六枚勋章和个人最佳赛事幽灵 | `W/↑` 加速，`A/D` 转向，`S/↓` 制动，`Shift/Space` 氮气，`P` 暂停，`Esc` 返回赛历；触屏使用方向与氮气按钮，档案页可导出、导入存档码 |
| S | [轨道弹球：三界巡回](https://wangzifan396-wzf.github.io/mini-browser-games/orbital-pinball.html) | 太阳环庭、双极熔炉、双门悖论三张规则桌台，轨道点亮、磁场弯曲、冷却靶、成对时隙、独立目标、六件双槽球体模块、三星与 `PIN2` 档案 | `A/←` 与 `D/→` 控制挡板，按住 `Space` 或发射按钮蓄力；根据桌台任务规划轨道、击靶或传送路线，完成目标分后结算星级 |
| S | [粉笔台球：九桌杆法赛](https://wangzifan396-wzf.github.io/mini-browser-games/chalk-billiards.html) | 三馆九桌、27 个固定单杆球型、指定袋口与力度印记、浅/深角切球、长台、干扰球、三种球杆、六枚双槽巧粉、三星、徽章与 `CUE2` 档案 | 在白球附近按下并向后拖拽，松手出杆；按发光袋口和底部力度区间完成球型，`R` 或“重摆本球”复位当前球型，赛历可管理配置与档案码 |
| S | [月面轻降：九站合同](https://wangzifan396-wzf.github.io/mini-browser-games/moon-lander.html) | 三地区九份重力/横风/窄台合同、三种着陆器、六项双槽任务模块、燃料/用时/精度三星、同源物理自动示范与 `LANDER2` 档案 | `W/↑` 或主推键点火，`A/D` 或左右键转向，`S/↓` 扶正；根据合同选择着陆器与两个模块，控制接触速度、倾角和平台偏差 |
| A | [棱镜破阵：十二座光学堡垒](https://wangzifan396-wzf.github.io/mini-browser-games/prism-breaker.html) | 十二张固定砖阵、360 块可破坏砖、清场/棱镜/核心三类目标、普通/装甲/棱镜/核心/障碍砖、四枚双槽模块、确定性掉落、三星与 `PRISM2` 档案 | 鼠标或手指移动挡板；击球偏侧改变反射角，`Space` 或模块按钮启动聚焦、分光、磁轨或护盾动作；核心需先解除棱镜护层 |
| A | [极光冰球：十二席杯赛](https://wangzifan396-wzf.github.io/mini-browser-games/air-hockey.html) | 十二场杯赛、差异 AI、标准/挡柱/窄门/加速等六类球桌规则、三种球拍、战术脉冲、加时疲劳、三星与 `HOCKEY2` 档案 | 鼠标或触屏拖动下半场球拍，利用偏心碰撞打出斜线；能量满后按 `Space` 或脉冲按钮改变近身冰球方向 |
| A | [云端跃迁：十二峰风径](https://wangzifan396-wzf.github.io/mini-browser-games/sky-hop.html) | 十二条固定有限风径、192 座稳固/弹簧/移动/云台/碎台、36 枚路线星片、12 套风场、三名跃迁员、滑翔/脉冲、参考与个人最佳幽灵、三星和 `SKY2` 档案 | `A/D` 或方向键、指针及屏幕按钮转向，按住 `Space` 或滑翔按钮展开滑翼，`Shift` 或脉冲按钮突进；角色自动弹跳 |
| A | [口袋高尔夫：三地巡回](https://wangzifan396-wzf.github.io/mini-browser-games/pocket-golf.html) | 苔庭/霜环/熔金三地十八洞、草地/沙地/冰面材质、墙面/水域/风场/弹性障碍/传送门、三类球杆与巡回用球、个人幽灵、三星和 `GOLF2` 档案 | 从白球向后拖拽并松开发球；按地形切换球杆与用球，利用反弹、传送门和风场规划落点；可显示参考球路或个人最佳幽灵 |

### 益智、棋类与桌面游戏

| 评级 | 游戏 | 内容与玩法 | 操作 |
| --- | --- | --- | --- |
| S | [霓虹 2048](https://wangzifan396-wzf.github.io/mini-browser-games/neon-2048.html) | 六章 18 节点星图远征，每关拥有独立盘面、生成底数、异常规则和双挑战三星；另含七模式、12 种协议、八件救盘工具、危急救盘、永久档案、里程碑与自动续局 | `WASD/方向键` 或滑动合成；点击工具后点目标格，`Z` 撤回，`Esc` 取消工具；矩阵站可继续未完成对局并导出、导入存档码 |
| S | [晶糖花园：四季委托](https://wangzifan396-wzf.github.io/mini-browser-games/gem-garden.html) | 四季十二份确定性委托、八类花床单双层土、六色订单、三位园艺师、六枚双槽园艺符、横/竖/星爆特殊晶糖、三星、徽章与 `GARDEN2` 档案 | 点击相邻晶糖交换或按住拖向相邻格；棋盘下方使用小锤、洗牌和提示，四连/五连生成特殊晶糖，委托簿可管理配置与档案码 |
| A | [棱镜果园：十二季光谱委托](https://wangzifan396-wzf.github.io/mini-browser-games/prism-orchard.html) | 十二份固定光谱委托、28 棵单色/复合光谱果树、斜镜/分光器/棱镜/三色滤镜、三种园艺组、实时 RGB 光路、提示、三星和 `ORCHARD2` 档案 | 选择器件后点击格子布置，再次点击可旋转分光器或棱镜；用撤回、清空和提示修正光路，依次满足果树外圈标出的红、绿、蓝通道 |
| A | [叠色印局：十二张套印委托](https://wangzifan396-wzf.github.io/mini-browser-games/chromatic-press.html) | 四辑十二张固定委托、63 块青/品红/黄一次性印版、8 种可旋转版形、134 个着色目标格、七类减色结果、落版预览、提示、三星和 `PRESS2` 档案 | 选择印版并旋转后，在画布上移动预览并点击落版；让当前印样与目标样张逐格一致，可随时撤回或请求下一块版的落点提示 |
| A | [色谱实验室：十二份混合物分离](https://wangzifan396-wzf.github.io/mini-browser-games/chromatography-lab.html) | 四辑十二份固定样品、52 个组分实例、30 个唯一组分、三类固定相、三种溶剂梯度、三档柱温与流速、实时保留时间/峰宽/分离度模型、三星和 `CHROMA2` 档案 | 组合固定相、溶剂梯度、柱温与流速，观察 Canvas 色谱峰和最小分离度；在 `Rs ≥ 1.50` 的前提下控制运行时间，可用提示逐项校准或撤回上一步 |
| A | [齿轮校时：十二座钟芯委托](https://wangzifan396-wzf.github.io/mini-browser-games/gear-calibrator.html) | 四辑十二座固定钟芯、20 种传动匣、68 次库存配置、44 个受限级位、齿数比/方向/效率/扭矩验收、撤回提示、三星和 `GEAR2` 档案 | 选择传动匣，必要时翻面后装入级位；让输出转速、方向和最低扭矩同时吻合，级位还会限制传动类型、材料和最大齿数 |
| A | [电网守门人：十二站保护整定](https://wangzifan396-wzf.github.io/mini-browser-games/relay-coordination.html) | 四章十二座固定电网、77 个继电器实例、114 项一次/拒动后备试验、正常负荷防误动、选择性时限级差、灵敏度/时限预算、提示撤回、三星和 `RELAY2` 档案 | 为每级保护选择动作电流与动作时限，定位或演练单项故障，观察故障路径和最先动作的断路器；整站测试一次保护、上级后备与预算，修正越级、同跳或拒动 |
| A | [潮门值班：十二班船闸调度](https://wangzifan396-wzf.github.io/mini-browser-games/lockmaster-shift.html) | 四辑十二班、60 艘六类货船、34 个往返批次、差异岸线水位、2–5 格舱容、易碎货急泵限制、交付时限、时刻/能耗双预算、三星和 `LOCK2` 档案 | 校平水位后开闸，点击岸边船只分批进舱，闭闸并选择节能/标准/急泵逐级升降，再在目的岸开闸出舱；可用提示、撤回和重置修正调度 |
| A | [桁架工坊：十二座山谷验算](https://wangzifan396-wzf.github.io/mini-browser-games/truss-workshop.html) | 四辑十二座固定桥梁、114 个节点、237 条候选测线、192 根参考杆件、32 个静载/移动/制动/横风工况、三种材料、节点平衡、拉压容量、长杆失稳、三星和 `TRUSS2` 档案 | 选择松木、精钢或拉索后依次点击两个节点架杆；切换工况查看蓝色受拉与红色受压轴力，点击杆件检查利用率，以全工况安全和工料预算完成验收 |
| A | [频谱调音台：十二份信号净化](https://wangzifan396-wzf.github.io/mini-browser-games/spectrum-console.html) | 四辑十二份固定合同、96 点离散采样、低通/高通/带阻/延迟/增益五类双参数模块、2–4 槽模块链、时域与八峰频谱反馈、均方根/峰值误差验收、三星和 `WAVE2` 档案 | 按顺序把模块填入有限槽位并选择参数，实时比较输入、目标和输出波形及频谱；用验收、提示、撤回和清空逐步收敛到目标信号 |
| A | [像素线索：十二卷逻辑图鉴](https://wangzifan396-wzf.github.io/mini-browser-games/pixel-clues.html) | 四章十二张唯一解谜格、304 个目标像素、5×5 至 8×8 递进尺寸、拖动涂格、候选集合提示、自动排除、三种校勘笔、三星和 `PIXEL2` 档案 | 选择填黑、画叉或擦除后点击或拖动谜格；`1/2/3` 切换工具，`Z` 撤回，`H` 获取逻辑提示；按行列数字顺序还原全部目标像素 |
| A | [静夜纸牌：十二局星图残局](https://wangzifan396-wzf.github.io/mini-browser-games/solitaire-classic.html) | 四章十二局确定性残局、444 张残局牌、三局完整牌组、16–60 步参考路线、翻一/翻三、暗牌与牌库递进、完整 52 张种子/每日自由牌局、三星和 `SOL2` 档案 | 点击明牌后点击目标列或对应基础堆；点击牌库抽牌，双击明牌可直接收牌，也可用自动收牌、提示、撤回和重置控制牌局 |
| A | [仓库推箱：十二班调度](https://wangzifan396-wzf.github.io/mini-browser-games/sokoban-quest.html) | 四章十二座固定仓库、27 只货箱、静态死角与动态死锁检测、当前局面 BFS 路线提示、无限撤回、三星和 `SOKO2` 校验档案 | `WASD/方向键` 或屏幕方向键移动，`Z` 撤回，`R` 重开，`H` 请求下一步提示；全部货箱入库后按推动、步数与提示使用情况验收 |
| A | [午夜棋局：十二局战术谱](https://wangzifan396-wzf.github.io/mini-browser-games/midnight-chess.html) | 四章十二局固定规则战术谱、完整王车易位/吃过路兵/四种升变、将死/逼和/子力不足/五十回合/三次重复、标准双人及三级 AI、撤回、着法记录与 `CHESS2` 档案 | 战术谱按目标完成将杀、特殊着法或和棋判断；标准模式点击棋子后选择合法目标格，升变前可选后/车/象/马，也可关闭 AI 进行本地双人对局 |
| A | [钟楼密室：六刻回廊](https://wangzifan396-wzf.github.io/mini-browser-games/clockwork-escape.html) | 六章 37 个可调查物件、40 段道具/密码机关链、动态提示、参考解三星与 `ESCAPE2` 档案 | 点击物件调查；选中道具后点击目标使用，按场景线索提交数字密码；章节按钮切换已解锁回廊 |
| A | [深海舰队：静默海域](https://wangzifan396-wzf.github.io/mini-browser-games/fleet-duel.html) | 六片 8×8 固定海域、30 组舰艇配置、三名差异舰长、礁区、追击 AI、九宫声呐、三星参考航迹与 `FLEET2` 档案 | 点击敌方坐标开火并根据命中方向推断舰身；切换声呐后选择中心格读取九宫未毁舰段数，利用舰长的侦察、校射或装甲能力保全舰队 |
| S | [河牌之夜：三席读牌赛](https://wangzifan396-wzf.github.io/mini-browser-games/river-holdem.html) | 潮港/雾桥/天际三桌巡回、红狐/蓝鲸/夜枭三种可识别 AI、标准小盲大盲、逐街行动、全押与三层边池、平分底池、随机范围胜率、三星、六枚勋章和 `RIVER2` 断点档案 | 轮到你时选择过牌/跟注、弃牌或全押，也可拖动滑杆指定加注总额；根据位置、底池赔率、公共牌和对手风格管理筹码，逐桌赢下三席冠军 |
| S | [逆转法庭：六案终审](https://wangzifan396-wzf.github.io/mini-browser-games/courtroom-clash.html) | 六案十八段交叉询问、72 句证词、30 件证物、逐句追问公开隐藏证物、连续异议、责任人/实施方式结案论证、三星与 `COURT2` 档案 | 切换证词并在关键句追问细节，选择已公开证物后对直接矛盾提出异议；连续击破三段证词，再组合责任人与实施方式完成结案 |
| A | [字节机器人：指令远征](https://wangzifan396-wzf.github.io/mini-browser-games/bytebot-lab.html) | 三章 12 关编程解谜、前进/转向、×2/×3 循环、墙面传感、跳跃裂隙、开关门、传送环、源码/步数三星、六枚勋章与 `BYTE2` 档案 | 编排有限指令后运行程序；让机器人收齐芯片并抵达终点，逐步学习循环、条件式墙感与机关交互 |
| A | [小屋收纳师：十二室委托](https://wangzifan396-wzf.github.io/mini-browser-games/cozy-organizer.html) | 四章十二室、98 件多格物品、旋转、区域限制、障碍、边缘/相邻/分离规则、撤回、提示、参考布局三星与 `COZY2` 档案 | 选择物品并旋转后放入合法格位，按房间委托完成分类、邻接和空间约束；可撤回、查看提示或套用参考布局，通关后保存章节星级 |
| A | [十字词咖啡：十二桌主题词盘](https://wangzifan396-wzf.github.io/mini-browser-games/crossword-cafe.html) | 四辑十二张固定主题词盘、85 个主题词、323 个有效格、74 个真实交叉点、最大 14×13、横纵线索、交叉方向切换、查错/提示/撤回/清空、27 键触屏键盘、三星和 `CROSS2` 档案 | 选择白格并输入英文单词，横向/纵向线索会同步校验交叉字母；可切换方向、查错、提示或撤回，完成主题桌后进入下一桌 |
| A | [冰壶残局：十二局定线](https://wangzifan396-wzf.github.io/mini-browser-games/curling-endgame.html) | 四章十二局固定残局、36 次投壶、5 档角度/5 档力度、同源碰撞位移、按钮区计分、`25^3` 序列枚举、冰面 Canvas、三星和 `CURL1` 档案形成原创物理残局战役；12 局均有最低总力度参考击球 | 为每一壶选择角度与力度，观察已有冰壶位置并利用碰撞；三壶后达到目标得分且总力度不超三星线，可撤回或请求教练示范 |
| A | [彩窗修复：十二扇光纹委托](https://wangzifan396-wzf.github.io/mini-browser-games/mosaic-jigsaw.html) | 四辑十二扇固定彩窗、171 块可旋转玻璃片、六种釉色接缝、54 个纹章/朝向铭印位、实时校勘、撤回提示、三星和 `GLASS2` 档案 | 选择料盘中的玻璃片，必要时旋转后装入窗格；让四周深铅封边、相邻釉色一致，带铭印的位置还要匹配纹章与正向标记 |
| S | [骰域远征：命运岔路](https://wangzifan396-wzf.github.io/mini-browser-games/dice-delver.html) | 灰烬回廊/月蚀赌城/天穹骰塔三地区十八节点、三名旅者、八种骰型、敌人行动预告、事件商店营火、十二件规则遗物、地区三星与 `DICE2` 断点档案 | 每回合最多掷三次并锁骰，观察敌人攻击/架盾/扰乱预告后使用组合；在战斗、精英、事件、商店、营火与首领间选路形成构筑 |
| A | [方块熔炉：十二张锻造蓝图](https://wangzifan396-wzf.github.io/mini-browser-games/block-forge.html) | 十二份固定锻造合同、62 枚模具、144 个目标炉层、稳态/高温/精密三种炉型、严格蓝图压合、暂存、回炉、三星与 `FORGE2` 档案 | `A/D` 或左右键移动，`W/↑` 旋转，`S/↓` 软降，`Space` 硬降，`C` 暂存，`Z` 回炉；按种类、方向与落点完整压合蓝图 |
| A | [噪声译码：十二信道](https://wangzifan396-wzf.github.io/mini-browser-games/cipher-relay.html) | 十二组六位中继码、96 条叠加读数、每关唯一污染信道、穷举唯一解校验、波形监视、三星与 `CIPHER2` 档案 | 点击 A–F 中继切换高低电平，根据八条子集计数还原六位码；再点击一条读数标记噪声源并执行校验 |
| A | [城市频率局：十二张干扰图](https://wangzifan396-wzf.github.io/mini-browser-games/frequency-bureau.html) | 四章十二张固定网络、102 个基站、266 条干扰边、46 条强干扰边、三至五频道、频道容量、锁定站、改频预算、三星和 `FREQ2` 档案形成原创图约束战役；12 套参考协调覆盖全部频道并共享正式验收器 | 点击网络节点或站点卡选站，再分配频道；普通边两端不得同频，强干扰边至少相差两档，同时控制频道容量和改频数，可检查单站、撤回或装入协调参考 |
| A | [天文台值班：十二夜观测窗](https://wangzifan396-wzf.github.io/mini-browser-games/observatory-watch.html) | 四章十二个固定夜班、48 个连续曝光目标、96 个离散时格、可见窗口、月光上限、三类仪器校准空档、最小跨度枚举、夜空 Canvas、三星和 `OBS1` 档案形成原创观测排程战役；12 套官方值班表均达到最小紧凑跨度 | 先选目标，再点时间格设置曝光起始时刻；让连续曝光完整落入可见窗并满足月光上限，不同仪器之间至少空一格作校准，在公开跨度内零风险提交 |
| A | [无人机测绘：十二幅覆盖合同](https://wangzifan396-wzf.github.io/mini-browser-games/drone-survey.html) | 四章十二幅 6×6 固定测绘图、176 个目标格、96 条候选航段、多组禁飞格、基地/转场电量、位掩码覆盖求解、路线 Canvas、三星和 `DRONE1` 档案形成原创空间规划战役；12 套官方航线均为最低电量解 | 点击航段按顺序加入航线，覆盖全部目标格并避开红色禁飞格；航段会按顺序计算基地与转场电量，可点击已加入航段改序、撤回或请求导航员校样 |
| A | [流域调度：十二场洪峰演算](https://wangzifan396-wzf.github.io/mini-browser-games/basin-control.html) | 四章十二份固定降雨合同、96 个连续时段、上下游双库容传递、生态下泄/洪峰/发电/期末库容四重约束、`4^8` 枚举、降雨/河道/库容 Canvas、三星和 `BASIN1` 档案形成原创水文调度战役；12 套官方调度均为最低代价解 | 为八个时段选择蓄水、生态、常规或泄洪策略；观察状态曲线，避免溢洪并守住生态、洪峰和发电红线，可撤回或装入调度员参考 |
| A | [岩壁读线：十二面攀登路线](https://wangzifan396-wzf.github.io/mini-browser-games/climbing-route.html) | 四章十二面固定 8×6 岩壁、216 个抓点、24 个检查点、四类抓点体力、2.35 格最大可达距离、Dijkstra 最低体力读线、路线 Canvas、三星和 `CLIMB1` 档案形成原创路径规划战役；12 面岩壁均有最低体力参考路线 | 点击画布抓点按顺序攀登，路线必须从底部开始、经过两个检查点并到达顶行；抓点类型影响体力，可撤回、清空或套用教练最短读线 |
| A | [雾谷植鉴：十二柜双盲标本](https://wangzifan396-wzf.github.io/mini-browser-games/mist-valley-herbarium.html) | 四章十二柜、48 份固定标本、24 种植物、96 个候选条目，以叶形/栖地/叶缘/叶脉/汁液/荧光六类检验、证据唯一认证、最短检验求解器、三星与 `BOTANY2` 档案形成原创诊断推理战役；12 套参考认证全部零错误三星 | 切换 A–D 标本，比较右侧候选植物志，选择最有区分力的检验；证据只剩一个一致候选后贴上名称标签，四份标本全部唯一且正确才能提交整柜认证 |
| A | [深空扫雷：逻辑航图](https://wangzifan396-wzf.github.io/mini-browser-games/mine-matrix.html) | 十二片固定异形雷区、信标初始扫描、无猜逻辑生成、直接与集合包含推导、可解释提示、撤回、任务回放、三星和 `MINE2` 档案 | 点击探测，右键或标记模式插旗；“推导一步”只高亮当前盘面可证明的安全格或地雷，通关后可回放最后一次完整操作 |
| A | [星港巡线：欧拉航图](https://wangzifan396-wzf.github.io/mini-browser-games/starline-route.html) | 十二张固定星港图、166 条待巡航线、闭合/开放欧拉路线、动态剩余边求解、撤回、航图回放、三星与 `ROUTE2` 档案 | 从指定港口出发，依次点击相邻港口，让每条航线恰好经过一次并在目标港交班；走入死路后撤回或请求动态导航 |
| A | [数独工坊：十二式逻辑课](https://wangzifan396-wzf.github.io/mini-browser-games/sudoku-studio.html) | 经典、双对角线、杀手笼各四题，12 题唯一解校验、候选笔记、冲突高亮、撤回、可解释提示、三星与 `SUDOKU2` 档案 | 点击格子后按数字键 `1–9` 或屏幕数字；切换候选笔记记录可能值，`Backspace` 擦除、`Ctrl+Z` 撤回，推导按钮给出一步解释 |
| A | [星环合成：十二座引力实验室](https://wangzifan396-wzf.github.io/mini-browser-games/merge-orbit.html) | 十二份固定引力合同、12 种场型、70 枚固定来料、35 项三轨交付、三种观测艇、轨迹预报、横向牵引、投放回溯、三星与 `ORBIT2` 档案 | 移动指针、滑杆或 `A/D` 调整投放位，点击画布、投放按钮或 `Space` 放入天体；`Q/E` 左右牵引，`Z` 回溯上次投放 |

### 休闲、经营与创意玩法

| 评级 | 游戏 | 内容与玩法 | 操作 |
| --- | --- | --- | --- |
| S | [节拍饭团：夜市巡演](https://wangzifan396-wzf.github.io/mini-browser-games/beat-bento.html) | 三章 12 场节奏烹饪巡演，正拍、摇摆、双押、后段加速和暗拍改变读谱；四名主厨改变判定、得分、热度与耐心，并记录三星、最佳和六枚勋章 | `A/S/D/F` 或直接点击对应轨道处理米、苔、鱼、汤，`Space/P` 暂停，`R` 重开；巡演页选择场次与主厨并导出、导入存档码 |
| S | [影邮潜行：十二夜](https://wangzifan396-wzf.github.io/mini-browser-games/shadow-post.html) | 三章 12 张回合潜行地图，轮转、巡逻、逆转、长哨四类守卫拥有明确视野规则；烟雾与假信号、步数目标、无道具三星和六枚勋章组成长期战役 | `WASD/方向键` 或点击相邻格移动，`Space` 等待，`Q` 烟雾，`E` 假信号，`Z` 撤回，`R` 重开；任务簿可选关并管理存档码 |
| A | [夜市面摊：十二班灯火账](https://wangzifan396-wzf.github.io/mini-browser-games/noodle-shift.html) | 四条夜街十二班、121 份固定订单、11 种面谱、六类配料、三口锅并行调度、三种餐车、耐心与下一单预告、错单/超时、三星和 `NOODLE2` 档案 | 选择夜班与餐车后开摊；点击订单接单，选锅下面、起锅，再按面谱添加配料并出餐；可倒锅、暂停，数字键 `1–3` 快选锅位 |
| A | [潮汐渔港](https://wangzifan396-wzf.github.io/mini-browser-games/fishing-harbor.html) | 24 种鱼、五海域、天气时段、蓄力抛竿与搏鱼小游戏、鱼市、委托和六类港口升级 | 蓄力决定抛竿距离，咬钩后控制张力完成搏鱼；回港出售、交付或建设，船长日志支持跨设备存档码 |
| A | [万象炼金室：十二份成分委托](https://wangzifan396-wzf.github.io/mini-browser-games/alchemy-workshop.html) | 四章十二份固定实验委托、20 种五维素材、14 类可发现反应、四种器具、三档火候与时长，以三项效力区间、精确中心、杂质、成本、成分档案、三星和 `ALCH2` 档案形成可复核配方学战役；12 套参考配方共享正式仿真器并全部三星 | 选择二至四种素材并设定器具、火候与时长；先实验记录赤热/澄明/生机贡献和反应，再围绕公开验收区间调整，达到精确中心、杂质上限和成本线后提交配方 |
| A | [展柜守护：十二馆微气候](https://wangzifan396-wzf.github.io/mini-browser-games/museum-climate.html) | 四章十二馆、72 个连续环境时段、六类藏品安全带、七种控制策略、温湿度状态传递、照度风险、最低能耗穷举求解、曲线 Canvas、三星和 `CLIMATE2` 档案形成原创连续控制战役；12 套参考班表均为最低能耗零风险解 | 读取六段室外温度、湿度与照度预报，逐段选择待机、冷却除湿、加热增湿、恒温增/除湿、遮光或密闭缓冲；观察连续柜内曲线，在零风险前提下降低总能耗 |
| A | [脉冲音乐室：自由编曲](https://wangzifan396-wzf.github.io/mini-browser-games/pulse-studio.html) | 四乐段六轨十六步、独立音高、大小调、Swing、静音/独奏、确定性变奏、整曲编排、完整作品架、`PULSESONG1` 工程分享与 PCM WAV 导出；旧巡演和 `PULSE2` 保留 | 点格子改力度，选中旋律格后改音高；复制/变奏与编排均可撤销，支持桌面/触屏和本地离线创作，首次试听需点击授权声音 |
| A | [荒野摄影师：十二次生态调查](https://wangzifan396-wzf.github.io/mini-browser-games/photo-safari.html) | 六个生态区、十二次固定调查、24 个物种和 72 段可复现踪迹，以必要行为证据、有限快门、构图/焦距/行为/清晰度评分、图鉴、三星和 `PHOTO2` 档案组成可复核摄影战役；12 套参考摄影共享正式评分器并全部无提示三星 | 选择调查后开始观察或逐秒等待，点击/触摸画面移动取景圈并调节焦距，在行为窗口按下快门；每场需拍齐三个不同物种的必要证据，可查看踪迹提示、重新调查或导出档案码 |
| A | [口袋伙伴：星愿谱系](https://wangzifan396-wzf.github.io/mini-browser-games/pocket-companion.html) | 四段十二日旅程、每日三次行动、天气与探索选择、颜色记忆训练、勇气/聪慧/亲和/安稳四维性格、中期分支、八种终末形态、四类设施、图鉴与 `PET2` 档案 | 用喂食、玩耍、清洁、训练、探索和小憩安排每天行动；保持需求、完成旅程性格目标并积累羁绊，不同成长质量与主性格共同决定终末形态 |
| A | [边境值勤：审查档案](https://wangzifan396-wzf.github.io/mini-browser-games/checkpoint-inspector.html) | 六日 30 宗确定性档案、逐日叠加规则、护照与通行证字段核验、双证比对、日期尺、可解释违规原因、日星章与 `CHECK2` 档案 | 对照当日规则逐项核验两份证件并裁定；系统在结果中说明具体违规原因，连续三次错误会终止当日值勤 |
| A | [焕新清洁队：十二材质委托](https://wangzifan396-wzf.github.io/mini-browser-games/clean-slate.html) | 十二份固定材质委托、269 个污点与 385 层浮尘/油膜/旧漆/锈斑、四类对应工具、叠层顺序、耗材与损伤预算、三星和 `CLEAN2` 档案 | 观察当前可见污层，切换清水喷头、泡沫刷、振动刮片或抛光轮后按住拖动；错误工具会损伤表面，验收按洁净度、损伤与提示结算 |
| A | [幸运符文机](https://wangzifan396-wzf.github.io/mini-browser-games/charm-reels.html) | 24 种符号、12 枚护符、三位契约人、八期租约，以及邻接、转化、消耗和连锁构筑 | 旋转结算金币并支付递增租约，每轮从符号与护符中调整牌袋；图鉴、成就和跨设备存档码均在档案中管理 |
| A | [万象爪局：十二柜收藏委托](https://wangzifan396-wzf.github.io/mini-browser-games/claw-carnival.html) | 四区十二台固定柜、144 件可复现奖品、16 类重量/摩擦/材质收藏、真实导轨摆幅与确定性抓力、三名操作员、三种爪头、三星和 `CLAW2` 档案 | `A/D` 或左右键移动，`S/↓` 稳爪，`W/↑/Space` 下爪；也可点击机台定位并用底部按钮操作，柜台页切换操作员、爪头与档案码 |
| A | [元素落沙实验室：反应档案](https://wangzifan396-wzf.github.io/mini-browser-games/elemental-sandbox.html) | 三章九项研究、11 种可绘材料、蒸汽/玻璃/水培/连燃/灭火/融冰/腐蚀/中和/导电九类反应、三星、图鉴与 `ELEM2` 档案 | 选择材料后按住鼠标或手指绘制，用容器、接触面和反应链完成研究条件；可暂停、清空和重玩刷新星级 |
| A | [镜前主编：十二期封面委托](https://wangzifan396-wzf.github.io/mini-browser-games/runway-stylist.html) | 四辑十二份固定简报、40 件五类别单品、11 类风格、14 类材质、风格/色盘/细节/预算/统一五轴透明评分、Canvas 预览、三星与 `STYLE2` 档案 | 切换上装、下装、外套、鞋履和配饰，从每类选择一件；根据实时审稿调整风格、色盘、材质版型与预算，达到 70 分后通过封面审定 |
| A | [群星来信：十二夜回声航程](https://wangzifan396-wzf.github.io/mini-browser-games/branching-tales.html) | 五幕十二夜、24 封两阶段来信、72 个回复、14 名发信者、四项舰群状态、每夜三格带宽、20 条伏笔、三名操作员、八种结局和 `LETTER2` 档案 | 阅读两封当夜通信并在三格带宽内选择回复；观察舰体、信任、证据和能源变化，完成当夜结算后进入下一夜，尝试以不同操作员收集全部结局 |
| A | [字灵守门：十二卷声韵战线](https://wangzifan396-wzf.github.io/mini-browser-games/glyph-warden.html) | 四章十二卷固定拼音战役、134 只三线来字、48 组词、墨/疾/甲/游四类字灵、三名守卷人、墨震、三星和 `GLYPH2` 档案 | 实体键盘直接输入拼音，首字母自动锁定最近合法目标；手机可使用完整 26 键，空格或按钮释放满充墨震，`Esc` 暂停 |
| A | [道岔快线：十二班表](https://wangzifan396-wzf.github.io/mini-browser-games/switchyard-rush.html) | 三座编组站、十二个固定班次、96 列四类列车、三向道岔、路线预测、信号保持、紧急停车、三星、Canvas 路线图与 `RAIL2` 档案 | 先观察进路预测再切换三向道岔，把列车送往目标站台；用保持信号和有限紧急停车处理冲突，完成每班表的安全送达和分数目标 |

</details>

## E 级历史废案（18 款）

<details>
<summary>展开保留的废案与基础复刻</summary>

这些页面继续保留在线地址、源码和 Git 历史，但不计入活跃游戏数量，不参加日常质量审计，也不进入近期升级队列。

| 评级 | 游戏 | 原有内容 | 操作 |
| --- | --- | --- | --- |
| E | [电池实验室：十二组循环合同](https://wangzifan396-wzf.github.io/mini-browser-games/battery-cycle.html) | 12 组参考仅 5 种循环；快充和均衡从未进入最优参考。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [霓虹二十一点](https://wangzifan396-wzf.github.io/mini-browser-games/blackjack-table.html) | 筹码、下注、发牌、要牌、停牌、加倍和庄家自动补牌 | 点击发牌开始，随后选择要牌/停牌/加倍；非对局时点击调整下注 |
| E | [四子战线](https://wangzifan396-wzf.github.io/mini-browser-games/connect-arena.html) | 七列四子棋、胜负判断、标准/高手 AI 和赛季比分 | 点击任意列落子；点击难度按钮切换 AI，点击新局重置棋盘 |
| E | [雾城侦探](https://wangzifan396-wzf.github.io/mini-browser-games/detective-desk.html) | 固定配对与答案验收；盘问不参与实际结案。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [像素飞翼](https://wangzifan396-wzf.github.io/mini-browser-games/flappy-glider.html) | 一键飞行、动态风门、区域提速、金门和完美连击 | 点击/触摸画布或按 `Space` 扇翼；穿过空隙，避免碰撞上下边界与风门 |
| E | [灯阵记忆](https://wangzifan396-wzf.github.io/mini-browser-games/lantern-memory.html) | 灯序记忆、重放和逐级加长 | 观察闪烁后按顺序点击；键盘 `1/2/3/4` 对应四灯，`R` 重开 |
| E | [麻将连台](https://wangzifan396-wzf.github.io/mini-browser-games/mahjong-link.html) | 64 张麻将配对、开放牌规则、洗牌、提示和清台目标 | 点击两个相同且至少一侧开放的牌消除；洗牌和提示使用顶部按钮 |
| E | [菜摊敲敲乐](https://wangzifan396-wzf.github.io/mini-browser-games/mole-market.html) | 好菜/坏菜辨认、小偷、连击、慢速专注和限时结算 | 点击坏菜与小偷，避开笑脸好菜；连击达标后点击专注减速目标 |
| E | [轨道配载局：十二次重心验舱](https://wangzifan396-wzf.github.io/mini-browser-games/orbital-stowage.html) | 12 航次同一恒等配载全部三星。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [点球热浪](https://wangzifan396-wzf.github.io/mini-browser-games/penalty-rush.html) | 六射门区、门将站位、三档蓄力、连击和赛季比分 | 点击射门区域踢球；点击“蓄力”切换弱/中/强，页面按钮开始新赛季 |
| E | [静默搜救：十二次声源定位](https://wangzifan396-wzf.github.io/mini-browser-games/silent-rescue.html) | 12 场仅两个目标格、两套最优传感器。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [掌心城市：十二城规划战役](https://wangzifan396-wzf.github.io/mini-browser-games/skyline-planner.html) | 同一布局覆盖 12 城，第一年全部三星。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [霓虹叠塔](https://wangzifan396-wzf.github.io/mini-browser-games/stack-tower.html) | 移动方块叠塔、完美连击、塔宽恢复、风速变化和本地最佳 | 点击/触摸画布或按 `Space` 放下当前方块 |
| E | [星舰疑云：航迹证词](https://wangzifan396-wzf.github.io/mini-browser-games/starship-suspects.html) | 六案都是 a+b / c+d / e+f 三组配对。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [地层档案：十二座遗址年代序](https://wangzifan396-wzf.github.io/mini-browser-games/stratigraphy-lab.html) | 每场证据直接顺序列出完整答案链。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [时间邮局：因果班表](https://wangzifan396-wzf.github.io/mini-browser-games/time-post.html) | 12 关只有 3 套规则，每组四关仅更名。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [风洞试验：十二组升阻合同](https://wangzifan396-wzf.github.io/mini-browser-games/wind-tunnel-contracts.html) | 三风速统一缩放，未形成有效工况冲突。 | 历史入口保留，停止更新；[审查依据](docs/curation-2026-10-23/README.md) |
| E | [五字密语](https://wangzifan396-wzf.github.io/mini-browser-games/word-grid.html) | Wordle 式五字母猜词、六次机会和颜色反馈 | 键盘输入字母，`Enter` 提交，`Backspace` 删除；也可点击屏幕键盘 |

</details>

## 前后端扩展项目

| 项目 | 技术与内容 | 启动方式 |
| --- | --- | --- |
| [Star Cluster Arena（星团大作战）](https://github.com/wangzifan396-wzf/mini-browser-games/blob/main/star-cluster-arena/README.md) | 1.0.0 正式版：十模式同源单人 / 好友联机，Windows 安装与便携版；支持 LAN 和自部署 HTTPS/WSS 异地房间，不附带公共服务器 | 进入 `star-cluster-arena/` 后运行 `node backend/server.mjs`；普通玩家从 [1.0.0 正式版下载](https://github.com/wangzifan396-wzf/mini-browser-games/releases/tag/sca-v1.0.0) 下载 Windows 成品 |
| [Starforge Nexus（星炉工坊）](https://github.com/wangzifan396-wzf/mini-browser-games/blob/main/starforge-nexus/README.md) | `starforge-idle.html` 的前后端高性能版本；WebGL2 程序化星炉、30Hz 固定模拟、GPU 缓存、DOM 降频与高刷新率动画 | 进入 `starforge-nexus/` 后运行 `node backend/server.mjs`；Windows 可直接双击 `start.cmd` |

## 项目宣传片

- [横版 V2 高清宣传片](https://github.com/wangzifan396-wzf/mini-browser-games/blob/main/promo-video/deliverables/mini-browser-games-promo-v2-hq-captioned.mp4)：93 秒，重点展示《星团大作战》和《星炉工坊》，并快速覆盖动作、肉鸽、塔防、MOBA、卡牌与益智代表作。
- [宣传片工程](https://github.com/wangzifan396-wzf/mini-browser-games/blob/main/promo-video/README.md)：包含实机逐帧采集、AI 中文配音、原创 BGM、字幕、混音、横竖版渲染与自动验收脚本。

宣传片使用 1920×1080 高质量实机画面、深沉中文男声和 H.264/AAC 编码；完整无字幕版和分轨素材可由工程脚本在本地重新生成。

## 如何运行

直接双击任意 `.html` 文件即可。若浏览器在本地文件模式下限制存档，建议在项目目录启动本地服务：

```bash
python -m http.server 8000
```

然后访问 `http://localhost:8000/文件名.html`，例如 `http://localhost:8000/ball-arena.html`。

## 项目说明

- 仓库保留 124 款自包含 HTML 游戏：106 款活跃作品、18 款历史废案；默认在线目录只展示活跃作品。
- 根目录单 HTML 游戏不依赖构建工具、后端服务或外部素材，归档作品仍可通过原在线地址访问；前后端与桌面项目的运行要求另见各自说明。
- 各游戏存档互相独立；网页版主要使用浏览器 `localStorage`，桌面版使用用户应用数据目录，升级前建议导出备份。
- 推荐使用最新版 Chrome、Edge、Firefox 或 Safari。
- 项目采用 [MIT License](LICENSE)。
