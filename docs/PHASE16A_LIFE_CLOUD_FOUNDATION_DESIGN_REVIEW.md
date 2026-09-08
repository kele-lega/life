# Phase 16A — Life Cloud Foundation Design Review

状态：**设计已于 2026-09-07 获用户确认，进入 Phase 16A 实施**。以下正文保留当时审查记录；实施规格与实际验收状态见 `PHASE16A_ARCHIVE_FORMAT.md`、`PHASE16A_CLOUD_OPERATIONS.md` 和 TASKS.md，不能将本文的计划当作已完成测试。

### Supabase Storage amendment (2026-09-08)

The original review below proposed AWS S3 Versioning. The confirmed Phase 16A.5 provider is Supabase Storage, using its private S3-compatible endpoint. Supabase S3 does not provide bucket Versioning, so the acceptance rule is replaced: every backup part and manifest receives a server-generated, backup-scoped unique object key; the service never issues a new upload URL after a part is verified, never deletes or mutates backup objects, and verifies exact bytes plus SHA-256 by reading the registered key before completing the PostgreSQL snapshot. Completed snapshot metadata is protected by the immutable SQL trigger. The nullable `object_version_id`/`object_version` catalog fields remain only for forward compatibility and are unused by the Supabase path. This amendment supersedes the AWS Versioning recommendations in sections 1, 6.2 and 9; those lines are historical design context.

本轮只新增本审查文档。未修改应用、Repository、Dexie schema 或部署，未创建云资源，未上传现有数据。工作区已有的 UI / Phase 15 修改不属于本轮。

## 1. 结论与范围

建议实现：**Dexie v6 本地工作库 + 邮箱账户 + 本地库绑定 + 不可变完整备份 + 独立库恢复 + 可离线使用的完整导出格式**。

Phase 16A 的云端是历史快照仓库，不是另一份可编辑的工作库。保存、搜索、Timeline、Calendar、Life Map 和 Proposal 审核继续使用本地数据库。备份由用户点击启动；重新联网不会自动扫描、上传或提取数据。

与此前 `PHASE16_LIFE_CLOUD_SYNC_DESIGN_REVIEW.md` 的区别：本阶段不建设七张云端实时业务表，不实现 outbox、push/pull、sync cursor、实体 revision、冲突解决、合并恢复或实时订阅。那些是未来同步阶段的候选方案，尚未接受。

建议首个部署组合原为 **Supabase Auth + Supabase 托管 PostgreSQL + AWS S3 私有对象存储**；该对象存储建议已由上方 Supabase Storage amendment 取代。Auth、PostgreSQL 和 Storage 现在使用同一 Supabase 项目，应用仍通过自己的服务端适配器访问，格式与 API 不依赖 Supabase 客户端 SDK，未来可以替换供应商。此处是历史选型记录，不代表当前生产配置。

当前 PRODUCT.md 将账号、完整导出 UI 放在未来阶段；本次用户已明确提出推进这些能力。本提案以新的 Phase 16A 范围为准，确认后再同步产品文档、路线和 Accepted ADR。不会执行 TASKS.md 旧的 Phase 16 AI 任务。

## 2. 当前代码审查

| 位置 | 已确认事实 | Foundation 设计影响 |
| --- | --- | --- |
| `src/lib/db/client.ts:43` | v6 七张业务表；三个 AI 审核相关唯一索引 | 全库快照必须保留全部七表、唯一键及审核关联 |
| `src/lib/db/client.ts:51` | 全局默认库名 `life`，没有账户命名空间 | 需要本地库访问上下文，不能只加一个登录邮箱 |
| `src/features/attachment/model/types.ts:6` | Attachment 仅支持 Moment-owned image；Blob 必填 | 云端保存原图副本；本阶段不把 Blob 改成可选缓存或 URL |
| `attachment-repository.ts:19` | `size` 可来自调用方；Blob 的实际大小、type 与声明 metadata 不一定相同 | 原 metadata 原样保存；归档另记实际字节数、Blob.type 和校验值 |
| `moment-repository.ts:72` | Moment 与初始图片原子保存 | 快照不能捕获半个事务 |
| `moment-repository.ts:232`、`diary-repository.ts:48` | Moment 原文不可编辑；Diary 更新正文，保留身份与 createdAt | 导出、备份、恢复不执行编辑，也不刷新原始时间 |
| `dexie-life-intelligence-repository.ts:229`、`:282` | Job+Proposal 原子提交；Accept/Correct 原子写 Proposal+Event | 恢复写入已保存的结果，绝不能重放审核命令 |
| `life-intelligence/model/types.ts` | Job 无 deletedAt；Proposal 无 createdAt/deletedAt；实际仅保存成功提取 Job | 不补造统一字段，不把备份上传任务塞进 LifeExtractionJob |
| `life-event/repository/source-fingerprint.ts:17` | 指纹来自精确原文字段数组的 JSON 编码 | 不 trim、改换行、归一化 Unicode 或重新生成来源指纹 |
| `/lab/life-extraction` | scratch Job、Proposal、审核 Event 均在真实七表中，没有 isLab 标记 | 完整导出包含这些数据，不能按页面或 provider 值过滤 |

两个现有边界必须保留在验收记录中：

1. 父 Moment 删除会覆盖子项已有 deletedAt，恢复父项时可能恢复先前独立删除的图片/Append。这与 DATA_MODEL.md 的要求不一致。本阶段备份忠实保存已存在的状态，不猜测、不修补历史删除标记，不调用 `restoreMoment()` 来恢复备份。该业务缺陷单独跟踪，不借备份工程改变删除语义。
2. 当前 local-first 保证本地读写；Service Worker / 应用壳离线冷启动仍是 deferred。账户过期、云服务失败不能让已打开应用的本地记录不可用，不能把此项验收宣传成已经支持完整 PWA 冷启动。

## 3. Dexie v6 到云端的映射

采用 **七表 JSON 快照 + 原始图片对象 + PostgreSQL 归属/清单/校验目录**。PostgreSQL 不保存另一份可编辑的 Diary/Moment 正文，以免提前形成两个业务真相源。

| Dexie 表 | 快照内容 | 恢复原则 |
| --- | --- | --- |
| moments | 全部字段、originalText、收藏、location、时间、deletedAt | 保留 ID、精确原文及软删除状态 |
| momentAppends | 全部字段、独立 ID、momentId、text、时间、deletedAt | 不合并进 Moment 原文 |
| diaries | 完整 title/body、收藏、location、时间、deletedAt | 不截断、不改标题、不更新 updatedAt |
| attachments | 除 Blob 外的完整实体 JSON；Blob 由归档清单关联原图文件 | 重建必填 Blob，保留 Blob.type 和原 metadata |
| lifeEvents | 全部持久字段，包括 source、可选 extractionProposalId、metadata、deletedAt | 保留 stale/源缺失行；不从 Proposal 重新生成 |
| lifeExtractionJobs | 全部已持久化行，含 scratch text 或 record ref、requestKey、provenance、context、状态和时间 | 不重新提取，不伪造 processing/failed 行 |
| lifeEventProposals | 所有状态、原候选、修正候选、UTF-16 evidenceRanges、审核关联及时间 | 保留用户拒绝与终态，不重放 Accept/Correct/Reject |

读取物理表，不复用只返回 active 数据的页面列表函数。软删除行与相应原图、不可见的历史 Event、pending/rejected/superseded Proposal 都包括在内。

不打包账户 Session、密钥、临时签名 URL、Blob URL、请求中的网络状态、UI 偏好、未保存编辑器内容或可重算的地图/搜索/统计结果。首次操作提示“仅包含已保存内容”。不创建 Tag、DailySummary 等尚未落地的表。

业务 ID 继续作为字符串原样保存；不能因默认使用 UUID 就拒绝已有自定义字符串 ID。保留 null、字段缺失、空字符串、0、原始时间字符串和 JSON-compatible 扩展字段。`extractionProposalId` 原来缺失时继续缺失；不统一填 null。序列化无法无损表达的异常值必须明确报错，不能静默丢弃后标记完整。

未来双向同步如需关系型业务表，可从经校验的快照进行显式迁移；本阶段只为格式和身份稳定性负责，不预先承诺冲突策略。

## 4. Account、Session 与匿名数据绑定

### 4.1 最低认证实现

- 邮箱验证码登录，首次验证成功后创建 Account，不自建密码系统。使用 Supabase Auth 验证邮箱；其官方提供邮箱 OTP 流程。[官方说明](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- Account 使用稳定内部 ID，关联唯一的 `(auth_provider, auth_subject)`；邮箱是联系/登录信息，不是数据主键。不能根据客户端提交的邮箱认领 Account。
- Next 服务端验证 OTP 结果后签发自己的随机不透明 Session；浏览器只持有 `HttpOnly + Secure + SameSite=Lax` 的 `__Host-life_session` Cookie。PostgreSQL 只保存 token 摘要、Account、到期/撤销状态。此为自建 BFF Session，不是声称 Supabase 默认客户端 Session 自动具有这些属性。
- OTP 请求/验证限流、失败次数控制、统一错误文案；验证成功轮换 Session。所有变更 API 校验 Origin/CSRF，Session 不写 localStorage、业务 Dexie 或导出文件。供应商认证响应及令牌不记录日志。
- 云 API 根据服务器验证的 Session 获取 Account；不信任请求体中的 accountId。Session 过期只暂停云操作，本地保存和读取继续可用。

### 4.2 本地库身份

一个本地生活库对应稳定 `libraryId`，与浏览器安装标识 `installationId`、物理 Dexie 名称分别记录。Account 可以拥有多个本地库备份流；每个库最多绑定一个 Account。

建议额外使用独立的本地基础设施数据库 `life-control`，保存库目录、绑定回执、当前库指针、备份暂存状态和恢复阶段。**现有七表仍是 Dexie v6，不给业务实体添加 accountId、不批量重写现有行。** 这意味着新增本地基础设施持久化，而不是声称完全不新增任何存储。

原来的 `life` 直接登记为匿名库，仍原地工作。登记失败不得删除、改名或搬空原库。绑定通过固定 operationId 幂等提交；服务器成功但本地回执写入失败时，重新查询同一结果，不能创建第二个归属。基础设施目录丢失时进入显式恢复/认领流程，不默认把发现的数据库上传给当前账户。

| 场景 | 数据行为 |
| --- | --- |
| 未登录 | 原有功能照常使用；完整导出和本地文件恢复不要求账户 |
| 第一次登录 | 展示当前库记录/图片数量和上传范围；用户明确“将本机生活库绑定到此账户”后绑定；登录和绑定本身都不上传正文 |
| 云端已有备份，本机也有匿名数据 | 两边分别保留；可绑定本机库成为独立备份流，或恢复云快照到新库；不按同 ID 合并 |
| 第二台设备登录 | 只显示账户的备份目录；用户选择恢复才下载；不自动覆盖本机内容 |
| 会话过期或离线 | 已选本地库继续读写；重新认证后才允许云上传、签名和下载 |
| 主动退出 | 停止云任务、清除账户 UI 缓存；在线时撤销 Session 并由服务端清除 Cookie；保留原本地库并在应用中锁定；匿名记录使用独立库 |
| 重新登录同一账户 | 可重新打开之前的本地库；不自动把较旧云快照覆盖进来 |
| 登录另一账户 | 不展示/打开前一账户的库，不自动重绑；独立匿名库须再次明确绑定 |

退出时如离线，先完成本地退出并保留撤销待办；JavaScript 无法自行清除 HttpOnly Cookie，恢复网络后必须先撤销旧服务器 Session、清除 Cookie，再恢复其他云操作。不能声称离线已经即时撤销云会话。已签发对象 URL 可能有效至短期到期，退出只阻止新授权和备份最终提交，不能收回已传输的字节。

“本地锁定”是应用隔离，不是本地数据库加密。同一系统用户仍可能通过开发工具读取 IndexedDB；本阶段不宣称共享电脑上的加密保险箱能力。

必要接入改动仅是数据库访问上下文：每次业务操作在开始时固定数据库实例，异步 AI/备份也固定所属库和会话代次。不能在运行中替换一个全局 db，导致旧请求写入新账户库。切库前处理未保存编辑器、正在提交的操作，并协调同源多标签页；其他标签页确认退出旧上下文后才激活新库。

## 5. PostgreSQL schema 提案

以下是逻辑 schema，不是本轮待执行 migration。账户/备份属于基础设施，不新增生活记录模型。

| 表 | 核心字段与约束 |
| --- | --- |
| `accounts` | `id uuid PK`，`auth_provider text`，`auth_subject text`，`email text`，`status`，`created_at`；唯一 `(auth_provider, auth_subject)` |
| `sessions` | `id uuid PK`，`account_id FK`，`token_hash UNIQUE`，`created_at`，`expires_at`，`revoked_at`；不存明文会话 |
| `libraries` | `id uuid PK`，`account_id FK`，`installation_id`，`bind_operation_id`，`created_at`，可空 `restored_from_backup_id`；唯一 `(account_id, id)`、`(account_id, bind_operation_id)` |
| `backups` | `id uuid PK`，`account_id`，`library_id`，`operation_id`，`format_version`，`dexie_version`，`client_captured_at`，`received_at`，`completed_at`，`status`，`manifest_sha256`，`total_bytes bigint`，`table_counts jsonb`，`error_code`，校验租约/检查点；唯一 `(account_id, operation_id)` |
| `backup_files` | `account_id`，`backup_id`，`file_id`，`archive_path`，`kind`，可空 `table_name`，`object_key`，`object_version_id`，`expected_sha256`，`verified_sha256`，`expected_bytes bigint`，`verified_bytes bigint`，`status`；PK `(account_id, backup_id, file_id)`，归档路径唯一 |
| `backup_verifications` | `account_id`，`backup_id`，`id`，`validator_version`，`kind`（上传校验/恢复演练/副本校验），`completed_at`，`status`，计数/摘要/非正文错误码；追加式记录 |

约束与存储原则：

- `backups(account_id, library_id)` 复合外键到 `libraries`；文件与校验记录均通过复合外键保证账户归属一致。`restored_from_backup_id` 如提供也必须验证属于同账户，导出包中的库 ID 本身不是归属凭证。
- 状态仅属于备份基础设施：`uploading → verifying → complete`，失败/取消独立表示。用户只有 complete 快照可以进入云恢复。校验记录追加写，不覆盖原报告。
- 完成后的快照成员、摘要和对象目录不可修改。新的本地编辑产生下次完整备份，而不是更新上一次快照。完成时间使用服务端时间；不把客户端时钟作为并发顺序或可靠性依据。
- 七表内容在对象存储中的 JSON 文件是规范备份内容；PostgreSQL 的数量/摘要只是目录与核对信息，不是第二套正文数据。不要为单独查询 Diary 再复制一份可变 JSONB。
- 配置最小权限运行角色；业务 API 限定账户，RLS 作为第二层保护。连接池内账户上下文采用事务局部设置，避免串租户。迁移/管理员角色与应用角色分开；不能用绕过 RLS 的角色证明隔离正确。[PostgreSQL RLS 边界](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## 6. 完整导出格式与对象存储

### 6.1 一套格式服务于本地导出和云备份

建议格式 `life-backup` v1，下载文件为 `.life.zip`，解压后为标准 JSON 与独立图片文件：

```text
manifest.json
records/moments/000001.json
records/momentAppends/000001.json
records/diaries/000001.json
records/attachments/000001.json
records/lifeEvents/000001.json
records/lifeExtractionJobs/000001.json
records/lifeEventProposals/000001.json
images/<opaque-file-id>.<safe-extension>
```

每个 JSON part 是一组实体的数组，大小受控；七表即使为空也必须出现在清单。Attachment 实体 JSON 仅移出 `blob`，由清单单独关联 attachmentId、文件路径、Blob.type、实际 bytes 和 SHA-256。原 fileName、mimeType、声明 size 原样保留，不从安全归档名推回用户元数据。

manifest 保存格式版本、源 Dexie 版本 6、导出器版本、捕获时间、来源 libraryId、七表数量、文件列表、实际长度与 SHA-256。对**最终写出的 UTF-8 JSON 文件字节与图片原始字节**计算摘要，不要求未来 Swift 通过重排 JSON 键复现同一序列化。manifest 自身的摘要记录在云端校验回执中，避免自引用。

不压缩重编码原图、不移除 EXIF、不把 URL 当作图片备份、不把二进制整体 Base64 塞进 JSON。原图可直接查看，归档完整恢复不依赖账户、供应商域名或在线 API。JSON 单独阅读有用，但缺少 images 的文件集不能标记为完整可恢复备份。

编码与导入必须保留中文、emoji、UTF-16 证据偏移、换行、组合字符、缺失字段及原始时间。来源指纹不等于文件摘要，两者用途不同。检查归档路径穿越、重复 entry、重复 JSON key、危险扩展属性、解压炸弹、大小/数量超限和不支持的版本；导入数据作为数据处理，不能渲染执行其中 HTML/SVG。

### 6.2 对象存储策略

- 私有 S3 bucket，阻止公开访问；按账户/backupId/随机 fileId 隔离 key，不把正文、邮箱或原始图片文件名放入 key。
- 浏览器取得服务端批准的短时、限定 key/方法/校验值的签名上传凭证，直接上传对象。凭证和下载 URL 不进入日志或导出包。限制配额、文件数量和实际字节数，不提供任意 key 签名器。
- Supabase S3 兼容层不提供 bucket Versioning。每个 backup part 和 manifest 使用服务端生成的 backup-scoped 随机唯一 `object_key`；服务端按注册 key 读取并验证精确字节数与 SHA-256，part 确认后不再签发上传 URL，不提供删除或覆盖接口，完成快照的 PostgreSQL 目录由 SQL trigger 保护。唯一 key 规则替代 VersionId 依赖；可空 `object_version_id` 仅为历史 catalog 兼容保留，不参与验收。
- 普通应用流程不提供删除或原地改写已完成备份对象的能力；已完成快照不应用自动过期规则。初版不做跨账户去重、图片按需缓存淘汰或增量备份，优先采用独立完整快照。
- 图片继续完整留在 Dexie 中。本阶段“云图片”只是备份副本，不改变现有离线图片读取路径和 Attachment contract。
- 配额不足时拒绝新备份并保留旧快照，提供本地导出；不能自动删除最旧备份腾空间。未完成上传的清理限于明确的暂存策略，不能波及完成快照或本地原始数据。

## 7. Backup 流程与成功条件

1. 用户点击“备份现在”，检查账户与库绑定，明确包含全部已保存原始内容、位置、原图、软删除记录和 Lab/AI 审核历史。
2. 在一个覆盖七表的 Dexie 只读事务内取得一致快照，复制记录及不可变 Blob 引用；事务内不等待网络、压缩或 WebCrypto。这样不会读到一半审核、一半图片保存的状态。[Dexie 事务说明](https://dexie.org/docs/API-Reference)
3. 事务外分块编码、哈希、生成清单；耗时 CPU 工作放 Worker，限制图片并发。快照捕获可能短暂排队本地事务，必须测量大库耗时，不能因上传长时间锁住记录保存。超出实测支持容量时明确失败，不分多次 live read 冒充一致快照。
4. 在基础设施暂存区保存固定 backupId 对应的实际快照材料；成功暂存后才申请上传。刷新后可继续这份快照。暂存丢失时必须重新捕获并使用新 backupId，不能给旧摘要换上新内容。
5. 服务端幂等创建 uploading 目录、预留配额并签名；客户端上传 JSON parts 和原图。网络中断保留已上传进度，用户可续传同一个快照。新编辑继续本地保存，留到下一次备份。
6. finalize 将备份置为 verifying，服务端按 PostgreSQL 登记的唯一 object key 读取对象，独立核对实际长度、SHA-256、七表数量、唯一索引及结构关联，不能只信客户端清单或 ETag。校验工作有持久化检查点和租约，支持幂等恢复，不依赖一次长函数或响应后的裸 Promise。
7. 使用有期限、可恢复的服务端执行任务处理校验；不另造 AI Job，也不扫描本地新记录。部署平台必须真实支持该执行方式，不能把数 GB 图片塞进 Next JSON 请求。本仓库有 Netlify 配置，实施时要针对所选运行环境验证时长、请求/内存上限。
8. 所有成员校验通过，PostgreSQL 事务才标记 complete 并记录回执。响应丢失时查询原 backupId；重复 finalize 不新增备份、不重复扣额度。任何一步失败保留之前的 complete 快照。

“完整”需要分别核对：文件级完整性、七表结构完整性、原有唯一约束和审核双向关联。允许已有 contract 支持的 stale/missing source，不要求所有指纹等于现在的正文。父项缺失等历史异常必须报告、保留原始归档且不能自动补造；破坏唯一约束或审核关联的归档不得获得可恢复通过结论。

校验 complete 表示这份快照在云端完整、符合恢复格式；独立恢复演练是另一条验证记录，不把“哈希一致”冒充“已做恢复测试”。UI 显示捕获时间与完成时间，例如“已备份 9 月 7 日 14:30 的记录”，不显示“所有设备已同步”。手动备份的用户数据恢复点就是最后一个成功快照；之后尚未备份的编辑不在保护范围内。

## 8. Restore 流程：永不原地覆盖

云快照和本地 `.life.zip` 使用同一个校验器和恢复器。云端只提供授权下载，恢复写入发生在浏览器，离线文件恢复无需登录。

1. 云恢复选择 complete 快照；本地导入选择完整归档。读取清单并检查版本、容量和全部文件，显示捕获时间、七表数量、图片数量/字节数及异常说明。
2. 验证所有字节、唯一键和关联后，新建 `life-restore-<random-id>` 隔离数据库，使用同一 `LifeDatabase` v6 schema。保留原库，不执行 clear/delete。
3. 用专门的存储恢复适配器原样导入七表并重建 Blob。小批量写入可以分事务，但此库在全部完成前不能被应用打开；失败时保留原库与失败状态。不能调用 createMoment、updateDiaryContent、createManualLifeEvent 或审核命令，以免改变时间/指纹/审核结果。
4. 从恢复库重新读出，核对七表计数、实体等值、可选字段、每张图片字节摘要和关联。使用现有只读查询核对 Timeline、Calendar、Search、Life Statistics 与源快照一致。
5. 写入“验证完成”标记后，用户明确“打开恢复后的生活库”；切换前处理未保存内容与多标签页活动。仅通过一个本地目录事务切换 active 指针。阶段标记使中断后可判断新库是否可打开，不能依赖两个 IndexedDB 数据库之间不存在的跨库原子事务。
6. 原库继续保留，可以切回；不在恢复成功后顺手永久删除。恢复库获得新的 libraryId，manifest 的来源和 restoredFrom 只作为基础设施 provenance，七表实体 ID 原样保留。

新 libraryId 将第二台设备的后续备份作为独立流保留，避免两台设备轮流覆盖“账户最新全库”。本阶段不能把恢复后的两个库当成已连接的双向同步副本；后续同步必须显式选择/迁移，不按同 ID 静默合并。

备份恢复保留 deletedAt；它不是回收站“恢复记录”操作。恢复较老快照可能包含当时尚未删除的记录，UI 应明确展示快照日期；因为写入独立库，不会把这些记录自动复活到当前库。旧备份也会保留后续删除前的数据，本阶段不暗中传播永久删除或设置 30 天自动清理。

## 9. 服务端 API 边界

| API 提案 | 允许做什么 |
| --- | --- |
| `POST /api/auth/email/start`、`POST /api/auth/email/verify` | 请求/验证 OTP，建立 Session；不读取本地正文 |
| `GET /api/account`、`POST /api/auth/logout` | 返回当前账户、撤销本会话；不清空本地数据 |
| `POST /api/libraries/bind` | 用幂等操作认领本地库的云备份命名空间；只收身份 metadata |
| `GET /api/backups`、`GET /api/backups/:id` | 查询本账户快照与真实进度；按库区分，分页 |
| `POST /api/backups` | 固定格式/清单摘要/配额和幂等 ID，创建上传会话 |
| `POST /api/backups/:id/uploads` | 为已登记文件签发限定上传授权，必要时续签 |
| `POST /api/backups/:id/finalize` | 请求持久化校验；可返回 202 + 状态查询位置 |
| `POST /api/backups/:id/downloads` | 为 complete 快照登记的唯一 object key 签发下载授权 |

导出打包与本地导入不需要云 API；生产校验任务使用内部认证入口/执行器，不暴露对象任意读取能力。所有 backupId、libraryId、fileId 都重新检查当前账户归属。没有 `/sync/push`、`/sync/pull` 或云端修改 Moment/Diary 的 API。

未来 iOS 可复用 manifest、摘要、备份 API 与邮箱认证语义；Web Cookie 传输层未来可适配原生安全存储中的会话凭证。本阶段不实现原生认证 SDK 或同步协议。

## 10. 安全、备份与灾难恢复边界

- 浏览器至 Life API、对象存储、数据库连接均启用 TLS。云磁盘/对象使用供应商静态加密，生产凭据仅服务端环境变量/密钥管理；数据库连接串与对象管理凭据不进入客户端 bundle。
- **第一版不是端到端加密。** 服务端校验器与有权限的云运维可以读取备份内容。应在首次备份说明中明确；端到端加密涉及恢复密钥、校验方式与跨设备解锁，不能只加一个开关就宣称实现。
- 云备份会包含 ID、指纹、原图、位置、原始正文、追加、软删除和审核历史；只传 Life 的账户/备份基础设施。Phase 15 的选中文本提取边界保持，备份不调用 AI、不向模型网关发送整库，也不触发恢复后自动提取。
- 不记录正文、候选内容、邮箱验证码、原图、签名 URL 或 Session；错误只记录稳定错误码、任务标识、数量/耗时。生产遥测不能自动抓取上传请求体。
- 导出的 ZIP 包含私人数据且默认不加密，文件归用户保管。SHA-256 可以检测损坏；随文件附带的哈希不是可信签名，不能证明任意外来归档的作者或真实性。
- Web 存储仍受 origin、配额和浏览器清理影响；请求 persistent storage 只能改善，不能保证永不丢失。域名变更不能自动读取旧 origin 的 Dexie，需要在旧域名先导出或完成云备份。[浏览器存储边界](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

基础设施备份与用户快照分开验收：

1. PostgreSQL 开启所选生产套餐支持的备份/PITR，并保留独立的加密逻辑备份。建议每天一次、保留 30 天作为初始运维策略；这不是删除用户快照的规则。PITR 需要可用基础备份和连续 WAL；恢复需演练。[PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)
2. 原图和 JSON 对象单独做独立权限域中的备份副本，核对 object key、字节和清单引用。唯一 key 只能降低覆盖风险，不能替代独立备份；Supabase Storage 不依赖 VersionId。
3. Supabase 的数据库备份不包括 Storage API 对象；无论图片使用 S3 还是 Supabase Storage，都不能只恢复 PostgreSQL 就宣布图片已恢复。[官方备份边界](https://supabase.com/docs/guides/platform/backups)
4. 灾备恢复先到隔离环境，核对 PostgreSQL 目录对应的全部对象与摘要，再开放快照下载；丢失目录时可由保存的 manifest 重建经验证的目录，但不能仅信归档中的 accountId 自动授予访问。
5. 认证用户到 Account 的稳定映射、Session 撤销策略、解密密钥及恢复操作手册也属于灾备范围。数据库回退后全部旧 Session 失效，重新验证邮箱，避免复活已撤销会话。
6. 运维目标建议“独立副本最长落后 24 小时”；实际 RPO/RTO 由配置及恢复演练报告给出。用户手动快照的捕获时间另计，不能承诺未备份编辑零丢失。

## 11. UI 最小接入

在现有更多入口中提供轻量“账户与备份”页面，不改变首页记录优先级，也不添加复杂设置中心。

- 匿名状态：邮箱登录、导出完整数据、从文件恢复。
- 已登录：当前绑定库、明确的“备份现在”、最后成功快照时间、按库区分的备份列表、恢复、退出。
- 上传/校验：显示真实阶段、数量或字节进度；后台等待不遮挡记录页面。刷新后查询既有任务，不能重开同一份备份。
- 失败：区分网络中断、登录过期、配额不足、校验不通过；保留可重试任务与旧成功快照。
- 恢复预览与切库：显示时间/数量，明确“恢复到独立生活库，原库保留”；不提供本轮未设计的合并选项。

移动端要限制内存、压缩/哈希并发与下载体积。不能只依赖桌面 File System Access API；导出使用有能力检测的流式方案与通用下载路径。Safari 下暂存、ZIP 和恢复容量必须实测，超出支持范围在写入/上传前告知，不截断图片，也不假报导出成功。

## 12. 实施顺序与测试计划

确认后按以下顺序推进；每一步具备独立验收产物，不先接云再补恢复能力。

| 步骤 | 交付与验收门槛 |
| --- | --- |
| 16A.1 完整归档 | v1 manifest/JSON/images、七表一致快照、本地导出与隔离恢复；先用合成数据证明往返无损 |
| 16A.2 账户与库隔离 | 邮箱 OTP、服务器 Session、匿名绑定、原库登记、退出/再登录/切库、多标签页与异步任务归属测试 |
| 16A.3 云备份 | PostgreSQL migration、私有对象存储、幂等上传、持久化校验、真实状态、云恢复；断网重试不影响本地记录 |
| 16A.4 灾备与验收 | 独立副本、隔离环境恢复、权限攻击测试、移动端压力测试、操作手册和完整回归 |

必须覆盖的验证：

1. **无损往返**：七表、空库、中文/emoji/换行/特殊字符、null/0/缺失字段、自定义字符串 ID、时区/day 精度；恢复后原文、指纹、requestKey、候选证据、收藏、位置和所有原图字节不变。Blob.type 与声明 metadata 不一致的合法历史数据也能保留。
2. **审核与删除**：pending/accepted/corrected/rejected/superseded、Fake Lab、stale/missing source、手工 Event、软删除父子；不会自动审核、触发 API 或复活到当前库。检测不合法唯一键与损坏关联，保留失败归档供用户取回。
3. **一致快照**：捕获时并发新增图文、Diary 编辑、Moment 删除、Proposal 审核；结果是完整事务前或后状态，不出现半个审核链。
4. **故障注入**：中断上传、刷新、离线、会话到期、对象丢失/被覆盖、错误摘要、finalize 超时/回执丢失、Worker 崩溃/租约超时。旧成功快照一直可恢复，状态与配额幂等。
5. **恢复安全**：格式不支持、损坏 ZIP、路径穿越、重复文件/ID、超大解压量、IndexedDB 配额不足、写入失败、切换前崩溃、未保存 Diary、多标签页；原库行数与字节保持不变，未完成库绝不激活。
6. **账户隔离**：A/B 两账户枚举对方 backupId/fileId、伪造绑定、签名越权、撤销 Session、CSRF、跨账户复用幂等 ID、切账户时晚到的 AI/上传回调；不能访问或写入错误库。离线与 auth 服务故障不影响本地 CRUD。
7. **真实基础设施联调**：使用专用测试邮箱和纯合成记录，连接真实 PostgreSQL 与私有 bucket；上传 JSON+图片，在全新浏览器库恢复，逐行/逐文件比对。再从基础设施副本恢复到隔离环境验证目录与对象，不以 mock 或 upload 200 代替。不会使用真实个人生活库做破坏性恢复测试。
8. **运行回归**：`npm run typecheck`、`npm run lint`、`npm test`、`npm run test:e2e`、`npm run build` 全部通过。现有 IndexedDB integration tests 与新增 PostgreSQL/对象存储 integration tests 一并验收；真实部署路径的认证/备份/恢复冒烟单独记录。检查桌面、390/430px、明暗模式和真实 Safari；报告实测数据规模、用时、峰值内存和容量边界。

## 13. 本轮结果与待确认决策

本轮完成静态代码审查、官方边界核对和这份设计提案；**没有实现账号、导出、云备份或恢复，没有运行新功能测试，也没有修改现有数据库**。当前测试通过与否不能作为尚未实现能力的证据。

待确认的是整套 Phase 16A 方案，尤其是：不可变完整快照；PostgreSQL 管理目录而非云端可编辑业务表；七表 v6 不变、另设本地基础设施库；恢复到独立库；Supabase Auth/PostgreSQL + S3 的建议组合；非端到端加密的明确边界。

确认前不执行 migration、不安装接入依赖、不请求或使用生产云凭据、不上传现有数据。确认后再开展 16A.1，并更新相关正式文档。完成 Phase 16A 后暂停，不继续双向同步、冲突解决或任何新 AI 功能。
