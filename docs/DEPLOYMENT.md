# 生产部署状态

更新日期：2026-09-20。

正式网址是自建 Linux 主机上的 [Life](https://life.kelelega.dpdns.org)。应用由本机 Docker（Node 24）运行，Caddy 提供 HTTPS。操作步骤见 [云服务器部署](SERVER_DEPLOYMENT.md)。

- 正式 Origin：`https://life.kelelega.dpdns.org`（精确 HTTPS，无路径、无尾斜杠）
- Web / PWA 走同源 `/api/cloud` 与 `/api/replica`
- Android APK 须在 `native:web` 时烘焙 `NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN=https://life.kelelega.dpdns.org`
- 账户登录为本机用户名密码，不是邮箱 OTP
- 记录仍在当前浏览器 / WebView 的 IndexedDB；换域名不会带走旧数据

本仓库不再把 Netlify 或 Vercel 当作正式站。生产构建使用 `npx next build --webpack`（Next 16 默认 Turbopack 会把 `pg` / `@aws-sdk` 打成无法解析的别名）。

部署后用新的测试浏览器检查：首页保存随笔、刷新恢复、`/account` 登录、绑定生活库、云副本或手动备份。IndexedDB 按 origin 隔离，`localhost` 与正式域名互不共享。
