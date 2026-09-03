# Life

一个以“打开、记录、保存、离开”为核心的私人生活记录系统。当前已完成随笔、图片、追加、日记、时间线、日历和普通关键词搜索，以及对应的 UI 品质改造。

数据保存在当前浏览器的 IndexedDB。Moment 原文提交后不可编辑，补充内容通过追加保存；日记可以编辑。没有账号、云同步、AI、统计或社交功能。

正式网址：[Life](https://life-kelelega.netlify.app)。当前已部署到 Netlify；实际访问权限和线上验收进度见 [部署状态](docs/DEPLOYMENT.md)。

## 技术栈

- Next.js App Router + React + TypeScript
- IndexedDB + Dexie（local-first 数据层）
- ESLint
- Vitest + Testing Library + fake-indexeddb

## 环境要求

- Node.js 24.15 或更高的 24.x 版本（生产构建固定主版本）
- npm 11 或更高版本

## 本地开发

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 <http://localhost:3000>。

## 质量检查

```powershell
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

## 目录

```text
src/
  app/            Next.js 路由与全局样式
  components/     跨功能共享的 React 组件
  features/       按产品功能组织的 UI 与用例
  lib/            基础设施适配器
    db/           Dexie 数据库、schema 与迁移
  test/           测试环境配置与测试工具
  types/          跨模块共享类型
docs/             产品、架构、数据模型、任务与决策文档
```

功能代码应优先放在对应的 `features/<feature>` 内；只有确实跨功能复用的代码才提升到 `components`、`lib` 或 `types`。

## 环境变量

当前核心功能没有必填环境变量，构建不需要 `.env.local`。`.env.example` 中的 AI_PROVIDER、AI_API_KEY、AI_MODEL 只是未来服务端接入的空占位，本轮不配置、不读取、不启用 AI。任何私钥都不得使用 `NEXT_PUBLIC_` 前缀。`.env*`（模板除外）和 `.vercel/` 已被 Git 忽略。

城市定位使用现有的同源 `/api/location/reverse` 路由，向 Nominatim 做尽力查询。它依赖浏览器定位权限和外部服务可用性；拒绝定位、断网或查询失败都不应阻塞本地保存。

## 生产构建与本地验收

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
npm run start -- --hostname 127.0.0.1 --port 3101
```

在另一个终端对生产构建执行同一组浏览器测试：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3101'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

未设置 PLAYWRIGHT_BASE_URL 时，Playwright 会自动启动 3100 端口的开发服务器。测试使用本机 Chrome 和独立浏览器上下文，不读写日常浏览器中的记录。没有 Chrome 时先安装 Chrome，或调整 Playwright channel 后使用其附带的 Chromium。

## Netlify 生产部署

按用户要求，生产托管已从 Vercel 改为 Netlify。`netlify.toml` 配置 `npm run build`、`.next` 发布目录和 Node 24。Netlify 自动识别 Next.js 并提供 OpenNext 适配器，保留 App Router、动态 Diary 路由和 `/api/location/reverse` 服务端接口。不能把 `.next` 当作普通静态目录拖拽上传，也不使用静态导出。

首次部署：

```powershell
npm install --global netlify-cli
netlify login
netlify sites:create
netlify deploy --prod
```

登录自己的 Netlify 账户，创建并关联 Life 项目；如果已有对应项目，使用 `netlify link` 关联它。`deploy --prod` 会执行构建、适配并发布。不要添加 `--no-build` 来跳过首次 Netlify 适配。`.netlify/` 只保存本地关联和构建资料，已加入 Git 忽略。

Windows 本地发布前先停止该项目的 `next dev` 和 `next start`：适配器需要临时移动 `.next`，运行中的服务器可能占用目录。若使用 `npx netlify-cli` 遇到 npm 的 `EALLOWSCRIPTS` 参数错误，改为上面的直接 CLI 调用；不需要关闭 npm 安全设置。

也可以在 Netlify 导入 GitHub 仓库，项目根目录选择仓库根目录，使用相同的构建和发布配置。核心功能没有必填环境变量。构建使用 Node 24，函数运行时应为 Node 24；新建项目默认采用该版本。实际部署需要验证适配结果和线上页面。

官方说明：[Next.js 支持](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)、[CLI 发布](https://cli.netlify.com/commands/deploy/)、[Node 24 默认运行时](https://www.netlify.com/changelog/2026-07-07-nodejs-24-default-new-sites/)。

## Vercel 备用配置

仓库根目录已有 `vercel.json`：Next.js preset，`npm ci` 安装，`npm run build` 构建，默认 Next.js 输出；保留 Node Route Handler，不能改成静态导出。`.vercelignore` 排除审计截图、设计资料、测试产物、环境文件及 Agent 本地资料。

如将来主动选择 Vercel，可以使用保留的配置：

```powershell
npx vercel login
npx vercel link
npx vercel deploy --prod
```

登录后选择自己的 Vercel scope，关联已有 Life 项目或创建该项目。项目根目录使用仓库根目录，Node 版本选择 24.x。核心功能无需添加环境变量。也可以在 Vercel 导入该 GitHub 仓库，并采用同样的构建设置。官方说明：[项目配置](https://vercel.com/docs/project-configuration)、[Node 版本](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)、[CLI 部署](https://vercel.com/docs/cli/deploy)。

## 部署后验收

部署 URL 和验证结果记录在 [部署状态](docs/DEPLOYMENT.md)，以该文件的实际状态为准。尚未获得成功 URL 时不能认为已经上线。

部署后用新的测试浏览器检查：

1. 首页加载、进入写作、保存多行 Moment。
2. 添加图片，刷新后原文与图片可恢复。
3. 追加保存，原文不变。
4. 创建并编辑日记，返回链接保留未保存确认。
5. Timeline 中两类记录按创建时间显示。
6. Calendar 选择对应日期，三个筛选工作正常。
7. Search 查找原文、追加和日记内容。

还可将 PLAYWRIGHT_BASE_URL 设置为正式 URL 后运行现有 E2E；如部署保护需要登录，应先完成官方授权，不绕过访问控制。

### 数据与域名

IndexedDB 以浏览器和 origin 隔离。`localhost`、预览地址和正式域名里的记录互不迁移；正式使用请固定一个域名。部署只上传应用代码，不上传个人记录。当前没有云备份或导出 UI，清除浏览器站点数据会移除本地记录。

已有页面加载后可以在离线情况下进行本地操作；未实现 Service Worker，不能保证断网后的首次打开或完全关闭后的离线重开。这个 UI 阶段没有新增完整离线应用壳。

## 设计与验收资料

[前后对比](design/ui-refresh/review.html) 和 [分阶段记录](design/ui-refresh/README.md) 包含五种宽度、明暗主题截图及各阶段验证结果。系统字体以中文阅读为先，所有界面共享颜色、间距和动效 tokens。核心组件使用真实状态反馈，支持键盘焦点与 reduced motion。

后续统一动效的实现与实际测试结果见 [动效验收记录](design/motion-system/README.md)，前后截图见 [动效对比页](design/motion-system/review.html)。共享参数位于 `src/components/ui/motion.ts`，由服务端 layout 同步提供给 CSS；记录、追加和日记复用同一保存状态组件。

浏览器自动验收基于 Chromium；真实 iOS 软键盘、Safari 和 VoiceOver 仍需设备验收。

## 项目文档

- [产品定义](docs/PRODUCT.md)
- [工程架构](docs/ARCHITECTURE.md)
- [数据模型](docs/DATA_MODEL.md)
- [V1 任务拆分](docs/TASKS.md)
- [架构决策](docs/DECISIONS.md)
