# 脉冲音乐室：自由编曲 QA

日期：2026-10-23。设计见 [SDD](pulse-composer-sdd.md)。本轮只深化一款创作游戏，不增加正式数量或提高评级：仍为 106 款活跃、18 款 E 级，脉冲保留 A。

## 实现与使用

双击根目录 `pulse-studio.html` 即可。默认自由编曲，先写 A 段、复制并修改 B 段，再加入歌曲编排；选择乐段试听或整曲试听。力度与旋律音高分别编辑，四种音色直接可用。歌曲支持最多 16 个编排条目、32 小节；核心另限制 180 秒。BPM 最低 60，因此当前最多 128 秒音乐，加默认 0.6 秒尾音。

草稿、三个完整作品架、工程码保存调速/音量/音色/调性/音符/编排。工程码与文件仅本地处理，不上传作品。坏导入先拒绝再提示，不覆盖当前作品。复制乐段与变奏、编排、导入和作品架载入可撤销。旧 PULSE2 迁移三个力度网格到 A–C；旧档没存 BPM，用 112，迁移不宣称复原旧版本的每个音色与旋律音高。

开发维护源在 `scripts/pulse-composer-core.js`、`pulse-audio-engine.js`、`pulse-composer-app.js`，用 `node scripts/sync-pulse-studio.mjs` 嵌入单 HTML。游戏运行不加载这三个文件；`--check` 在 CI 防止源与嵌入快照分叉。

## 已实际执行

| 验证 | 结果与边界 |
| --- | --- |
| 七套纯回归 | Node **183/183** 通过；包括原有 170 项、12 项编曲纯规则和一个执行 15 条音频合约断言的测试文件。音频 mock 验证调度、取消、重启竞态、迟到停止与节点清理，不冒充实际听感 |
| 编曲纯规则 | 160 种子完整工程往返、严格形状/非有限值拒绝、音高/大小调/Mute/Solo、复制与变化、Swing 成对总时长、编排顺序、旧档迁移、WAV 头/长度/峰值 |
| 真实界面 | 桌面 1440×1000、触屏模拟 390×844 两条完整流程通过：音符力度与音高、复制独立、移位/变奏撤销重做、排序重复、BPM/Swing/调性、三作品架、刷新、文件与坏码、试听停止、真实下载 WAV 与旧练习输入 |
| 恢复边界 | 另四条流程通过：存储被阻止、旧分数/负数档案、坏新草稿不覆盖、32 小节上限拒绝且控件恢复，不显示已失败的配置 |
| 实际音频 | **32 项 OfflineAudioContext PCM 检查**通过：六轨×四音色非零、确定性噪声、静音/独奏/零音量、音量线性、实际旋律音高、32 小节渲染、WAV 防削波。并行测试曾捕获一次样本不一致；离线图现保留到渲染完成再释放，补了提前 ended 回调不拆图的回归，后续复测通过。输出来自真正 Web Audio，不是生成空 WAV 或数学假波形 |
| 下载文件 | 两端均实际下载 WAV：44100Hz、单声道 PCM16；测试整曲音乐 10 秒、加尾音 10.6 秒，共 467460 帧/934964 字节。RIFF/数据长度正确且非零；导出的工程快照和事件数与同版整曲试听一致 |
| 布局与资源 | 修复手机的音序器撑页及长作品架标题导致的桌面网格溢出；两端无页面横向溢出（音序器自身可滚动）、无脚本/控制台错误、无外部运行资源请求 |

命令：

```powershell
node scripts/sync-pulse-studio.mjs --check
node --test scripts/test-existing-game-fixes.mjs scripts/test-factory-sandbox.mjs scripts/test-echo-expedition.mjs scripts/test-echo-campaign.mjs scripts/test-echo-compatibility.mjs scripts/test-pulse-composer.mjs scripts/test-pulse-audio.mjs
node scripts/check-pulse-composer.mjs
node scripts/check-pulse-audio-render.mjs
node scripts/check-browser-refresh.mjs --echo
node scripts/check-echo-campaign.mjs
node scripts/check-factory-logistics.mjs
node promo-video/scripts/check-tiny-factory-contracts.mjs
node promo-video/scripts/check-pages-catalog.mjs
node scripts/check-project-docs.mjs
node promo-video/scripts/check-game-tiers.mjs
```

实际 UI 与 PCM 脚本都使用独立无头浏览器并关闭设备音频输出，不占用用户前台、不发出后台试听声；渲染缓冲仍正常生成音频。截图、报告与试听 WAV 位于忽略提交的 `output/pulse-composer/`、`output/pulse-audio-render/`；CI 归档相应产物。首次 Tabbit 创建页面仍报 CDP 派发失败，确认零所属标签、安全结束任务后才改用隔离开发测试。

## 旧模式修复与限制

原巡演入口、十二场条件与 PULSE2 档案保留。旧坏档统一规范整数索引/星级/音色，存储失败不崩溃；切换练习提示网格损失；载入不再把编辑次数清零；重复相同评分不再持续奖励听众；循环首尾的留白按连续静音计算。两端实际点格完成首场三星并重复提交检查奖励，不宣称本轮重新验证了全部十二场难度。切换模式、编辑与页面转后台会停止声音，两种模式使用同一音频编译与合成路径，不同时播放。

这不是专业 DAW。导出为单声道、固定合成器，无录音或外部采样；不能保证操作系统后台节流时永不掉拍，严重迟到会停止。没有耳机/音箱人工听感、手机真机性能和长期创作留存测试；音色有辨识度的工程实现不等于已经证明悦耳。网页百分比不是安全分贝。历史评级不据此升级。

## CI 安装修复证据

上一批 [39826265782](https://github.com/wangzifan396-wzf/mini-browser-games/actions/runs/39826265782) 因 15 分钟上限被取消：npm 约 23 秒，Ubuntu 镜像的字体/系统库 24.6MB 下载耗时 11 分 56 秒，浏览器下载约 9 秒。取消前 16 个交互及桌面战役通过，不能记为全套成功。

本批将 Playwright 固定版本隔离安装到 runner 临时目录，排除视频工程依赖与区域镜像锁文件；不重复下载已有系统库，另有 30 秒无头启动预检。运行环境为 GitHub Ubuntu24.04，已有浏览器/系统库；失败明确终止，不跳过实际 UI 测试。参考 [官方 runner 浏览器清单](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md#browsers-and-drivers)。包源隔离是额外稳定性改进，不把它写成这次超时的已证根因。

目录测试的固定 4194 端口在本地复测遇到 Windows `EACCES`，改为由系统分配可用 loopback 端口，仍验证真实 HTTP 来源与链接；没有更改防火墙、关闭其他进程或占用外部网卡。
