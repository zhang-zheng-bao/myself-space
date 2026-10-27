# MySpace · 个人作品集与创作工具站

这是一个前后端一体的个人网站，集成作品展示、案例分析、图文图库、演示文稿、创作工具和内容管理后台。

- 前台：`/`，通过模块导航浏览内容；模块可在后台配置、排序和开关。
- 后台：`/admin`，集中维护内容、媒体、应用配置、访客和使用统计。
- 万创核心：`/tools/wanchuang/index.html`，独立的网页版创作应用，工具箱卡片直接跳转进入。
- 技术栈：React 19、TypeScript、Vite 6、Tailwind CSS 4、Express、Supabase；媒体支持腾讯云 COS 和 Supabase Storage。

## 2.0 之后的累计更新

以下按当前代码整理，截至 **2026-10-27**。`package.json` 仍为 `2.0.0`，本节记录后续累计功能，不代表另一个已发布的版本号。

| 方向 | 当前功能 |
| --- | --- |
| 内容模块 | 普通作品、AI 作品、案例分析、工具箱、图文分享、演示文稿等；案例分析默认位于 AI 作品之后，可配置封面与网页入口 |
| 图库与长图 | 多图上传、原始比例查看、缩放与快捷键；列表封面与正文图片分开，封面支持区域选择 |
| 演示文稿 | PDF / PPTX 展示、封面配置、翻页、全屏及自动播放 |
| 后台体验 | 应用分类配置、分组折叠、统一表单与提示；内容按变更保存，处理保存期间的后续编辑和冲突 |
| 站点检测 | 默认查看今天；页面、作品、视频和访客维度的停留与观看统计，内容删除后保留历史统计；超过两分钟有效停留的近期真人访问提醒 |
| 万创核心 | 视频素材解析与下载、文案转写、声音生成、音色克隆和结果文件下载；Cookie 支持请求头、插件 JSON 与 cookies.txt 导入清洗 |
| 音色与记录 | 管理员统一刷新、隐藏和恢复音色；隐藏仅影响前台，后台保留音色；克隆开关、分步骤克隆界面、任务历史与操作记录 |
| 转写流程 | 实时接口、静音分段并发、文案段落整理、带时间戳的 SRT 和 TXT 下载；超五分钟默认处理前五分钟，明确确认后完整识别 |
| 部署 | GitHub Actions 自动部署；Windows 自动准备和校验下载、音频处理、浏览器运行依赖，构建后重启并检查服务 |

应用运行依赖、平台 Cookie、服务账号凭证及账号并发授权分别影响功能是否可用；依赖安装成功或网站健康检查通过，不等于所有外部服务均已验证。

## 本地运行

使用 Node.js 22 或更新版本。复制环境模板后填写自己的配置：

```bash
npm ci
cp .env.example .env
npm run dev
```

Windows PowerShell 用 `Copy-Item .env.example .env` 代替 `cp`。未配置 Supabase 时可用本地 JSON 预览和保存基础内容；数据库统计、云存储及外部服务需分别配置。

默认打开以下地址；可通过 `.env` 的 `PORT` 修改端口：

- 前台：http://localhost:3010
- 后台：http://localhost:3010/admin

管理员登录使用 `.env` 中的 `ADMIN_PHONE` 和 `ADMIN_PASSWORD`。

## 万创核心网页版

Windows x64 安装和检查执行依赖：

```bash
npm run setup:wanchuang
npm run check:wanchuang
```

安装器按版本清单准备 yt-dlp、FFmpeg 和 Chromium，文件保存在 `.private/wanchuang-runtime/`。二进制不提交 Git，安装脚本和版本清单随代码部署；不需要安装 Electron。Linux 的安装方式见[执行服务说明](docs/wanchuang-web.md)。

在 `/admin` → 应用配置 → 万创核心配置平台 Cookie、转写与声音服务凭证。配置按应用和服务分组，公开应用不提供凭证编辑入口。后台还可控制音色克隆、管理隐藏音色、查看任务历史及操作记录。

转写采用以下规则：

- 超过五分钟的音频在提交前提示选择范围；默认、选择“仅识别前 5 分钟”或关闭提示，均只处理前 300 秒。时长未知时也会提示。
- 只有选择“是，完整识别”才处理全部音频。截取由服务端 FFmpeg 执行，重试保留原选择。
- 在持续至少 400 ms 的低音量区间中点切分，每段至少约 20 秒；默认全站共享两路识别连接，按原始顺序合并文案并还原字幕时间。
- 背景音乐可能影响静音检测；找不到静音时保留完整片段，长片段暂存磁盘，任务结束或取消后清理。
- `WANCHUANG_SPEECH_CONCURRENCY` 控制识别连接数（1–3，默认 2），与后台控制完整任务数量的“并发”不同，需匹配服务账号授权。

配置使用 AES-256-GCM 加密，默认保存至 `.private/wanchuang-settings.enc`。`TOOL_SETTINGS_SECRET` 至少 32 位；未单独配置时使用同样满足长度要求的 `ADMIN_SESSION_SECRET`。部署和备份必须同时保留配置文件与原加密密钥。

结果文件与应用历史按后台设置的 1–24 小时保留策略清理；操作审计独立记录，网站内容统计独立存入数据库。三者不是同一种数据。

## Supabase 配置

1. 创建 Supabase 项目。
2. 打开 Supabase SQL Editor，执行 `supabase/schema.sql`。
   启用内容停留与视频观看统计时，再执行 `supabase/engagement-analytics.sql`；升级已有站点也需执行该增量脚本，具体见[统计说明](docs/engagement-analytics.md)。
3. 在 `.env` 中配置：

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_STORAGE_BUCKET="portfolio-media"
ADMIN_PASSWORD="your-admin-password"
ADMIN_SESSION_SECRET="replace-with-your-own-random-secret-at-least-32-characters"
```

`SUPABASE_SERVICE_ROLE_KEY` 只在服务端使用，不会暴露给浏览器。

## 数据结构

后台保存时会写入这些表：

- `portfolio_profile`
- `portfolio_experiences`
- `portfolio_works`
- `portfolio_skills`
- `portfolio_prospects`
- `portfolio_contact`
- `portfolio_awards`

配置腾讯云 COS 时使用 COS 存储；未配置时使用 Supabase Storage 的 `portfolio-media` bucket。具体环境变量见 [.env.example](.env.example)。媒体地址随内容保存；图文、案例等扩展模块配置也使用 `profile.pageCopy`，不要求每个模块新建一张表。

## 构建、部署与检查

```bash
npm run lint
npm run build
```

生产运行需设置 `NODE_ENV=production`，再执行 `npm start`。PowerShell 示例：

```powershell
$env:NODE_ENV = 'production'
npm start
```

当前仓库的 [GitHub Actions 工作流](.github/workflows/deploy.yml) 在推送 `main` 后使用 Windows 自托管 Runner 更新部署目录；按锁文件变化安装 npm 依赖，校验应用运行依赖，构建、重启，再检查 `/health` 与网关连通性。此工作流包含当前服务器的目录和端口配置，迁移服务器时需调整；安装脚本不会替你开通云服务或填写 Cookie / KEY。

`.env`、`.private/`、上传文件与数据库应独立持久化并备份，不能随代码更新清空。应用任务和会话目前由单个 Node 进程协调，多实例部署前需要共享队列与会话存储。

转写与应用接口的回归检查：

```bash
npx tsx --test server/speech-duration.test.ts server/speech-scope.test.ts server/speech-parallel.test.ts server/realtime-completion.test.ts server/wanchuang.test.ts
```

覆盖识别范围选择、实际 FFmpeg 截取、静音分段、全局并发、字幕时间偏移、失败与取消清理等。实际云端识别效果和账号授权仍需使用有效凭证测试。

## 专项文档

- [万创核心执行依赖、安装与运行](docs/wanchuang-web.md)
- [管理员应用配置与凭证存储](docs/wanchuang-admin-settings.md)
- [页面、作品、视频和访客统计](docs/engagement-analytics.md)
- [工具箱历史需求与当前实现差异](docs/prd.md)

## API

- `GET /api/portfolio`：前台公开读取聚合后的作品集数据。
- `POST /api/admin/login`：管理员登录。
- `POST /api/admin/logout`：退出登录。
- `GET /api/admin/session`：检查登录状态。
- `PATCH /api/admin/portfolio`：按变更保存，检查冲突并保留无关修改。
- `PUT /api/admin/portfolio`：完整内容保存接口。
- `POST /api/admin/upload`：上传图片、视频、音乐、PDF、压缩包等媒体到 Storage。
- `GET /api/tools/wanchuang/state` / `POST /api/tools/wanchuang/action`：当前浏览器的应用状态和任务操作。
- `/api/admin/tools/wanchuang/*`：管理员专属的应用配置、音色、历史与操作记录接口。
- `GET /health`：服务存活检查。
- `POST /api/track`：创建一次访问并返回 `visitId`。
- `POST /api/track/dwell`：增量上报前台可见停留时间。
- `POST /api/track/events`：批量写入按钮与链接点击事件。
- `POST /api/track/engagement`：上报页面、作品和视频的累计参与时长快照。
- `GET /api/admin/analytics/summary?range=today|7d|30d|all&humanOnly=1`：汇总指标、趋势、地区/来源/设备分布和按钮点击排行。
- `GET /api/admin/analytics/visitors?range&humanOnly&page&pageSize&q`：分页搜索访客。
- `GET /api/admin/analytics/visitors/:visitorKey/visits`：某访客最近 100 次访问明细。
- `GET /api/admin/analytics/assistant-keywords?range&humanOnly`：聚合访客提问关键词，用于后台词云。
- `GET /api/admin/analytics/visitors/:visitorKey/conversations`：某访客的聊天会话目录。
- `GET /api/admin/analytics/visitors/:visitorKey/conversations/:conversationId/messages`：按需读取一段会话的消息。
- `GET /api/admin/analytics/content` / `GET /api/admin/analytics/journey`：内容聚合与访客浏览轨迹。
- `GET /api/admin/analytics/recent-visits`：近期满足有效停留条件的真人访问。
- `PATCH /api/admin/visits`：修改访客显示名称／备注（`label`）或拉黑状态。
- `POST /api/admin/visits/clear`：删除指定访客或全部访问概览；不清空独立保存的内容停留统计。

## 小柴与访客长期记忆

网站通过 Express 代理调用 Dify，`DIFY_API_KEY` 只保存在服务端。Dify 的 `conversation_id` 负责当前会话，Supabase 的 `portfolio_assistant_memories` 保存跨会话记忆；两者不要混为一谈。

首次启用时：

1. 在 Supabase SQL Editor 重新执行 `supabase/schema.sql`。
2. 在 Dify 导入 `dify/小柴-访客长期记忆.yml`，检查模型和知识库后发布该版本。
3. 将该应用的 API Key 写入服务端 `DIFY_API_KEY`，并按需设置 `DIFY_MEMORY_RETENTION_DAYS`。默认保留 180 天，设为 `0` 可关闭长期记忆。

每轮回答完成后，服务端按浏览器中的匿名 `visitor_key` 保存一轮问答。新问题到来时只选取最近四轮和最多四轮相关旧对话，限制为约 5500 字后传入 Dify 的 `visitor_memory` 输入，避免把全部历史反复放进上下文。记忆检索不额外调用 Embedding；Dify 内最近十轮的短期记忆仍照常工作。

小柴菜单中的“新对话”只清除当前 `conversation_id`；“清除长期记忆”会删除该匿名访客的全部长期记录并同时开始新对话。长期记忆表启用 RLS，浏览器无权直接读取或写入。

管理员可在“站点检测 → 聊天会话”选择任意访客，查看该访客的会话目录并展开消息；“访客”视图只负责访问记录，两类数据分开呈现。后台优先读取 Dify 的完整会话，Dify 暂不可用时会回退到 Supabase 中已经保存的长期记忆；会话正文只有管理员登录后才能访问。

服务端会把每次访问标记为 `traffic_type`：`human`（真人）、`bot`（爬虫/扫描器/脚本 UA）、`local`（本机或内网 IP）。爬虫 UA 不写入；本机和内网访问会保留，但后台默认只显示真人。

如果未配置 Supabase 环境变量，项目会临时使用 `src/data/portfolio.json` 作为本地兜底，方便先看页面和后台。

## 统计与埋点规范

本站使用第一方假名化统计，不接入第三方 Cookie。生产构建在非本机地址默认启用；开发模式和 localhost 默认不采集，自动化浏览器也不采集。需要专门调试时，在 `.env` 临时设置 `VITE_ENABLE_ANALYTICS="true"`。该变量不是生产统计的关闭开关：生产环境设为 `false` 也不会关闭统计；修改 Vite 环境变量后需重启开发服务或重新构建。

### 统计口径

- 一次完整页面加载记为一次访问，同一浏览器的匿名 `visitor_key` 记为一位访客。
- 停留时长只累计页面位于前台可见状态的时间；每 15 秒增量心跳，页面隐藏或离开时用 `sendBeacon` 补交。
- `dwell_ms = null` 表示浏览器未成功上报，后台显示“未上报”；`0-999ms` 才显示“不足 1 秒”，两者不能混为一谈。
- 自动化浏览器、搜索引擎爬虫和 Lighthouse 不进入访问与点击统计。
- 按钮点击排行按“页面路径 + `element_key`”聚合，同时展示总点击和匿名独立访客数。
- 每条事件带随机 `event_id`，网络失败会重试，服务端按该 ID 去重，避免一次点击被重复累计。
- 创建访问时服务端签发上下文令牌；点击和停留心跳必须携带有效签名，不能伪造访客或访问编号污染统计。
- 按钮排行通过数据库函数对全部原始事件聚合；规模继续增长时可增加按日汇总表，不改变前台事件格式。

### 控件命名

全站会自动采集 `button`、`a`、`role="button"`。关键业务操作必须显式添加稳定的 `data-track`，采用 `区域:动作[:对象ID]`：

```tsx
<button data-track="hero:view-portfolio">查看作品集</button>
<button data-track={`work:open:${work.id}`}>查看项目</button>
```

- `data-track` 是统计主键，发布后不要随展示文案一起修改。
- `data-track-label` 可指定后台展示名；未指定时依次读取 `aria-label`、`title`、按钮可见文字。
- 不需要统计的区域在祖先节点加 `data-track-ignore`。
- 禁止把姓名、手机号、邮箱、搜索词、输入值、歌词或其他用户内容放进 `data-track`。
- 新增核心转化流程时，先定义事件命名，再开发界面；不要用 CSS 类名或 DOM 层级作为业务主键。

### 数据与隐私

`portfolio_events` 保存控件键、控件标签、页面路径、假名访客、会话和发生时间，不保存输入框值、查询参数或 URL hash。`portfolio_visits` 的 referrer 只保留 origin 与 pathname。内容停留快照独立保存于 `portfolio_engagements`，保留访问时的标题和稳定内容编号，删除作品后仍可查看历史。统计表启用 RLS，浏览器 anon/authenticated 角色无权直读，只能由 Express 的 service role 访问。小柴的长期记忆会保存访客主动发送的聊天内容和回答，必须在隐私说明中单独披露用途、保留期和清除入口；该表同样启用 RLS。后台词云只返回访客提问的聚合词频，不批量返回原始正文。上线前还应披露统计目的、字段和保留周期；如面向要求同意后才能分析的地区，需在 `startVisitTracking()` 前接入同意状态。

新项目先执行 `supabase/schema.sql`，再执行 `supabase/engagement-analytics.sql`。已有项目启用内容停留统计时也需要执行后者，单独执行基础 schema 不会安装该功能。脚本采用可重复执行的迁移，不清空已有访问记录；各指标口径、历史保留与升级步骤以[内容监测文档](docs/engagement-analytics.md)为准。

## 前台视觉规范

> 本节只约束 `/` 前台，作用域必须收在 `.portfolio-site` 内。不要用全局选择器覆盖后台 `/admin` 的字号、圆角、表单或滚动容器。

前台采用“深色编辑网格 + 薄荷青科技高光”的视觉方向。信息密度偏高，但必须保持清晰的字号层级、4/8px 间距节奏和稳定的响应式尺寸。

### 字体层级

全站前台最多使用五档字号和三档字重。新增组件必须复用这些 CSS token，不得再添加任意字号或字重。

| Token | 字号 | 用途 |
| --- | ---: | --- |
| `--type-label` | 12px | 标签、时间、英文辅助信息、媒体元数据 |
| `--type-small` | 14px | 按钮、导航、次级说明 |
| `--type-body` | 16px | 正文、经历描述、作品摘要 |
| `--type-title` | 20px | 栏目标题、卡片标题、数据数字、手写装饰字 |
| `--type-display` | 48px | 首屏姓名主标题，仅用于真正的展示标题 |

| Token | 字重 | 用途 |
| --- | ---: | --- |
| `--weight-regular` | 400 | 正文与说明 |
| `--weight-medium` | 600 | 按钮、导航、次级强调 |
| `--weight-bold` | 800 | 标题、关键数字、当前状态 |

中文标题使用宋体/衬线字体栈，正文使用系统无衬线字体，时间和数据使用等宽字体。正文行高保持 `1.5-1.75`，不通过缩小字号解决空间不足，应优先减少冗余间距或调整布局。

### 颜色与发光

| Token | 值 | 用途 |
| --- | --- | --- |
| `--portfolio-bg` | `#05090b` | 页面主背景 |
| `--portfolio-panel` | `#080d10` | 内容表面 |
| `--portfolio-text` | `#eef4f2` | 主文字 |
| `--portfolio-muted` | `#899694` | 次级文字 |
| `--portfolio-accent` | `#62f5ce` | 主强调色、进度、当前状态 |
| `--portfolio-line` | `rgba(139, 165, 170, 0.13)` | 主分隔线 |
| `--portfolio-line-soft` | `rgba(139, 165, 170, 0.07)` | 次分隔线 |

荧光效果只用于数据图标、时间线节点与竖线、播放状态、进度和当前导航，不用于普通正文或大面积背景。发光由同色 `box-shadow`/`drop-shadow` 叠加实现，避免纯白硬光。

### 圆角与边界

| 元素 | 圆角 | 说明 |
| --- | ---: | --- |
| 页面分区、主内容带 | 0 | 用网格与细分隔线组织，不做浮空大卡片 |
| 作品缩略图、普通卡片 | 4-8px | 卡片上限 8px，保持编辑感 |
| 弹窗与媒体面板 | 8px | 同一层级只保留一个完整外框 |
| 圆形图标、头像、播放键 | 50% | 熟悉的圆形控件例外 |
| 主操作按钮、紧凑播放器 | 胶囊形 | 仅用于明确操作和媒体控制，不用于普通容器 |

禁止在卡片内部再嵌套带完整边框和圆角的卡片。分组优先使用留白、细线、底色差或左侧状态线表达。

### 布局与比例

- 桌面首屏使用黄金分割 `38.2% / 61.8%` 双栏：左侧沉浸主视觉，右侧信息面板；顶部导航与主体使用同一分界。
- 顶部导航高度为 `66px`；中文导航不显示英文副标题，当前项使用薄荷青底线和轻微外发光。
- 左侧主图是 5 秒静音循环视频 `public/hero-creator-stage.webm` / `.mp4`（720×960，3:4），首帧 `public/hero-creator-stage-poster.webp` 作为 poster；开启“减少动态效果”时只显示 poster，面板离开视口或标签页隐藏时暂停播放。素材本身不包含 UI 或静态粒子。桌面以顶部为锚点放大约 `1.08`，裁掉多余底部；动态粒子由页面独立渲染，并使用右上向左下、左下向右上两组不规则轨迹。
- “关于我”下方三项数据的醒目数值、短标签和补充说明统一存放在 `profile.pageCopy.homeStats`，通过后台“站点资料 → 首页数据标签”编辑；未配置时使用代码默认值。
- 首页“我的作品”读取全部作品，以双轨无缝方式持续从左向右轮播；卡片固定 `aspect-ratio: 1.92`，封面使用 `object-fit: cover`，悬停或键盘聚焦时暂停。
- 作品列表主卡片使用 `16:9` 封面（`aspect-video`）；图库卡片仍有 `1.92:1` 展示区域，首页轮播也保留 `1.92:1`。这些比例描述各自入口，不适用于二级页原图；详情中的图片按原始比例查看。
- 桌面时间线是独立视窗，展示全部经历并自动逐条滚动；鼠标、触摸或键盘操作时暂停自动播放，移动端展开为自然文档流。相邻节点之间使用 SVG 主能量线、四条连续变化的外围电弧和三条短分叉，端点始终收拢到节点；电弧按实际节点间距生成，离屏、后台及低动态模式停止动画。禁止使用贯穿整条时间线的下行扫描光束。
- 右上和右下手写英文是展示层，必须 `pointer-events: none`，不得遮挡按钮或正文。
- 间距以 4px/8px 为基础节奏，常用值为 `8 / 12 / 16 / 24 / 32 / 48px`；图标光学居中、1px 边界和参考图像素对齐允许小幅修正。

### 播放器与动效

- 每次打开或刷新前台播放 `public/entrance-cinematic.mp4` 入场动画，后台不播放；素材统一使用 H.264 High、`yuv420p` 与 AAC，保证主流桌面和移动浏览器可解码。1920×1080 视频使用 `object-fit: cover` 居中裁切适配全屏，不加黑边或拉伸，竖屏裁掉左右内容。
- 后台“站点资料 → 入场动画”可关闭整段入场体验，配置保存在 `profile.pageCopy.entranceAnimationEnabled`；缺省保持开启以兼容旧数据。关闭后前台不挂载或加载视频，资料就绪后直接展示首页，并立即放行已开启的音乐自动播放尝试。
- 入场视频提示“按任意键开门”：任意非重复按键、点击提示或点击画面后，在同一个用户手势内有声启动视频，不自动静音。右上角提供手动声音开关与圆角“长按跳过”按钮：持续按住 1400ms，描边从顶部沿整个按钮走满一圈后跳过；提前松开、移出按钮、失焦均重置进度。鼠标、触屏和键盘长按 Space / Enter 行为一致，短按不跳过。视频加载失败或播放连续停滞 15 秒则自动进入网站。
- 后台“音乐”模块可设置“音乐提前入场时间”（0–15 秒，默认 3 秒，失焦自动保存），保存在 `profile.pageCopy.musicLeadSeconds`，无需新增数据库列。开启音乐自动播放后，视频结束前指定秒数开始从零音量用 2200ms 平滑渐入；设为 0 时在视频结束后的黑场启动，提前跳过也在黑场启动，且不会重复触发。后台关闭自动播放时不启动音乐。
- 视频结束或跳过后进入黑场，播放尝试完成后保留约 300ms 黑场，再以 1000ms 透明度过渡显示整站；音频加载等待最多 1200ms，不阻塞进入。浏览器禁止音乐自动播放时，首次交互后重试渐入。入场期间网站不可交互；系统要求减少动态效果时直接进入。
- 开门提示叠加在视频首帧上，简约正面门形 SVG 图标放在“按任意键开门”文字前，无边框、无底色；下方单拐角折线连接门缝端点，无箭头。端点按视频 cover 裁切比例对齐门缝，窄屏同步收短横线。

- 紧凑播放器顺序固定为：封面、曲名、播放键、音柱、时间、上一首、下一首、播放列表。
- 音乐列表按钮打开播放器上方的选曲面板，展示所有有效音频、歌曲数、封面、作者和当前歌曲；点击歌曲开始播放，Escape、关闭按钮或点击外部收起。面板内可切换列表循环与单曲循环，单曲循环使用原生音频 loop，手动上一首/下一首仍可切歌；窄屏保留选曲与切歌按钮，进度线可拖动。
- 音柱前半段使用薄荷青渐变和外发光，未激活部分使用深灰；播放时仅用 `transform` 做轻量动画。
- 音乐实际播放时，在左侧主视觉右上角显示无边框歌词列表，当前句逐字高亮并自动滚动；暂停、结束或视频开始播放时立即隐藏。
- 后台音乐编辑器支持点击选择或拖拽上传音频；勾选“纯音乐”后不发起歌词/字符串识别，前台不显示歌词区域，原有歌词内容保留，关闭开关后可继续使用。
- 播放进度必须真实绑定 `currentTime / duration`，可拖动，细进度线和端点使用同色荧光。
- 页面粒子是独立动态层，主插画中禁止烘焙静态粒子。
- 所有持续动画必须在 `prefers-reduced-motion: reduce` 下停用。

### 响应式与验收

- `<= 1120px`：收紧导航与播放器，隐藏次要媒体按钮。
- `<= 820px`：双栏改为纵向，启用移动菜单，主视觉优先展示。
- `<= 560px`：作品卡片单列，技能标签双列，数据指标单列。
- 交互目标在移动端至少 `44px`，图标按钮必须提供 `aria-label`。
- 每次视觉改动至少检查 `1792×1024` 与 `390×844` 两个视口，并运行 `npm run lint`、`npm run build`。
- Playwright 验收截图统一保存到 `output/playwright/`，不要提交 `.playwright-cli/` 临时会话文件。
