# 迷你游戏合集宣传片工程

本目录用于生成《迷你游戏合集》的实机宣传视频。游戏本体不需要为录制而修改。

## 交付结构

- `deliverables/`：最终横版、竖版视频与混音文件
- `recordings-hq/`：V2 使用的高质量逐帧实机母版
- `voice/generated/`：中文配音分段和完整人声轨
- `audio/generated/`：原创 BGM、音效和分轨混音
- `subtitles/`：可导入剪映、必剪的 SRT/ASS 字幕
- `graphics/`：标题、封面和结尾页素材
- `storyboard.md`：旁白、镜头和时间码
- `scripts/`：录制、配音、音乐、合成和质检脚本

## 默认成片

- 横版 V2（推荐）：1920×1080，16:9，93 秒，高质量逐帧实机、深沉专业男声、H.264/AAC
- 主片：1920×1080，16:9，96.5 秒，H.264/AAC
- 竖版：1080×1920，9:16，46 秒，H.264/AAC
- 配音：V2 使用深沉专业男声，附其他备用样音
- 音乐：项目原创霓虹电子配乐，可公开使用
- 字幕：成片内嵌字幕，同时保留独立字幕文件

主片以《星团大作战》和《星炉工坊》为双核心，前 40 秒展示两款旗舰的实机和长线系统，之后快速覆盖动作、肉鸽、塔防、MOBA、卡牌与益智代表作。

V2 针对画质和音画同步进行了重制：浏览器画面以 JPEG 质量 96 逐帧采集，中间母版 CRF 10，最终成片 CRF 12；旁白采用更慢、更低沉的专业男声，并按实际音频时长锁定每款游戏镜头。

## 重新生成

```powershell
npm.cmd install
python -m pip install --target .tools\python -r requirements.txt
python scripts\generate-voice.py --samples
python scripts\generate-voice.py --full --voice deep-male
npm.cmd run music
npm.cmd run capture -- --hq
npm.cmd run render:v2
npm.cmd run cover
npm.cmd run verify
```

需要旧版横版或竖版时，再运行 `npm.cmd run capture`、`npm.cmd run render` 或 `npm.cmd run render:vertical`。

本机若已安装必剪，会自动复用其 FFmpeg；也可以通过 `FFMPEG_PATH` 指定其他完整版 FFmpeg。

仓库只发布推荐的 V2 字幕终版和 JPG 封面；无字幕版、逐帧母版及 WAV 分轨在本地生成，均可直接导入剪映、必剪或其他剪辑软件二次修改。
