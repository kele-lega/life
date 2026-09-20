# Phase 16A — 配置、验证与恢复操作

## Phase 16A.5 provider amendment (Supabase Storage)

This deployment uses Supabase Storage's S3-compatible endpoint, not AWS S3. Bucket Versioning and `x-amz-version-id` are therefore not prerequisites and are not requested by the application. Every backup part uses a server-generated unique key (`account/backup/random/part`); the manifest uses one key scoped to that backup. The application never issues a new upload URL for a verified part, never deletes an object, and verifies the exact bytes and SHA-256 before marking a snapshot complete. Completed PostgreSQL snapshots are immutable through the SQL trigger. The nullable `object_version` columns from the initial catalog are retained for forward compatibility and are unused by the Supabase path.

Supabase Storage setup: create a private `life-test` bucket in the dashboard, configure S3 access keys, and allow only the configured application Origin for `PUT`/`GET`. Expose no version header; expose only headers required by the configured checksum implementation. Keep the bucket private and do not grant deletion of backup objects.

Role bootstrap order: `001-foundation.sql` creates the `life_cloud` schema and tables. `002-roles.sql` creates only the `NOLOGIN` group roles `life_cloud_app` and `life_cloud_worker`, then grants their capabilities. `npm run cloud:migrate` requires only `CLOUD_MIGRATION_DATABASE_URL`. After migrations succeed, a DBA creates two separate restricted LOGIN roles and grants them to the groups:

```sql
CREATE ROLE life_cloud_app_login LOGIN PASSWORD '<generated-secret>';
GRANT life_cloud_app TO life_cloud_app_login;
CREATE ROLE life_cloud_worker_login LOGIN PASSWORD '<generated-secret>';
GRANT life_cloud_worker TO life_cloud_worker_login;
```

Only then should `CLOUD_DATABASE_URL` and `CLOUD_WORKER_DATABASE_URL` be configured. The LOGIN roles must not be schema owners, superusers, `BYPASSRLS`, or members of each other. Rotate the generated passwords through the provider secret manager; never commit them.

本阶段是手动完整备份，不是同步。关闭云服务不会停止本地记录；没有配置时 `/account` 仍可导出和恢复文件。不得使用真实个人库做破坏性演练。

## 1. 配置顺序

1. 建立 Supabase 项目并启用邮箱登录。生产可使用自定义 SMTP 和包含 `{{ .Token }}` 的模板发送数字 OTP；如果使用 Supabase 托管默认模板，它会发送一次性 Magic Link，Life 会在配置的回调 Origin 消费短期 access token 并换发同一类 HttpOnly Life Session。生产使用可投递的 SMTP，不依赖测试邮件限额。
2. 创建 PostgreSQL 迁移用连接。将其放入 `.env.local` 的 `CLOUD_MIGRATION_DATABASE_URL`，执行 `npm run cloud:migrate`。应用构建、请求和登录不会自动执行 DDL。
3. 四份 migration 创建 `life_cloud` schema 的基础设施表、RLS/角色、不可变快照保护和 16B.1 replica 表。`004-replica.sql` 只增加 `replica_*` 表与对象前缀，不改 backup 表。为两个独立 LOGIN 建立强随机密码，通过供应商密钥管理配置，分别授予 `life_cloud_app` 和 `life_cloud_worker`。应用 LOGIN 不得属于 worker/owner 角色，也不得拥有 SUPERUSER 或 BYPASSRLS。
4. `CLOUD_DATABASE_URL` 使用受限应用 LOGIN；`CLOUD_WORKER_DATABASE_URL` 使用 worker LOGIN。云 API 会拒绝 owner/超级用户/worker 凭据。远端连接要求 `sslmode=verify-full`，需要时配置供应商 CA，不禁用证书验证。
5. 配置 `CLOUD_AUTH_URL`（Supabase 项目 URL）、`CLOUD_AUTH_KEY`、`CLOUD_APP_ORIGIN`。Origin 必须精确匹配，例如本地 `http://127.0.0.1:3100`，生产使用 HTTPS，不能携带路径或尾部斜杠。
6. 在 Supabase Storage 控制台建立私有 `life-test` bucket，保持对象私有并配置静态加密。配置 `CLOUD_S3_REGION`、`CLOUD_S3_BUCKET`、`CLOUD_S3_ACCESS_KEY_ID`、`CLOUD_S3_SECRET_ACCESS_KEY` 和 Supabase S3-compatible `CLOUD_S3_ENDPOINT`。Supabase S3 兼容层不提供 bucket Versioning；应用不请求或校验版本 ID，也不需要 `GetBucketVersioning`、`GetObjectVersion` 或版本删除权限。
7. 配置 bucket CORS，允许唯一应用 Origin，方法 GET/PUT，上传头 `content-type`、`x-amz-checksum-sha256`，只暴露校验所需响应头。每个 backup part 和 manifest 都使用服务端生成的随机唯一 object key；服务端只为未确认的 part 发放短期 URL，确认后不再发放新的上传 URL，也不提供删除接口。上传后服务端按该 key 重新读取并校验精确字节数和 SHA-256；已完成备份的 PostgreSQL 元数据和对象目录不可修改。不要给完成快照设置自动过期。
8. 可设置 `CLOUD_ACCOUNT_QUOTA_BYTES`，默认每账户预留总量 5 GiB。初版完整快照独立保留；额度不足不会自动删旧备份。上传失败也暂占预留额度，清理须由明确的运维操作处理。

所有密钥均无 NEXT_PUBLIC_ 前缀，不能放进聊天、提交到 Git 或写入截图。示例仅见 `.env.example`。

## 2. 校验执行器

浏览器上传每份固定快照，然后请求 finalize 并显式推进校验。服务端每次执行先获得数据库租约，验证完成的文件有持久检查点；重复提交和响应丢失不会生成第二份快照。

- Next API 的 verify 请求推进已提交的备份，不捕获新的本地数据。
- 生产用 `npm run cloud:verify` 或同等受控任务推进 verifying 快照。配置独立 `CLOUD_WORKER_DATABASE_URL`；worker 只处理已由用户 finalize 的快照，不是自动备份或 AI 任务。
- 未配置独立 worker 时，浏览器仍可主动完成校验；关页后任务保留但不能承诺自行推进。
- 未配置 worker 时，浏览器仍可主动完成校验；关页后任务保留但不能承诺自行推进。生产验收必须验证 worker 真正部署并能在关页后继续工作。
- 校验中断后租约过期可重试；已记录 failed 的任务由用户明确重试。永久丢失的对象 key 不能凭新上传伪造原快照，应保留失败记录并创建新备份。

当前单次处理可被平台时限终止；较大单文件需要在实际存储地区测量吞吐，必要时使用较长执行时限的受控 worker。应用只在所有文件摘要、七表数量、唯一键和审核关联验证通过后标记 complete。

## 3. 真实服务联调

在专用测试邮箱、隔离浏览器上下文中进行；所有文字和图片均为合成数据。

1. 验证邮箱 OTP 登录，检查 Session Cookie 的 HttpOnly/Secure/SameSite，确认 PostgreSQL 只保留 token 摘要。
2. 创建含图 Moment、Append、Diary、手工 Event 与 Fake Lab 审核记录；包含软删除、pending/rejected/accepted/corrected 状态。
3. 绑定库，点击“备份现在”，确认浏览器直接分块上传到私有存储，块大小最大 4 MiB，原始正文不经过 AI API。
4. 中断一次网络；刷新后重试，验证同一 backupId、相同 manifest 和固定快照被续传，不混入后续编辑。
5. 在 verifying 时关闭页面，确认部署 worker 完成校验，目录从 verifying 转 complete，有上传校验记录和固定 object key、字节数及 SHA-256。
6. 新建隔离浏览器上下文，登录同一账户，选择快照预览并恢复到新本地库。对照 `.life.zip` 逐表、逐原图核对，检查 Timeline/Calendar/Search/Life Map 的读取结果。
7. 第二个测试账户访问上述 backupId、签名接口和绑定 ID，均应被拒绝。撤销会话后旧 Cookie 不再授权云请求。
8. 云服务故障、无网络和 Session 到期时，已打开应用仍能保存 Moment/Diary，导出和文件恢复仍可使用。

`npm run cloud:drill` 提供纯合成数据的真实 HTTP/对象存储往返演练。首次设置 `CLOUD_TEST_EMAIL` 后运行 `npm run cloud:otp` 请求测试验证码，再在本地环境设置短期 `CLOUD_TEST_OTP` 并运行演练。不要使用个人邮箱之外未经授权的收件人；演练不会删除云上生成的测试快照，也不会读取个人浏览器的 IndexedDB。

自动化 SQL 测试使用 PGlite 实际 PostgreSQL 引擎及受限角色，但对象存储是内存 adapter。它们证明协议和 SQL 行为，不代替真实 SMTP、部署网络、S3 IAM、CORS、区域性能和独立副本验证。

## 4. 完整导出与隔离恢复

- `/account` 的“导出 .life.zip”生成可下载归档，JSON 与原图独立保存，不依赖登录或云端 URL。
- 当前支持 256 MiB 总文件数据、32 MiB JSON、100,000 行、10,000 个文件。单条 JSON 记录不得超过 4 MiB。上限会明确报错，不静默跳过数据；这些是当前实现的容量边界，不是产品记录数量限制。
- 格式 v1 使用 UTF-8 canonical JSON、SHA-256、4 MiB 分块描述及普通 ZIP；`version=1` 与 `dexieVersion=6` 分开。原图不转码；原 fileName/mimeType/声明 size 与实际 Blob.type/字节数分别保留。
- 导入先检查归档闭合、路径、摘要、数量和关系，再写随机新库。读回验证通过后才登记 ready。用户明确打开时切换指针、关闭旧数据库连接并整页重载。
- 其他 Life 标签页仍打开时会阻止切换，不丢弃另一标签页的草稿。浏览器不支持 Web Locks 时仍可导出，但不能安全切换账户或生活库。
- 原库始终保留，不执行 clear/delete。若导入失败，未完成的孤立新库不会被登记/激活；不要手工删除原 `life` 数据库排错。
- 退出账户后的本地隔离不是 IndexedDB 加密；会话过期不会锁住离线记录。离线退出会在下次访问账户页面时优先撤销旧云 Session。
- 导出的 `.life.zip` 默认不加密。SHA-256 用于损坏检测，不是任意外来文件的作者签名。

## 5. 基础设施灾备

用户快照与基础设施备份是两个不同层次。生产上线前必须完成以下运维配置和演练，不能仅凭 upload 200 声称灾备可用：

1. PostgreSQL 启用所选套餐支持的备份/PITR；另保留独立权限域中的加密逻辑备份，建议每天一次、保留 30 天。该期限不删除用户完成快照。
2. Supabase Storage 的 JSON、图片分块和 manifest 都建立独立账户/权限域的对象副本。唯一 object key 和禁止覆盖只能降低误操作风险，不能替代独立备份。副本保留原清单、源 object key 和校验值；不依赖 Supabase S3 VersionId。
3. 优先配置供应商原生对象复制，并核对复制状态；同步 PostgreSQL 的备份时间、对象目录和完整快照水位，记录实际 RPO。
4. 恢复 PostgreSQL 到隔离环境；根据清单检查全部对象字节和引用，禁止缺图时直接开放“完整”快照。恢复账号 subject 映射，全部旧 Session 作废后重新验证邮箱。
5. 对每个恢复样本重新执行七表/图片完整性检查，并在隔离浏览器里真正恢复。记录耗时、最近完整快照时间和实际 RTO；不要承诺尚未备份的本机编辑零丢失。
6. 不进行未经确认的永久清理。删除本机记录不会移除旧快照中当时存在的内容。

基础设施供应商、凭据与独立备份域未配置前，上述真实灾备验收必须明确标为未执行，而不是沿用自动化测试的通过状态。

## 6. Phase 16B.1 Durable Replica

Replica 是日常自动增量可靠副本，不是 16A 不可变完整快照，也不能互相替代。

- `npm run cloud:migrate` 现在包含 `004-replica.sql`。PostgreSQL replica 表、mutation log 与 `{CLOUD_OBJECT_ENV}/replica/{account}/...` 对象前缀必须与 backup 对象分开。
- Web 使用同源 `/api/replica` 与现有 Cookie/CORS/CSRF。不要把 `https://localhost` 加入 Web 白名单。
- Android Native 使用烘焙的 `NEXT_PUBLIC_LIFE_CLOUD_API_ORIGIN`（精确 HTTPS Origin）和 Bearer access token。服务端只从验证后的 token/session 确定 account。
- 本地保存永远先写入 Dexie。未配置云、断网或 replica API 失败不得回滚本机记录。
- 灾难恢复写入新的隔离生活库；成为写者时提升 writer epoch，旧设备后续上传返回 `409 fenced`。旧设备仍可离线查看本机数据。
- Development 与 Production 必须用不同 `CLOUD_OBJECT_ENV` 和数据库。测试只用合成数据。

## 7. Phase 16B.1.5 self-hosted TLS and webpack

- Production Docker / Node build must use `npx next build --webpack`. Next 16 Turbopack emits hashed `pg` / `@aws-sdk/client-s3` aliases that `next start` cannot resolve.
- Official origin is `https://life.kelelega.dpdns.org`. Remote Postgres, if used, verifies the bundled Supabase Root 2021 CA (`src/features/cloud-backup/server/provider-ca.ts` and `infrastructure/cloud/prod-ca-2021.crt`). Do not set `sslmode=verify-full` together with a custom `ssl` object, and do not disable certificate verification. A host path like `sslrootcert=D:\...` will not exist in the container.
- Expired or garbage Bearer tokens on `/api/replica/*` must return `401 unauthorized`. Do not whitelist `https://localhost`. Native CapacitorHttp may send `Origin: https://localhost` with a Bearer token; CSRF origin checks are skipped only when a Bearer token is present.
- Replica drill scripts: `npm run cloud:replica-accept`, `npm run cloud:replica-otp`, `npm run cloud:replica-drill`. Never commit `.env.local`, OTP, or access tokens.
