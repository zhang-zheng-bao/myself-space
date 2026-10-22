# 万创核心网页版执行服务

网页沿用桌面版 0.1.33 界面及业务引擎；不需要在服务器安装 Electron。
配置读取后台现有的加密文件，Cookie/KEY 不返回网页。已有配置无需重新录入，但部署必须保留原文件与原加密密钥。

## 服务器准备

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

全局并发使用后台参数（1–3）；每个浏览器最多同时提交 5 个作品、排队 10 个任务；参考音频 20MB，单个下载文件 300MB，任务最长 15 分钟。操作有限流。
文件按后台保留时长清理：没有运行任务且超过保留时间未使用的会话目录会删除。历史与文件同周期保存，不属于网站作品埋点数据。
任务及会话在单个 Node 进程内协调，部署时使用一个进程；多实例需要共享队列和会话存储后再启用。

## 同步桌面代码

```sh
node scripts/sync-wanchuang-engine.mjs ../WanChuangCore/main.js
node scripts/sync-wanchuang-ui.mjs ../WanChuangCore/src
```

生成后的服务引擎与网页文件纳入网站版本，生产环境无需桌面项目目录。同步后运行接口测试与构建，检查新增桌面方法是否需要网页接线。
