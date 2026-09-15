Status: Accepted and implemented (2026-09-15). See ADR-040. This file remains the design record; it is not a substitute for the implementation.

# Phase 16B.1 — Durable Cloud Replication Design Review

状态：设计提案，待用户确认。2026-09-15。本文件不是已接受的 ADR，也不代表复制已经实现。

本轮只新增本审查文档；不修改应用代码、Dexie 业务表、Repository、Android 壳或部署。确认后再进入实施。

## 审查结论

建议把 16B.1 做成 **单写者可靠云副本（durable replica）**，不是 2026-09-07 Phase 16 那份完整多设备同步。

推荐路径：

```text
Android Dexie (source of truth for live use)
    -> 同库 sidecar outbox（与业务写入同一 IndexedDB 事务）
    -> HTTPS API host + Bearer（验证后的 account，不信任客户端 accountId）
    -> PostgreSQL replica tables + mutation log
    -> 附件 Blob：私有对象存储，SHA-256 校验后才算复制完成
```

本地保存永远先完成并立即返回。联网后后台重试未确认 mutation。云端只接收已在本机提交的变更；16B.1 不把云端数据写回正在使用的工作库。新 Android 设备通过显式灾难恢复拉起独立生活库，并 **fence 旧写者**，避免丢失的手机事后把过期 outbox 推上来。

Phase 16A 不可变 `.life.zip` / Backup 继续作为第二层灾备，职责不合并进 replica。

旧文档 `PHASE16_LIFE_CLOUD_SYNC_DESIGN_REVIEW.md` 保留为 **Phase 16B.2 多设备协同编辑** 的地图，本阶段不实现 CAS 冲突面板、双端同时改同一条 Diary、Proposal 终态竞争合并。

## 明确不做

- 云端主库 / 保存等待服务器
- 修改七张业务表字段或 Repository 业务语义
- SQLite、Camera/Photos/Location/Haptics、新 AI、协作系统
- 生产 Capacitor `server.url` 套现网
- 把 `https://localhost` 加入 Web CORS/CSRF/Cookie 白名单
- 用 16A Backup 当增量复制通道，或用 replica 替换 Backup

## 与现状的关系

| 现有能力 | 16B.1 用法 |
| --- | --- |
| Dexie v6 七表 | 继续是工作库；记录仍 local-first |
| `life-control` | 继续管 library/account/16A backup staging，不放 replica outbox |
| `/api/cloud/*` Cookie BFF | Web 账户与 Backup 保持不变 |
| Supabase OTP + `verifyAccessToken` | Native Bearer 复用已有 token 校验，映射 `auth_subject` → Account |
| 16A 对象存储 unique key | Replica 附件用独立 `replica/` 前缀，不复用 backup object key |
| Android `https://localhost` 静态壳 | 本地记录继续可用；云 API 走明确 HTTPS host |

Diary 目前是整行 put、无基准版本。16B.1 单写者下可按“最新本地提交覆盖 replica 该行”复制，不在本阶段做多设备 compare-and-swap。Moment `originalText` 仍然不可变，云端拒绝任何改原文的 mutation。已知父记录恢复可能连带恢复已单独删除的子项，这是本地既有语义；replica 复制**实际存储行**，不在云端发明另一套 cascade。

## 1. 本地 outbox / sync metadata 如何存储

**推荐：Dexie v7 在同一 `LifeDatabase` 里增加 sidecar 表，不改七张业务表。**

IndexedDB 不能跨数据库做同一事务。若 outbox 放在独立 `life-sync` 或 `life-control`，业务写入成功而 outbox 插入失败时会出现“本机有记录、永远不会上传”的窗口。16B.1 的核心目标是防手机丢失，这个窗口不可接受。

因此 outbox 必须与 Moment/Diary/Attachment 写在**同一个 IndexedDB 数据库、同一 Dexie.transaction**。每个生活库已经是独立库名（`bootstrapDatabaseName()`），sidecar 自然按库隔离。

建议新增 store（名称可在实施时微调）：

| Store | 作用 |
| --- | --- |
| `replicaMutations` | 持久 outbox。主键 `mutationId`；索引 `status, nextRetryAt, createdAt` |
| `replicaState` | 单行：accountId、writerId、epoch、lastAckedMutationId、lastCommitSeq、fence 状态 |
| `replicaBlobs` | 附件上传进度：attachmentId、sha256、bytes、objectKey、verified |

`replicaMutations` 行只存 metadata + 业务 JSON after-image（或 tombstone），**不克隆 Blob**。Blob 仍只在 `attachments` 业务行。outbox 用 attachmentId + sha256 引用。

v7 是 schema 版本号上移，属于既有模式（v5 加 LifeEvent，v6 加 Job/Proposal）。**业务语义仍是 v6**：不给 Moment/Diary/Event 加 sync 字段，不改索引，不改 originalText 规则。Repository 对外 API 保持不变；在现有事务成功路径末尾 enqueue mutation，调用方仍然只等待本地事务。

备选（不推荐）：独立 sync DB + 启动扫描 `updatedAt` 补洞。实现更绕，崩溃窗口更大，只在“绝对禁止 Dexie 版本号变化”时才退回。

`life-control` 继续只负责 library 绑定和 16A transfer。不要把 replica outbox 混进 backup staging files。

## 2. PostgreSQL replica schema

16A SQL 写明“No live Moment/Diary/LifeEvent cloud tables”。16B.1 要显式新增 migration `004-replica.sql`，并用新 ADR 取代 ADR-036 中“没有 live CRUD”的部分，而不是静默改 16A 文件。

建议表（均带 `account_id`，RLS 与 16A 相同：`current_setting('life.account_id')`）：

- `replica_writers(account_id, writer_id, epoch, platform, created_at, fenced_at)`
- `replica_state(account_id PK, epoch, head_commit_seq, snapshot_seq, writer_id)`
- `replica_mutations(account_id, mutation_id UNIQUE, payload_sha256, commit_seq, ops jsonb, applied_at)`
- `replica_moments / replica_moment_appends / replica_diaries / replica_attachments / replica_life_events / replica_jobs / replica_proposals`
- `replica_objects(account_id, attachment_id, object_key UNIQUE, sha256, byte_length, verified_at)`

说明：

- replica_* 业务表是**物化副本**，方便新设备恢复，不是客户端直写的主库。
- `replica_mutations` 是幂等与审计日志；重复提交只回放 receipt。
- `commit_seq` 在账户行锁内递增，避免 PostgreSQL sequence 与事务提交乱序造成漏复制。
- Attachment 表只存 metadata + sha256 + object_key；字节在对象存储。
- Job 无 `deletedAt`、Proposal 无 tombstone：按 id upsert 复制，不虚构删除字段。
- 对象 key 格式：`{env}/replica/{account_id}/{attachment_id}/{random}`。从不覆盖、从不复用 16A `backup/` key。
- 应用 LOGIN 角色不得 BYPASSRLS、不得 schema owner。

## 3. Push API 与幂等协议

新前缀 **`/api/replica/*`**，与 `/api/cloud/*` 分开。16B.1 优先 Android → Cloud。

主要端点：

1. `POST /api/replica/writers/register` — 注册或恢复 writerId，返回当前 epoch。
2. `POST /api/replica/mutations` — 按序提交一组 ops。
3. `POST /api/replica/attachments/uploads` — 申请一次性 PUT。
4. `POST /api/replica/attachments/finalize` — 服务端读回并校验 SHA-256。
5. `GET /api/replica/snapshot` — 灾难恢复分页导出（需显式 restore 意图 + 新 epoch）。

`POST /api/replica/mutations` 请求：

```json
{
  "writerId": "...",
  "epoch": 3,
  "mutationId": "uuid",
  "payloadSha256": "hex",
  "ops": [
    { "entity": "moment", "op": "upsert", "id": "...", "record": { } },
    { "entity": "attachment", "op": "upsert", "id": "...", "record": { "sha256": "...", "byteLength": 123 } }
  ]
}
```

服务端步骤（同一账户短事务，先锁 `replica_state`）：

1. 从 Bearer/Cookie 解析 account，忽略 body 里的 accountId。
2. epoch/writer 不匹配 → `409 fenced`，不应用。
3. `mutation_id` 已存在且 sha256 相同 → 返回原 receipt（幂等）。
4. `mutation_id` 已存在且 sha256 不同 → `409 mutation_conflict`，不覆盖。
5. 校验业务不变量（Moment 原文不可变；已存在行不得改 `originalText`/`createdAt`；Proposal 终态不得回退；soft delete 只改 `deletedAt`）。
6. 含新附件的 mutation：对应 `replica_objects.verified_at` 必须已有，否则 `409 blob_pending`。
7. upsert/tombstone 物化表，追加 mutation log，递增 `head_commit_seq`，提交。
8. 返回 `{ mutationId, commitSeq, epoch }`。

网络是至少一次。客户端用固定 mutationId 重试。不要宣称 exactly-once 传输。

单次 mutation 应对齐一次本地 Dexie 事务：例如 `createMomentWithAttachments` 生成一个 mutation，包含 moment + 各 attachment metadata（blob 已 finalize）。Job+Proposal 原子提交保持一组 ops，避免半份审核链。

16B.1 **没有 pull 进工作库**。Cloud 不能修改未确认的本地 outbox，也不能在用户未做灾难恢复时覆盖本机行。

## 4. Attachment 上传流程

本地：Repository 仍先把 Blob 写入 Dexie `attachments`，保存成功即对用户完成。

后台复制：

1. 计算 SHA-256 与 byteLength，写入 `replicaBlobs`（pending）。
2. `POST /api/replica/attachments/uploads` → 服务端生成 unique object key + 短时 PUT URL。不按客户端指定 key。
3. Native 用 **Capacitor HTTP**（或等价原生请求）PUT 字节；避免 WebView CORS。
4. `POST /api/replica/attachments/finalize`：服务端 GET 对象、核 SHA-256 与长度，写入 `replica_objects.verified_at`。失败则保持 pending，可换新 key 重传，不覆盖旧 key。
5. 再提交包含该 attachment metadata 的 mutation。未 verified 不得进入 replica_attachments 完成态。

规则：

- 未上传成功不得从本机淘汰原 Blob。
- metadata 已提交但 blob 未 verified：恢复时该图标记缺失，不伪造可读。
- 重复 finalize 同一 sha256：幂等成功。
- 16B.1 不做断点分块；现有图片若超过对象 PUT 限制，实施时再定上限（建议与 16A 单文件量级对齐并明确报错）。

## 5. Delete / restore 规则

复制的是**已经落在 Dexie 里的行**，包括 `deletedAt`。

| 本地操作 | mutation op | 云端效果 |
| --- | --- | --- |
| 创建/更新 | `upsert` | 整行 after-image |
| soft delete | `upsert`（deletedAt 非空） | replica 行带 tombstone |
| restore | `upsert`（deletedAt 空） | replica 清除 tombstone |
| 父 Moment 级联改子项 deletedAt | 本地事务里每条被改行各一条 op，或一条 mutation 含多 ops | 与本地最终行一致 |

不做：

- 云端 30 天自动清空
- 未实现的永久删除
- 云端“智能”级联（避免与本地已知 cascade 行为分叉）
- 把本地未删除的行在云端删掉

新设备恢复必须包含 tombstone，否则回收站与“已删记录不应出现在 Timeline”会错。

Diary / LifeEvent 若本地还没有完整删除 API，则只复制实际被调用并写入的行；不在 replica 阶段偷偷补通用 CRUD。

## 6. Native authentication

约束：Android WebView origin 是 `https://localhost`。现有 `/api/cloud/*` 用 Cookie + 固定 `CLOUD_APP_ORIGIN` + POST Origin/`sec-fetch-site` 做 CSRF。把 localhost 加进该白名单会削弱 Web 边界，禁止。

推荐双通道，互不放宽：

| 客户端 | 认证 | CSRF |
| --- | --- | --- |
| Web/PWA | 维持 `__Host-life_session` HttpOnly Cookie，same-origin | 现有 Origin 校验 |
| Android | `Authorization: Bearer <Supabase access_token>`，请求明确 `LIFE_CLOUD_API_ORIGIN` | 不带 Cookie；Bearer 不走 cookie CSRF |

细节：

- 服务端从验证后的 Supabase user id（`auth_subject`）解析 Account，不信任 body/query 的 accountId。
- Native 登录继续用数字 OTP（Magic Link 在 `https://localhost` 上不可靠）。`/api/replica/auth/start|verify` 可复用 `supabaseEmailAuth`，verify 后把 **access_token 交回 Native**，同时可选签发 Life opaque device session。
- 优先按用户要求：持有 Supabase access token，API 用 Bearer；refresh 只打 API host，不把 refresh token 写入业务 Dexie。Token 放 Capacitor Preferences（后续可升安全存储），不放 `life-control` 的 backup files 表。
- `/api/replica/*`：若有 Bearer，校验 JWT 后忽略 Cookie；若无 Bearer 且是 Web same-origin Cookie，允许（便于以后网页只读/同协议），但仍要 Origin 校验。禁止 `https://localhost` Cookie 会话。
- 传输必须用 **原生 HTTP 插件** 访问 API host，使 CORS 不是安全边界。生产 API **不要** 为 replica 开启 `Access-Control-Allow-Credentials` + `https://localhost`。
- 不把生产 API 配进 Capacitor `server.url`。

## 7. Retry / crash recovery

- App 冷启动、网络恢复、定时器：扫描 `replicaMutations` 中 `pending|failed` 且 `nextRetryAt <= now`。
- 指数退避，上限封顶；401 停止并要求重新 OTP，本地记录可继续写。
- 409 fenced：标记 writer 已作废，停止推送，保留本地数据，提示“云端已由另一设备恢复，本机不再上传”。
- 409 blob_pending：先完成 finalize 再发 mutation。
- 崩溃：同库事务保证“有业务行必有 outbox 行”。启动时再扫：有 outbox 无 blob verified 则重传；有 blob 无 ack 则重 POST mutation。
- 不在保存按钮路径上 await 网络。UI 至多在账户页显示“未上传 n 条”，不得阻塞写随笔。

## 8. 新设备完整恢复

场景：空 Android（或新生活库），账户在云端已有 replica。

1. OTP 登录。
2. 用户显式选择“从云端恢复”，不是登录副作用。
3. `register writer` 使 **epoch+1 并 fence 旧 writer**。
4. `GET /api/replica/snapshot` 按表分页拉取所有 replica 行（含 tombstone）和 object 清单，水位为当时 `head_commit_seq`。
5. 写入**新的** Dexie 生活库（沿用 16A：不 clear 当前库、独立 library id、业务 id 保持不变）。
6. 下载对象，SHA-256 对上后写入 Attachment Blob。
7. 计数/抽样读回校验通过才 `ready`。
8. 现有 Web Lock + 整页 reload 激活新库。
9. 该设备成为唯一写者；之后只 push。旧手机再上线会收到 fenced。

未完成校验的库不得激活。图片未下完可以先激活文字（需在 UI 标明缺失图），但不得把缺 Blob 的 attachment 标成完整。

16B.1 不自动合并“新手机上已写的匿名记录”和云端 replica。若新设备已有本地记录，恢复进独立库，由用户之后再决定打开哪一个（与 16A restore 一致）。

## 9. Phase 16A Backup 与增量 Replica 的职责

| | Replica（16B.1） | Backup（16A） |
| --- | --- | --- |
| 触发 | 联网后自动 | 用户手动 |
| 粒度 | mutation / 当前行 | 七表完整快照 |
| 可变性 | 当前副本随 upsert 更新 | 完成后 SQL 不可变 |
| 用途 | 手机丢失、IndexedDB 损坏后的工作副本 | 第二层时间点灾备、导出归档 |
| 恢复 | 新库 + fence 旧写者 | 新库，不 fence replica writer（除非产品以后要求） |
| 失败 | 不影响本地写 | 不影响本地写 |

两者对象前缀、表、API 分离。Backup 不读 outbox；replica 不写 `backups` 表。用户仍可随时导出 `.life.zip`。

## 10. Production / Development 隔离

- 独立 Supabase 项目、独立 Postgres、独立 bucket。
- `LIFE_CLOUD_API_ORIGIN` / `CLOUD_APP_ORIGIN` 按环境精确配置；生产 APK 编译期写入生产 origin，禁止 debug `CAPACITOR_DEV_SERVER_URL` 混进发布包。
- object key 带 `prod|staging|dev` 前缀。
- 禁止用真实个人库做演练；沿用 16A：synthetic fixture + `CLOUD_TEST_EMAIL`。
- 开发机 IndexedDB / MuMu 数据不得指向生产 replica writer，除非明确使用生产账户并接受 fence 风险。

## 11. 测试与故障注入

实施门槛（确认后才写代码）：

- 单元：同事务业务+outbox 提交/回滚；mutationId 重放；原文不可变拒绝；fenced writer。
- PGlite SQL：账户行锁、重复 mutation、sha256 冲突、blob 未 verified 拒绝、RLS 跨账户。
- 故障：ack 丢失重复 POST、PUT 成功 finalize 失败、finalize 成功 mutation 丢失、杀进程、401/429/5xx、epoch fence、乱序重试。
- 恢复：空设备 snapshot → 七表+Blob 读回与源 sha256 一致；旧设备随后 push 被拒绝且本地仍在。
- Native：Bearer 可调 API；Cookie CSRF 对 localhost 仍失败；无 `server.url`。
- 回归：现有 typecheck/lint/unit/e2e/native-static/web build 全过。真实 SMTP/Storage 演练与 16A 一样单独记录，不拿 mock 冒充生产验收。

## 建议实施切片（确认后）

1. Dexie v7 sidecar + repository 事务 enqueue（离线可用，尚无网络）。
2. Replica SQL + RLS + mutation 幂等 API。
3. Native Bearer + Capacitor HTTP + OTP。
4. Attachment PUT/finalize。
5. 自动 retry 与账户页未上传计数。
6. Snapshot 恢复 + writer fence。
7. 故障注入与 synthetic 云演练。

## 待确认后暂停

1. **同库 Dexie v7 sidecar**，而不是独立 sync DB（推荐，为了 outbox 原子性）。
2. **单写者 + restore 提升 epoch/fence 旧设备**，16B.2 再做多设备同时编辑。
3. **Native：Supabase access token Bearer + 原生 HTTP**；Web Cookie 边界不改。
4. **Replica 与 16A Backup 分表分前缀**；Backup 仍手动不可变。
5. 云端 **不做 E2EE**（与 16A 一致）；运营方可在基础设施层看见快照明文。
6. 16B.1 范围含七实体 + Attachment Blob + tombstone；不含双向 pull 进工作库。

确认以上取舍后再实施。本轮无代码、无 schema 迁移、无部署变更。
