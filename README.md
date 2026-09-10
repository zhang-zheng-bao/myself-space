# Portfolio + Supabase CMS

这是一个前后端一体的个人作品集项目：

- 前台：`/` 展示个人资料、经历、作品、展望、简历和联系方式。
- 后台：`/admin` 管理站点资料、经历、作品、图片、视频、音乐链接、跳转/下载链接、技能、奖项和联系方式。
- 后端：Express BFF，同源提供 API，使用 Supabase 数据库和 Storage。

## 本地运行

```bash
npm install
cp .env.example .env
npm run dev
```

打开：

- 前台：http://localhost:3010
- 后台：http://localhost:3010/admin

## Supabase 配置

1. 创建 Supabase 项目。
2. 打开 Supabase SQL Editor，执行 `supabase/schema.sql`。
3. 在 `.env` 中配置：

```env
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
SUPABASE_STORAGE_BUCKET="portfolio-media"
ADMIN_PASSWORD="your-admin-password"
ADMIN_SESSION_SECRET="a-long-random-string"
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

媒体文件上传到 Supabase Storage 的 `portfolio-media` bucket，返回公开 URL 后写入作品或头像字段。

## API

- `GET /api/portfolio`：前台公开读取聚合后的作品集数据。
- `POST /api/admin/login`：管理员登录。
- `POST /api/admin/logout`：退出登录。
- `GET /api/admin/session`：检查登录状态。
- `PUT /api/admin/portfolio`：保存完整站点内容。
- `POST /api/admin/upload`：上传图片、视频、音乐、PDF、压缩包等媒体到 Storage。

如果未配置 Supabase 环境变量，项目会临时使用 `src/data/portfolio.json` 作为本地兜底，方便先看页面和后台。
