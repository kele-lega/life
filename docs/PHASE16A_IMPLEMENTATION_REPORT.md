# Phase 16A — 实施与验收记录

状态：Foundation 代码及全量自动化回归已通过；Phase 16A.5 已切换为 Supabase Storage 兼容路径，真实云服务与基础设施灾备验收待配置。未进入 Sync。

## 实现范围

- 本地 `.life.zip` 完整导出：七张业务表、Attachment 原始 Blob、manifest、独立格式版本、整文件和 4 MiB 分块 SHA-256。包括软删除状态和整理审核历史。
- 隔离恢复：检查完整 ZIP、路径、UTF-8、校验值、记录数量、唯一键及审核关联后，写入随机新 v6 数据库；读回原文和图片验证成功后才登记为可打开。原库保留，不回放业务命令。
- 账户基础：服务端 Supabase 邮箱 OTP、Life Account、仅保存 token 摘要的 BFF Session、HttpOnly Cookie、显式匿名库绑定。账户切换保留原库；云会话过期不会阻止离线记录。
- 本地隔离：单独 `life-control` 基础设施数据库管理库目录与上传暂存；业务库仍为七表 Dexie v6。每个页面固定一个数据库实例，Web Locks 保护其他标签页的草稿，切换采用整页重载。
- 云备份：PostgreSQL 元数据目录、租户 RLS、受限 API/worker 角色、不可变快照 SQL 保护、私有版本化对象、分块上传和续传、文件摘要和七表关系校验、完成后才允许恢复。
- `/account` 提供导出、恢复预览、登录、绑定、备份状态、最近成功快照时间、失败重试与保留库入口。首页增加轻量入口。
- 提供显式迁移命令、校验 worker、合成数据真实服务往返演练脚本和操作文档。未配置云服务时，本地导出和恢复继续工作。

未修改 Moment / Diary / LifeEvent 业务语义、Repository 行为或 Dexie v6 schema；没有实时云业务 CRUD、双向同步、冲突解决、自动备份、自动提取或新 AI 功能。

## 主要文件

| 范围 | 文件 |
| --- | --- |
| 归档格式与校验 | `src/features/cloud-backup/shared/format.ts`、`shared/records.ts` |
| 导出与隔离恢复 | `src/features/cloud-backup/local/archive.ts` |
| 本地库目录与绑定 | `src/features/cloud-backup/local/control.ts`、`src/lib/db/bootstrap.ts` |
| 页面与加载边界 | `src/features/cloud-backup/components/account-page.tsx`、`library-boundary.tsx`、`src/app/layout.tsx` |
| 云客户端 | `src/features/cloud-backup/client/backup.ts`、`client/api.ts` |
| 服务端边界 | `src/app/api/cloud/[...path]/route.ts`、`src/features/cloud-backup/server/` |
| PostgreSQL 迁移 | `infrastructure/cloud/001-foundation.sql` 至 `003-immutable-snapshots.sql` |
| 运维入口 | `scripts/cloud-migrate.ts`、`cloud-worker.ts`、`cloud-drill.ts` |
| 自动化验证 | `src/features/cloud-backup/**/*.test.ts`、`e2e/cloud-foundation.spec.ts` |
| 配置与协议文档 | `.env.example`、`docs/PHASE16A_CLOUD_OPERATIONS.md`、`docs/PHASE16A_ARCHIVE_FORMAT.md` |

PRODUCT / ARCHITECTURE / DATA_MODEL / DECISIONS / TASKS 已同步用户批准的 Phase 16A 范围。工作区保留了此前 UI 和 Phase 15 的未提交修改，本阶段未提交或推送 Git，也未部署线上。

## 验证结果

- `npm run typecheck`：通过，包含 cloud 脚本与 Netlify worker。
- `npm run lint`：通过，零警告。
- `npm test`：43 个文件、350 项通过；其中 Foundation 24 项。
- `npm run test:e2e`：71 项通过，包含 11 项 Foundation 浏览器测试。
- `npm run build`：通过，含 `/account` 和 `/api/cloud/[...path]`。
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3190 npm run test:e2e -- e2e/cloud-foundation.spec.ts`：生产构建上额外 11 项通过。
- 生产 HTTP 检查：`/`、`/account`、`/api/cloud/account` 返回 200；未配置云服务时账户 API 返回 `configured: false` 且 `Cache-Control: no-store`。

Foundation 测试覆盖：七表精确往返、原图类型与声明元数据分别保留、Unicode/空标题/历史过期 evidence、软删除与各审核状态、9 MiB 图片分块、损坏和非规范归档拒绝、原库保留、多账户隔离、跨标签页草稿保护、重试固定快照、角色/RLS/CSRF、会话撤销、对象 key 跨快照唯一及完成快照不可变。

SQL/HTTP 集成测试采用实际 PostgreSQL 引擎 PGlite 与受限角色，存储和 OTP 使用测试 adapter。浏览器账户和上传流程使用明确的模拟服务。这些结果不代表真实供应商已完成验收。没有把测试数据或用户数据发往 AI。

回归中修复了加载边界导致的早期键盘导航问题；导航外壳和跳转目标现在保持存在，记录路由仍等待库确认。浏览器恢复断言明确等待整页重载；大图片测试使用原生二进制比较并给予有意让出 UI 线程的分块 I/O 独立时限，未放宽数据校验。

## 生产页面截图

截图来自独立测试浏览器，已检查 390 / 430 / 1440 px 明暗模式。移动端整页截图中的固定底栏停留于截图时的视口底部；实际页面可以继续滚动。

- [390 px 浅色](../design/phase16a/account-390-light.png)
- [430 px 深色](../design/phase16a/account-430-dark.png)
- [桌面深色](../design/phase16a/account-1440-dark.png)
- [恢复预览](../design/phase16a/account-restore-preview.png)
- [备份完成状态——模拟云服务，仅证明 UI](../design/phase16a/account-backup-complete-mocked.png)

## 尚未完成的外部验收

当前 `.env.local` 未配置 `CLOUD_*` 服务参数。真实 SMTP/OTP、受限 PostgreSQL 连接、S3 IAM/CORS/版本控制、部署 worker、独立备份域和恢复演练尚未执行。`cloud:drill` 已尝试，但因缺少配置终止；未发送测试邮件。

配置方式与演练顺序见 `PHASE16A_CLOUD_OPERATIONS.md`。运行 `cloud:migrate` 前必须使用独立迁移凭据；API 使用受限应用凭据。用户快照可恢复性与 PostgreSQL / 对象存储基础设施灾备分别验收，不能以本地或内存 adapter 测试替代。

## 当前边界与技术债务

- 单份归档上限 256 MiB、JSON 合计 32 MiB、100,000 行、10,000 文件；单条记录须容纳于 4 MiB JSON 分片。超限明确拒绝，不截断记录。
- `.life.zip` 默认不加密；第一版云备份使用传输和云存储加密，非端到端加密。本地账户隔离也不是操作系统级数据库加密。
- Web Locks 不可用时可导出，但不能安全切换账户/库。离线记录指已加载应用；离线冷启动 PWA 不在本阶段承诺范围。
- 上传失败的云空间预留、未完成的隔离恢复库以及过期基础设施记录暂不自动清理；避免以清理为名永久删除数据。完成备份只回收重复的本机上传暂存 Blob。
- worker 有文件级检查点；大单文件需在真实地区网络和平台执行时限下验收，必要时使用更长时限的受控 worker。
- 既有父记录 soft delete 对独立删除子项时间戳的行为未在本阶段改动；归档原样保存实际存储状态。

最终停留在 Phase 16A，真实云服务验收通过前不标记全阶段完成，不继续开发 Sync 或其他 AI 能力。
