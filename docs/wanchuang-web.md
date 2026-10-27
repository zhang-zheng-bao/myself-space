# 万创核心网页版执行服务

网页沿用桌面版 0.1.33 界面及业务引擎；不需要在服务器安装 Electron。
配置读取后台现有的加密文件，Cookie/KEY 不返回网页。已有配置无需重新录入，但部署必须保留原文件与原加密密钥。

## 服务器准备

### 当前 Windows 生产服务器：随 Git 部署自动准备

推送并合并到 `main` 后，部署工作流在 `npm ci` 之后、构建和重启之前自动运行 `npm run setup:wanchuang`，无需管理员远程手动安装。

- `scripts/wanchuang-dependencies.json` 固定 yt-dlp、FFmpeg 的版本、下载地址和 SHA256；下载后校验，升级时修改此文件。
- Chromium 使用 `package-lock.json` 锁定的 Playwright 安装器下载，随其版本升级。
- 二进制保存在部署目录 `.private/wanchuang-runtime/`，不上传 Git；脚本、版本清单、部署配置上传 Git。已有版本复用，首次部署需要下载，耗时较长。
- 安装后实际执行 yt-dlp、FFmpeg，并启动 Chromium 校验；全部通过才原子更新 `manifest.json`，安装或验证失败会终止部署，不重启现有服务。
- 服务读取清单中的绝对路径，不依赖部署账户的 PATH 或浏览器用户缓存；显式 `WANCHUANG_*` 路径仍优先，请勿保留失效的手工覆盖配置。
- 部署账户和 SYSTEM 服务都必须能读取该目录，`.private` 必须持久保留。后台 Cookie/KEY 与任务数据不受安装影响。

本地 Windows 也可运行 `npm run setup:wanchuang`；`npm run check:wanchuang` 仅验证已安装版本及清单，不下载。依赖验证只代表本地执行环境就绪，平台 Cookie 有效性、云服务 KEY 和完整业务任务仍须分别验证。

### Linux 或其他自行部署的环境

使用 Node.js 22 或更新版本，安装网站依赖后运行：

```sh
npm ci
npx playwright-core install --with-deps chromium
sudo apt-get update
sudo apt-get install -y ffmpeg python3-venv
python3 -m venv .private/ytdlp
.private/ytdlp/bin/pip install -U yt-dlp
```

在服务环境中设置以下变量（路径按实际部署目录填写）：

```dotenv
WANCHUANG_YTDLP=/网站目录/.private/ytdlp/bin/yt-dlp
WANCHUANG_FFMPEG=/usr/bin/ffmpeg
TOOL_SETTINGS_FILE=/网站目录/.private/wanchuang-settings.enc
WANCHUANG_DATA_DIR=/网站目录/.private/wanchuang-jobs
```

保留原来的 `TOOL_SETTINGS_SECRET` 或 `ADMIN_SESSION_SECRET`。浏览器默认使用 Playwright 安装的 Chromium，也可用 `WANCHUANG_BROWSER` 指定现有浏览器。
安装与运行服务使用同一系统用户；若不同，设置一致的 `PLAYWRIGHT_BROWSERS_PATH` 并授予读取权限。
然后运行 `npm run build` 并重启网站 Node 服务。后台「应用配置 → 万创核心」会显示三项运行依赖是否就绪。

Windows 服务器可使用已有的 `yt-dlp.exe`、`ffmpeg.exe`，将 `WANCHUANG_YTDLP`、`WANCHUANG_FFMPEG` 设为对应绝对路径。运行 `npx playwright-core install chromium` 安装浏览器，或将 `WANCHUANG_BROWSER` 设为已安装的 Edge/Chrome 路径。部署目录的 `.private` 必须持久保留，不能随部署包覆盖删除。

## 已连接的流程

- 抖音、小红书使用浏览器解析；B站、央视使用 yt-dlp。
- 下载队列、取消、重试、结果文件下载。
- 讯飞流式转写，提供 TXT / SRT 下载。
- MiniMax 音色读取、生成、克隆（上传参考音频），隐藏音色与收藏偏好。
- 同一浏览器的历史持久化；其他浏览器无法访问其结果文件。
- 网页不提供凭证编辑，仍由管理员集中配置。

音色管理和完整历史管理入口位于「管理员后台 → 应用配置 → 万创核心」，默认折叠。
管理员可刷新账号音色、统一隐藏／恢复前台可用音色；该设置对全部浏览器生效。前台不能更改音色可用性或移除历史记录。
历史管理汇总保留期内各浏览器的生成、转写和下载任务，可分类搜索、查看文案、下载结果、移除已结束记录。移除记录不会立即删除关联文件，文件按原保留策略清理。
前台仅展示自身任务进度、最近结果和结果下载，完整记录及管理操作由管理员使用。

全局任务并发使用后台参数（1–3）；每个浏览器每次最多提交 5 个作品、未结束任务最多 10 个；参考音频 20MB，单个下载文件 300MB。下载任务超时 15 分钟，转写任务超时 8 小时 5 分钟；实际音频上限仍受服务接口约束。操作有限流。
文件按后台保留时长清理：没有运行任务且超过保留时间未使用的会话目录会删除。历史与文件同周期保存，不属于网站作品埋点数据。
任务及会话在单个 Node 进程内协调，部署时使用一个进程；多实例需要共享队列和会话存储后再启用。

## 同步桌面代码

```sh
node scripts/sync-wanchuang-engine.mjs ../WanChuangCore/main.js
node scripts/sync-wanchuang-ui.mjs ../WanChuangCore/src
```

生成后的服务引擎与网页文件纳入网站版本，生产环境无需桌面项目目录。同步后运行接口测试与构建，检查新增桌面方法是否需要网页接线。
# 静音分段并发转写

网页继续使用实时转写接口。16 kHz 单声道 PCM 按 20 ms 帧计算 RMS；每段至少 20 秒，在持续 400 ms、低于 -40 dBFS 的静音区间中点切分。原音频采样连续保留，不重叠、不删减；返回的片段时间加上原始偏移，再按音频顺序合并文案与 SRT。

默认全站共用 2 路识别连接，包含不同浏览器的任务。服务器环境变量 `WANCHUANG_SPEECH_CONCURRENCY` 可设为 1–3（需匹配服务账号授权路数），修改后重启服务。后台原有“并发”仍控制完整任务数。单段故障会停止同任务其他连接，保留已发布文字，不把不完整结果标记成功。

短于 20 秒的音频通常保持单段。背景音乐可能导致无法检测到静音；长时间无静音的片段会写入临时 PCM 文件，完整识别不会因超过 5 分钟报错，也不会强行切断讲话。临时文件在任务结束或取消后清理。此方法是能量阈值检测，不等同于神经网络人声检测。两个分段各自按实时接口规定速度发送，实际加速取决于切分点、网络及账号并发授权。

识别前检查视频时长，超过 5 分钟（或无法确认时长）时弹出范围选择，默认“仅识别前 5 分钟”。只有明确选择“是，完整识别”，任务才保存 `fullRecognition: true`。服务器默认通过 FFmpeg 的 `-t 300` 限制实际识别音频；完整识别不加该限制，重试沿用原选择。
