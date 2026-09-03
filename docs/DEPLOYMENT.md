# 生产部署状态

更新日期：2026-09-03。

统一动效更新已成功部署到 Netlify，平台状态为 `ready`。用户无法登录 Vercel，明确要求更换平台，随后完成了 Netlify 授权。

- 正式网址：[Life](https://life-kelelega.netlify.app)
- 最新部署时间：2026-09-03 08:55:32 UTC（北京时间 16:55:32）。
- 平台项目：`life-kelelega`。
- [最新部署详情](https://app.netlify.com/projects/life-kelelega/deploys/6a9935dc08d1754a8e879de8)。
- Next.js 构建、OpenNext 5.15.13 适配、静态资源和服务端函数上传均已成功。

当前项目继承 Netlify 账户的默认登录保护，`sso_login=true`、范围为全部部署。最新平台查询确认该保护仍生效，未登录的正式网址 HEAD 请求返回 HTTP 401。已询问用户是否允许正式网址直接打开，尚未修改账户或项目访问保护。

线上功能验收尚未完成：此前 E2E 被平台登录页面拦截，本次仍被登录保护限制，未重复运行必然无法进入应用的测试。本机生产构建已验收，平台发布结果不能代替登录后的线上功能验收。

已准备：

- `netlify.toml`：npm run build、.next 发布目录、Node 24，自动采用 Netlify 的 Next.js 适配器。
- `vercel.json` 保留为备用；不再以 Vercel 登录作为当前发布条件。
- Node 主版本限制为 24.x，最低 24.15；当前本机 24.19.0。
- `.vercelignore`：排除审计截图、设计与本地环境资料。
- `.gitignore`：排除 .netlify、.vercel 和真实环境文件。
- 核心功能无需必填环境变量，未启用 AI 占位变量。
- README 中的生产构建、发布和部署后验证步骤。
- `PLAYWRIGHT_BASE_URL` 支持对生产构建和已授权访问的正式站点验收。

本次动效验收：typecheck、lint、159 个单元/集成测试、38 个开发环境 Chromium E2E（3.7 分钟）、production build 均通过。生产构建另复核了动效和三类保存按钮的 12 个 E2E，全部通过：其中 3 项首次将 Next Link 的目标页面 CSS 预取提示计为失败，核对并精确区分该提示后重跑通过；实际功能、脚本错误和 React 警告断言未放宽。Netlify 发布过程也重新构建、完成适配并上传成功。

前一版 UI 首次部署时还通过了完整 28 项生产 E2E。动效的文件说明、截图、真实生产构建录像和测试边界见 [动效验收记录](../design/motion-system/README.md)。

下一步：按用户确认的访问方式完成线上验收，包括首页、Moment/图片、Diary、Timeline、Calendar、Search。当前未提供绕过访问保护的测试配置。

本机部署注意：Windows 下先停止 `next dev` 和 `next start`，避免适配器移动 `.next` 时出现目录占用。本机 npm 11.17 经 npx 调用 CLI 时对子安装错误传递脚本配置，直接调用已安装的官方 CLI 后适配成功；未关闭 npm 安全设置。

记录仍在浏览器本地，同一用户不同域名中的 IndexedDB 不共享。上线不会把 localhost 的记录自动迁移至正式域名。
