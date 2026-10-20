# 万创核心管理员配置

后台 `/admin` → 应用配置 → 万创核心。应用配置首页按应用显示卡片，进入后使用各应用独立的表单与认证接口。公开应用隐藏设置入口且不能切换到设置视图。

新增应用时在 `src/components/AppSettingsAdmin.tsx` 的 applications 中登记名称、分类、图标和专属配置组件，并实现该应用独立的服务端认证接口和存储；不要复用万创核心的密钥文件或字段。

配置接口位于 `/api/admin/tools/wanchuang/settings`，GET/PUT 均使用现有管理员认证。
GET 仅返回非敏感参数与凭证是否已配置，不回显凭证。PUT 留空保留，显式勾选才清除。

服务器须设置至少 32 位的 `TOOL_SETTINGS_SECRET`；未设置时使用 `ADMIN_SESSION_SECRET`，同样要求至少 32 位。
默认加密文件为工作目录下 `.private/wanchuang-settings.enc`，可通过 `TOOL_SETTINGS_FILE` 指定持久化位置。
该目录不能映射为静态资源，部署时需持久化并备份。更换密钥前必须处理旧配置迁移，否则旧文件无法解密。
不要将密钥或配置文件纳入版本库。生产环境使用 HTTPS。

配置采用 AES-256-GCM 加密、临时文件写入后重命名。当前适用单实例，尚未接入执行服务。
后台保存不会验证第三方凭证有效性，也不会自动启用下载、转写、声音生成或平台授权。

验证：`npx tsx --test server/tool-settings.test.ts`。
