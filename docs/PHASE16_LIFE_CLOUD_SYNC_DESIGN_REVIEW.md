# Phase 16 — Life Cloud Sync Design Review

状态：设计提案，待用户确认。2026-09-07。本文件不是已接受的 ADR，也不代表同步已经实现。

本轮仅新增本审查文档；不修改应用代码、数据库、Schema、Repository 或部署，不上传现有数据，不接入新 AI 功能。当前工作区已有的 Phase 15/UI 修改不属于本轮改动。

## 审查结论

建议采用 **Dexie 本地工作库 + 持久化 outbox + 有版本的同步 API + PostgreSQL 账户级有序变更流 + 私有对象存储**。

本地提交仍然是“已保存”的依据；云端只负责跨设备提交顺序、版本仲裁与持久副本。读取、搜索和地图继续使用本地 Repository。网络失败不撤销本地保存。第一版不采用 CRDT、协同编辑、最后时间戳覆盖、数据库整库双向覆盖或客户端直写云表。

完整的第一版建议同步七种已持久化业务实体，包括审核链；分阶段实现，但不能只同步最终 LifeEvent 就宣称 Phase 15 数据已跨设备完整可用。

## 当前代码的事实与风险

| 检查点 | 当前实际情况 | 对同步的影响 |
| --- | --- | --- |
| `src/lib/db/client.ts:43` | v6 共七表；Job requestKey、Proposal 的 jobId/candidateKey、Event extractionProposalId 有唯一索引 | 必须保留约束，不能逐表任意 upsert |
| `src/lib/db/client.ts:51` | 全局 `db = new LifeDatabase()`，默认名 life，没有账户命名空间 | 登录切换前必须引入账户绑定的数据库访问上下文 |
| `moment-repository.ts:232` | 只开放 metadata 更新，不开放 originalText 更新；Append 有独立 ID 且正文不可编辑 | 独立创建易于合并，但 metadata/删除仍有并发问题 |
| `diary-repository.ts:48` | 更新完整 title/body，读取后整行 put，没有基准版本校验 | 无法检测另一标签页/设备已修改；不能照搬到云端 |
| `moment-repository.ts:250`、`:268` | 删除父 Moment 时给所有子项写相同 deletedAt；恢复按时间相等选择子项 | 会覆盖之前单独删除的子项标记，存在错误恢复风险 |
| 删除 API 覆盖 | Moment 支持删除/恢复；Append、Attachment 支持单独删除；Diary、LifeEvent 暂无删除/恢复写方法 | 字段存在不代表完整回收站已实现；不能偷偷扩成通用 CRUD |
| 30 天规则 | 产品/文档规定 30 天后可清理；当前没有完整回收站和永久清理机制 | 不能新增“30 天自动清空”的同步行为 |
| Attachment | 仅 Moment-owned image，Blob 必填，直接存 IndexedDB | 远端 metadata 与本机二进制可用性需要分开表达 |
| Job/Proposal | Job 没有 deletedAt；Proposal 使用 generatedAt，没有 createdAt/deletedAt；只提交成功 Job | 不能套统一生命周期字段或同步不存在的后台运行状态 |
| 审核事务 | Job+Proposal 原子提交；Accept/Correct 验证源指纹、manual 冲突并原子创建 Event；终态不能再改 | 同步必须保留事务组与审核意图，不能把三张表独立最后写入覆盖 |
| `source-fingerprint.ts:17` | 对精确字段数组 JSON.stringify 后 UTF-8 SHA-256；metadata 不参与 | 跨语言编码需测试向量；不能用同步 revision 代替内容指纹 |
| ID/时间 | 默认生成 UUID，但 EntityId 是 string，若干输入接受自定义字符串 ID；基础时间校验较宽 | 历史数据不能直接强制 UUID/canonical timestamp 后丢弃不兼容行 |
| 离线启动 | 本地 CRUD 可离线；Service Worker/application shell 仍是 deferred | 完全断网冷启动和已缓存图片可读需独立验收 |

删除问题的静态反例：先在 t1 单独删除图片，之后在 t2 删除其 Moment；现有 cascade 把图片 deletedAt 改成 t2；恢复 Moment 又把这张图片恢复。它与 DATA_MODEL.md“保留独立删除子项”的要求冲突。实施前应先用隔离测试固定此反例并修复，不在本次审查中改代码。已有历史标记若已被覆盖，不能凭时间戳猜回原状态。

另外，Moment metadata 更新、Diary 编辑、Append 的父记录检查存在事务外先读后写路径。同步会增加并发写入者，届时必须把读取、条件检查、业务写入和 outbox 放进同一事务，而不是只在调用完成后追加一个网络请求。

TASKS.md 中旧的“Phase 16 - AI job and server boundary”是旧路线。本次按用户指定的 Cloud Sync Design Review 审查；确认后再更新路线和新增 Accepted ADR，本轮不执行旧 AI 任务。

## 1. 第一版同步范围

| 实体/状态 | 第一版建议 | 理由 |
| --- | --- | --- |
| Moment | 同步全部持久字段及 tombstone | 原文、时间、收藏值、位置都是用户数据 |
| MomentAppend | 同步全部字段及 tombstone | 是独立原始内容，不能合并进 Moment 原文 |
| Diary | 同步全部字段及 tombstone，并保留并发版本 | 正文可编辑，需要防覆盖 |
| Attachment | 同步 metadata 与原图对象，Blob 作为本地缓存 | 图片与文字同属原始数据；两者分别确认上传状态 |
| LifeEvent | 同步全部已持久化行，包括 stale/源缺失/软删除审计数据 | 已接受或手工记录不是可随意重新生成的缓存 |
| LifeExtractionJob | 同步已持久化成功 Job、descriptor、input、context、requestKey | 提取来源、幂等与审核链依赖它 |
| LifeEventProposal | 同步全部已持久化状态、候选、证据范围、修正和 Event 关联 | 拒绝也是真实决定；否则第二台设备会重复审核 |
| UI 状态、未提交编辑器草稿、对象 URL、地图几何/统计结果、搜索缓存 | 只留本地或重算 | 非跨设备业务事实；不顺便新增云草稿功能 |
| 请求中的 AbortController、错误提示、网络重试时钟 | 本地 | 不是 Job 的持久化生命周期 |
| Tag、AiMetadata、DailySummary 等未落地实体 | 不新增，不同步 | 不是当前功能 |

`/lab` 不是数据隔离域。现有 Fake Lab 的 scratch Job 存有文字，审核产生的 Event 是真实本地行。建议全库同步时一并保留，并在首次同步范围说明中披露 scratch 数据；不能按路由或 provider=null 偷偷筛掉，否则会破坏 provenance。独立手工 Lab Event 也没有可靠的自动排除标记。

这是用户主动启用的“生活库云同步”，会传输 ID、指纹、图片和位置到用户的 Life 同步服务。Phase 15 的“只发送所选正文给 AI”仍保持；**Life 同步服务与 fanrenapi.com AI 网关不是同一个数据目的地**，不能把整个库发给 Extractor。

## 2. PostgreSQL 映射

建议保留七张业务表，而不是把全部实体塞进一张无约束 JSON 表。所有业务主键和引用都按账户限定：`(account_id, id)`。新 ID 继续 UUID；第一版已有实体 ID 列建议 text，避免破坏当前允许的字符串 ID。

| 本地表 → 云表 | 核心映射 |
| --- | --- |
| moments → moments | original_text、is_favorite、location、原始 createdAt/updatedAt/deletedAt |
| momentAppends → moment_appends | moment_id、text、原始生命周期字段 |
| diaries → diaries | title、body、is_favorite、location、原始生命周期字段 |
| attachments → attachments | owner_type=moment、owner_id、kind=image、file_name、mime_type、size、width/height、原始生命周期；二进制另存 |
| lifeEvents → life_events | origin、可选 extraction_proposal_id、source type/id/fingerprint、category/name、occurred_on、time_zone、time_precision、start/end、duration_seconds、metadata、生命周期 |
| lifeExtractionJobs → life_extraction_jobs | request_key、input kind 与精确 input、context、extractor 描述、既有状态/次数/时间/错误码；不添加业务 deletedAt |
| lifeEventProposals → life_event_proposals | job_id、candidate_key、candidate、evidence_ranges、status、corrected_candidate、materialized_event_id、generated/updated/reviewed 时间；不伪造 createdAt/deletedAt |

映射原则：

- 正文使用 text；location/metadata/candidate/evidence/input 等结构可使用带严格应用校验的 jsonb。明确区分 null、缺失、空字符串和 0。SQL 中可空的 extraction_proposal_id 在回传普通手工 Event 时要省略，不改成 JSON null。
- occurredOn 是 date；timeZone 独立保存 IANA 名称。day 精度不造午夜时间。duration 用 bigint 并约束到现有 JS safe integer 范围，未知仍为 null。
- 新规范时间可用 timestamptz(3) 索引/查询，但迁移不能仅转换后覆盖历史原始时间字符串。以无损 payload/原始字符串保留历史表示，解析值仅为服务端索引辅助。绝不把接收时间改写成用户 createdAt。
- 原文不 trim、不 NFC 归一化、不改换行。导入预检查无法直接表示的历史值（例如特殊 Unicode/非规范时间）时，保留无损原始档案并报告，不能跳过后宣布全量同步成功。
- 保留唯一约束 `(account_id, request_key)`、`(account_id, job_id, candidate_key)` 与非空 `(account_id, extraction_proposal_id)`。父子引用不能跨账户；Proposal↔Event 双向引用在事务末验证，可用延迟约束。
- source 是多态且历史审计允许 missing；不能强加删除级联 FK 把历史 Event 清掉。新创建命令验证同账户有效来源；历史导入单独验证完整性，异常记录隔离保留。

必要的同步基础设施与业务模型分开：账户/设备、实体 revision 与删除批次元数据、账户 sync head、mutation receipts、immutable change bundles、sync conflicts、对象上传状态。它们不是新的生活记录模型；没有必要现在新增团队、workspace、角色矩阵或协作 CRDT。

## 3. 新增、编辑、删除、恢复怎样提交

基本单位是**业务操作及其原子事务组**，不是任意整行覆盖。

1. Repository 在一个 Dexie 事务内验证、写业务行，同时写 durable outbox、基准版本和本地递增序号。
2. 事务成功即可显示“已保存到本机”，不等网络。网络工作在事务外进行。Dexie/IndexedDB 的事务会自动提交，不适合把云请求放在事务中等待。[Dexie 事务说明](https://dexie.org/docs/API-Reference)
3. outbox 每个操作有稳定 mutationId、固定 payload、账户/设备、实体 ID、baseRevision、必要依赖和 transactionGroupId。同一次传输重试使用同一 mutationId；曾发出的 payload 不能偷偷改变。
4. 云端在同一 PostgreSQL 事务内校验账户、基准 revision、业务不变量，写业务行、revision、变更流和幂等回执，提交后才 ack。
5. 客户端原子处理 ack。若发送期间又有新编辑，只确认被发送的那一版，不能用旧 ack 覆盖新正文或把新修改标成已同步。

明确命令可以包括：createMomentWithAttachments、appendMoment、updateMomentMetadata、updateDiaryContent、deleteMoment、restoreMoment、已有单独子项删除、createManualEvents、commitExtractionBatch、reviewProposal。不存在的 Diary/LifeEvent 删除写方法列为单独待批准的回收站补齐，不偷偷增加通用 patch/delete API。

远端变更由专用 sync apply adapter 写入本地，保留传入 ID、时间、指纹及事务组，不调用会重新生成这些字段的 create/review 函数。它不再产生 outbox，避免同步回声；提交后通知当前查询与其他标签页刷新。

同一实体离线连续编辑的操作必须有因果依赖：后一个操作引用前一个 mutation 的确认 revision。已发操作只重试；尚未发出的操作可合并传输，但需保留必要正文检查点。不能让自己的第二次编辑错误地与自己的第一次同步冲突。

## 4. Offline → online

```text
启动/回到前台/本地提交/网络恢复
  → 验证当前账户及本地命名空间
  → 单一协调器取得本机同步租约
  → 验证 session，获取服务端 epoch/head/capabilities
  → 拉取一个完整有序变更窗口
  → 原子写入远端基线与 cursor；保护本地未同步修改
  → 按依赖推送 outbox 的业务事务组
  → 原子记录 ack / 冲突 / 待重试状态
  → 再拉取，补齐推送期间其他设备的提交
  → 继续二进制上传/下载；无工作后结束
```

先 pull 是为了尽早发现删除与编辑冲突，但不能让 pull 覆盖 dirty 本地行：远端最新基线进入 sidecar，未确认的本地工作副本保持可读，冲突双方持久保留。

删除是其中的明确例外：先把未同步修订完整存入冲突副本，再让 tombstone 对正常视图生效；冲突副本仍可回读，但不能把旧 dirty 行重新显示成未删除记录。正在输入的编辑器同样保留输入，不因后台删除通知直接清空。

同一 origin 多标签页用 Web Locks 或带过期时间的本地租约协调；正确性仍依靠 mutationId 和数据库事务，不能依靠“只有一个标签页”。online 事件只是唤醒信号，真正以请求结果判断连通。网络/5xx 重试采用有上限的指数退避与 jitter，429 尊重 Retry-After，401 停止上传并请求重新认证，409 进入冲突处理。同步重试不会触发 AI 重试。

Web/PWA 首版保证应用活跃时最终同步，不承诺浏览器关闭后一定运行。Service Worker 负责离线应用壳，后台同步只是以后可选加速。缓存已安装应用后的离线冷启动必须加入交付门槛；第一次从未加载过的设备当然无法凭空离线安装。

## 5. Diary 并发冲突

建议 **optimistic concurrency + 双版本保留 + 用户明确选择**，第一版不用 last-write-wins、逐字 CRDT 或 AI 合并。

例：A/B 都从 Diary revision 12 开始编辑。A 先成功提交 revision 13。B 带 baseRevision=12 上传不同正文时，服务端不覆盖 revision 13：持久化 B 的完整修订、基准和来源设备，返回冲突与服务端版本。

- title/body 作为一次内容编辑的整体；不把 A 的标题和 B 的正文自动拼接。
- 双方内容完全相同可当作收敛；与正文无关的 metadata patch 只在确认字段互不冲突时合并。
- 编辑器打开时固定它实际读到的基准。同步或另一标签页更新不能改变正在输入的内容，也不能把未看到的新 revision 当成保存基准。
- 冲突面板比较“本机版本/另一设备版本”，允许选择一版或手工整合。选择提交也要带当前 revision，期间再次变化就重新比较。
- 保留未被选中的完整版本于冲突/历史存储，不自动创建第二篇 Diary、改标题或丢掉一方。数据库中的原 Diary ID、createdAt 不变。
- 离线保存成功与云端冲突并不矛盾，界面应区分“已保存到本机”“待同步”“需要处理差异”。不能把冲突显示成记录保存失败。

## 6. Moment immutable originalText 的价值

同一 Moment 的正文无需多方编辑合并。A/B 追加时分别产生不同 UUID 的 MomentAppend，云端取集合并保留父引用，按既有 createdAt/id 排序；不把追加写回原文。正文指纹稳定，引用它的审核证据不因 metadata 同步失效。

不可编辑不等于无冲突：同一 ID 不同原文是身份冲突，必须拒绝覆盖并保留上传副本；收藏/位置冲突仍需版本规则；父记录删除与离线新增 Append 仍需处理。创建时间受设备时钟影响，保持记录时间语义，同时用服务器 revision 负责同步顺序。

## 7. Tombstone、删除批次与长期离线设备

删除是有 revision 的显式操作，不是“行从查询结果里消失”。普通更新不能把 deletedAt 清空；恢复必须是单独操作，携带看到的删除 revision / deletion operation ID。

- 第一版保留 tombstone，不按 30 天自动物理删除。未来真正清理正文/图片后，仍需保留最小 ID/revision 删除屏障，防止旧设备重新 create 同一 ID。
- 对旧 revision 的更新或 create，若服务端该 ID 已删除，返回冲突；不做 upsert 复活。旧设备先持久保存自己的未同步正文/附件，再应用远端删除状态。
- 删除与编辑并发时，服务端保留编辑版本但正常视图以 tombstone 为准；跨过 restore 的旧删除不能再次删除新恢复版本。精确规则以 baseRevision 和删除操作身份判断，不能用两台设备的时钟排序。
- 父 Moment 删除用一个 deleteGroupId 在同一事务覆盖当前活跃子项；此前已独立删除的子项保持原删除身份。恢复只恢复仍由这个父删除批次负责、且未又被独立删除的子项。相关父子 revision/change bundle 原子发布。
- 离线 Append 上传时若父已删除：保存其待解决操作和正文/Blob，返回 parent_deleted；不能悄悄恢复父，也不能把追加作为正常活跃内容同步到其他设备。
- 删除来源仍只让相关 LifeEvent 通过现有 source eligibility 隐藏；不自动更改 Event/Job/Proposal 审计行。源恢复且指纹一致时，按既有规则重新可见。
- 30 天是未来允许明确清理的最低保护期。为避免错误客户端时钟提前清理，可从服务端确认删除起保守计时；保留原始 deletedAt 展示，不用它做同步仲裁。
- 首版不自动裁剪 change log。未来游标过期时必须返回 resync_required，下载一致性快照并保留/重放 outbox；不能把所有本地旧行重新作为新数据上传。

当前代码没有可靠历史 deleteGroupId，无法无损推断已经被覆盖的独立删除原因。这是实施前的真实限制，应保留旧库快照，对歧义恢复显式处理。

## 8. Attachment：本地缓存与云对象存储

保持 Attachment 是独立原图，不在文本里塞 URL，不改变目前只支持 Moment 图片的业务范围。

本地保存：Moment、附件 metadata、原始 Blob、outbox 一次提交。云同步：先提交父记录和附件清单，显示“文字已同步，图片上传中”；随后上传原图到私有对象存储，校验后发布 ready 变更。另一设备可以先读文字，图片尚未就绪时显示准确占位。

建议对象位置由服务端分配并绑定 accountId、attachmentId 和不可变内容版本；禁止客户端传任意对象路径。通过短期签名地址传输，完整校验实际字节大小和 SHA-256，上传完成后由服务端核验对象存在与内容校验信息，再更新 metadata。S3 签名 URL 可在有效期内重复使用，写同 key 可覆盖旧对象，所以还必须使用不可变对象 key/条件写、校验和与对象版本；签名 URL 不是“一次性上传已完成证明”。[S3 官方说明](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)

- Blob 不进 PostgreSQL JSON/change log，也不做 base64 图片同步。
- metadata 的业务 size 等历史值不静默修正；传输校验使用实际 Blob 长度/hash 单独记录，历史不一致必须报告。
- 原图不压缩、不重编码；缩略图只是可重建缓存。原始文件名保留 metadata，不用作可猜测公开路径。
- 未确认上传、冲突中或仅有本地一份的 Blob 禁止主动缓存淘汰。上传中断可重试/续传；重复 finalize 必须幂等，不能生成第二张 Attachment。
- PostgreSQL 与对象存储没有跨系统原子事务。用 pending-upload → verified-ready 状态和定期核对恢复；无引用上传对象只在确认不再被有效上传任务引用、超过保护期后清理。已引用原图不因网络错误直接删除。
- 本地需要拆分 metadata 与 blob cache 的存储 DTO，并提供“本地可用/待下载/待上传/失败”读取状态；不能向当前必填 blob 字段塞空 Blob 冒充下载完成。原业务附件由缓存就绪后组装，展示层允许未缓存图片占位。
- 数据迁移先复制并逐字节校验 Blob 缓存，再标记迁移完成，不能先删原字段。新设备未下载的图片不承诺离线可读；本机已保存/已缓存的图片继续可用。
- 浏览器存储可能受配额和清理影响，持久化存储请求也不能替代备份；配额不足时停止接入/下载并保留既有原件，不先清空库来腾空间。[浏览器存储边界](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 9. LifeEvent、Proposal、Job 的同步规则

三者一同同步，以“已生成候选批次”和“审核提交”作为不可分割业务组。拒绝/过期状态也同步，防止换设备重新出现待审核候选。服务器只验证/复制用户已有提取与审核操作，不能在同步中调用 Extractor 或自行接受候选。

规则仍为：候选内容不可变；pending 只能走既有终态；Accepted 对应 AI Event，Corrected 对应 manual Event；Rejected 不产生 Event；每个 Proposal 最多一个 Event；不能覆盖已有手工 Event。metadata 变化不影响文本 fingerprint，Diary 真正改文才使相应源版本失效。

三个跨设备边界必须明确：

**同一 Proposal 的不同审核。** A 离线接受、B 离线拒绝时，两次本地操作都可持久保存，但不能同时成为全局终态。建议云端首次有效提交成为 canonical 结果；另一提交连同完整修正/Event 快照进入 durable sync conflict。不得静默改终态、覆盖手动数据或删除本地副本。冲突解决前保留本机工作副本并标注未同步，远端 canonical 数据存入 sync shadow；由用户确认采用云端结果后归档本地分支并重新物化该副本。不会给同一 Proposal 再创建第二个 Event。采用云端副本是明确的同步差异处理，不是开放 accepted→rejected 的业务 API。

**相同 requestKey、不同 Job/Proposal ID 或 AI 输出。** 两台设备同时整理可能各自生成不同 UUID/候选。沿用唯一 requestKey 的“第一份成功结果”原则；完整身份和 payload 相同才作为幂等重放。不同批次保留成同步冲突，不擅自改原 ID、重算 candidateKey、删除一批或把两个审核链混起来。先 pull 可以减少这种情况，不能保证模型调用恰好一次。

**来源发生变化。** 新上传的审核命令在云端也核对当前源和已存在的手工冲突；如果已过期则保留操作为冲突，不自动修正原文/指纹。首次旧库导入不同：历史上已结束、现在 stale 的审核是已有审计数据，应以完整历史快照导入，不能重新跑 review 然后以“当前源失效”为由丢弃。历史导入也不能覆盖云端已有终态或已有手工 Event。

“离线立即审核成功、跨设备唯一终态、任何冲突都永远不需要用户处理”三者无法同时承诺。在保持当前业务约束的前提下，本提案选择保留每个本地决定并显式处理极少数冲突。此取舍必须在实施前确认，不能藏在普通同步提示里。

## 10. Revision、change log、cursor 与幂等

- entityRevision：某实体的云端版本整数，用于 compare-and-swap。它不替代 createdAt/updatedAt、内容指纹或 Proposal 状态。
- commitSeq：同一账户内已提交事务组的严格递增序号。
- cursor：版本化的不透明令牌，绑定 accountId、syncEpoch、commitSeq。跨账户、未来序号和不支持的协议都拒绝；bigint 经 JSON 使用十进制字符串，避免 JS 精度丢失。
- mutationId：客户端固定操作 UUID；服务端 `(account_id, mutation_id)` 唯一，同时保存 payload digest、终态回执与 revision。网络层是至少一次投递，业务层靠回执达到幂等应用；不宣称网络恰好一次。

第一版建议用 PostgreSQL 的每账户 sync_state 行锁串行化短写事务：先锁该行，再验证/写实体，递增 head，追加 change bundle 与 receipt，同一事务提交。所有同步写、导入、删除/恢复和后台修复都走此入口。不同账户不互相串行；锁内没有 AI 或对象上传。

不能直接把裸 BIGSERIAL 当“安全已提交游标”：事务 A 先取到 100 但尚未提交，B 的 101 先提交，客户端推进到 101 后就可能永远漏掉稍后提交的 100。PostgreSQL sequence 有独立于事务回滚/可见性的特殊行为；账户级事务行锁方案是本项目针对该风险的设计选择。[PostgreSQL 事务说明](https://www.postgresql.org/docs/current/transaction-iso.html)、[锁机制](https://www.postgresql.org/docs/current/explicit-locking.html)

change bundle 保存本次提交的不可变 after-images/tombstone 操作及必要冲突引用，不在 pull 时随意读更高 revision 的当前行冒充旧变更；这是受保护的业务同步历史，不是请求正文日志。首版可不裁剪，避免过早设计复杂压缩。

pull 返回完整事务组和 endCursor，本地成功提交组内全部实体/shadow/冲突保护及 cursor 后才推进。分页不能把 Proposal 终态和 Event 拆成可见的半份结果。大事务组可以先分块落 staging，完整校验后再原子发布；不把 Phase 15 的 64 KiB AI 限额拿来截断 Diary 同步。

首次 bootstrap 使用一致性快照水位 W：在固定 MVCC 快照内生成可分页读取的不可变快照，包含所有业务行/tombstone/必要删除屏障及对象清单；完成后从 W 继续读 change log。不能用跨多个普通查询拼出不同时刻的快照。未来日志裁剪只在新快照和过期游标恢复均验证后启用。灾难回滚必须更换 syncEpoch，不能让旧客户端把较大 cursor 当成已追平。

## 11. 保护现有 Dexie 数据的迁移

这不能只靠配置一个云 URL 完成。实施时需要批准新的、可恢复的 Dexie 迁移，用 sidecar 保存 outbox、远端基线/revision、cursor、冲突、账户绑定、附件缓存状态；不把它们塞进 LifeEvent metadata 或原文。

迁移顺序：

1. 只读盘点七表，包含 tombstone、stale、scratch、非规范旧值和完整 Blob。生成带版本、逐表计数、关系清单、内容/二进制校验和的迁移备份；无损异常项也保留。
2. 校验可恢复备份和可用空间。不要把在同一浏览器 origin 再复制一份称为独立备份；存储不足则暂停云接入，现有本地使用继续。
3. 新版本优先加 sidecar，不删除/重建七张表。迁移阶段记录完成标志与分批进度；中断可重入。未完成的记录不能被标成已上传。
4. 账户可映射到当前物理 life 库，无须为了改名先搬走原件；数据库内部保存唯一账户绑定。其他账户/退出后的匿名使用不同数据库命名空间。所有 Repository 经同一个账户范围的 DB context 取库。
5. 数据库升级/账户绑定通过跨标签页协调完成；旧版本连接必须关闭/升级，不能继续绕过 outbox 写库。编辑中的草稿先保护，不能强行刷新丢输入。
6. 为旧行生成稳定的导入 mutationId/manifest 和依赖组，按 ID 导入；相同 ID 相同 payload 幂等，不同 payload 隔离为冲突，不自动重新编号或覆盖。
7. 全量云快照及图片实际验证后才报告完成。备份保留；回滚应关闭同步、继续新 schema 的本地模式，而不是强行降级数据库或清空重建。

IndexedDB 受 origin 隔离，本机地址与部署域名、不同浏览器/配置文件不是同一个 life 库。首次登录不会凭空看到另一 origin 的旧数据；需要在原 origin 导入云端或用已验证迁移档案转移。服务端无法直接读取浏览器 IndexedDB。[浏览器存储边界](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## 12. 登录、第二台设备、退出和重登

| 场景 | 建议行为 |
| --- | --- |
| 未登录 | 原有离线记录继续，不发送全库 |
| 首次登录、已有本地库 | 登录与启用同步分开；确认将哪个本地库绑定哪个账户、同步范围和备份后再上传，不自动合并 |
| 云端已存在数据 | 先取云端基线；对未绑定本地数据做显式导入，冲突保留，不用云库替换本地库 |
| 第二台设备空库 | 创建该账户本地命名空间，bootstrap 到水位 W 再追增量；文字优先，图片下载进度单独显示 |
| 第二台设备已有匿名记录 | 不自动上传；可先只打开云库，匿名库原样保留，用户另行确认合并 |
| session 过期/断网 | 已绑定本机库继续离线读写，上传暂停；重新认证同一账户后恢复 outbox |
| 主动退出 | 停止同步、取消请求、关闭订阅并清除会话；账户缓存与未同步写入默认保留但从普通界面锁定，转入独立匿名库 |
| 重登同一账户 | 重新打开原账户库与 outbox，校验身份/epoch，再同步；不当作空库重新上传全部旧数据 |
| 登录另一账户 | 使用另一库，绝不把前一账户的缓存、冲突或 outbox 挂过去 |

退出默认保留是数据安全选择，不是本地加密承诺。单纯 UI 锁定不能阻止同一浏览器的开发工具或恶意同源脚本读取 IndexedDB。若要求共享设备上退出后不可读，需要另外确认本地密钥/加密与解锁策略；明确“清除此设备数据”只能在确认无未同步内容/有可恢复备份后执行，不能变成退出登录的隐式副作用。

## 13. 最低认证方案

建议采用托管 Auth，第一版仅邮箱一次性验证码，避免自建密码、找回、社交登录与复杂权限。Supabase Auth 可作为首个候选，它提供邮箱 OTP；不因此采用客户端直接写业务云表的方式。[Supabase 邮箱认证](https://supabase.com/docs/guides/auth/auth-email-passwordless)

每个已验证身份映射到稳定内部 accountId，不能用可变化的邮箱地址作为数据所有权主键。设备 ID 只标识副本和操作来源，不是认证凭据。

Web 建议 BFF 会话：仅服务端保存/刷新 provider token，浏览器拿 Secure、HttpOnly、SameSite cookie 的不透明会话 ID；所有同步经 Life API。需要明确这不同于在浏览器运行 Supabase SDK 并让它从可读 cookie/localStorage 刷新 token 的默认方式，不能两种模式混用。OTP、会话失效、注销、频率限制和 CSRF 均由成熟实现承担并测试。

未来原生 App 可用 provider access token 调同一 API，刷新凭据放 Keychain；如果增加 OAuth，使用系统浏览器与 Authorization Code + PKCE，不把 Web cookie 拷进 App。服务器对 token 的签名、issuer、audience、有效期和会话授权做验证。

数据库所有查询和对象请求强制 accountId 来自已验证会话。RLS 可作为第二层保护，但服务角色/表所有者可能绕过 RLS，不能只开 RLS 就忽略应用权限和数据库角色配置。[PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

## 14. 服务端 API 边界

推荐 Next.js Route Handler 做传输入口，内部调用独立的 sync service/PostgreSQL adapter。不要把协议做成仅 React Server Action 可调用的接口，也不要让浏览器持有数据库或对象存储管理密钥。

| API 职责 | 允许 | 不允许 |
| --- | --- | --- |
| auth/session | 登录、验证会话、注销、设备登记/撤销 | 信任请求体 accountId 或 deviceId 授权 |
| `/api/sync/v1/bootstrap` | 创建/读取账户一致性快照、watermark、对象清单 | 清空客户端或自动把旧库认领给账户 |
| `/api/sync/v1/pull` | cursor 之后完整的有序变更组，明确 epoch/过期错误 | 返回他人数据或跳过缺失依赖 |
| `/api/sync/v1/push` | 有 baseRevision/依赖的受限业务命令、稳定 mutationId | 任意表名/字段 patch、originalText 更新、任意终态覆盖 |
| `/api/sync/v1/conflicts` | 获取/明确解决本账户同步冲突，保留分支内容 | AI 合并或静默丢弃一方 |
| attachment upload/finalize/download | 短期签名、配额/内容校验、对象状态确认 | 任意 key、公开永久 URL、无校验宣称上传完成 |

返回稳定错误：unauthorized、revision_conflict、parent_deleted、identity_conflict、review_conflict、dependency_missing、cursor_expired、protocol_unsupported、quota_exceeded。冲突 payload 是授权用户的数据；监控日志只保留非内容错误码、耗时和必要请求标识，不记录正文、token、签名 URL、AI 原始响应。

业务操作失败不能返回泛化“整批成功”。多个独立组可部分 ack；同一事务组要么全部成功要么全部保留待解决。鉴权/限流必须服务端持久可靠，不能沿用 Phase 15 仅进程内计数当账户配额。部署是否支持数据库连接池、事务超时和长对象传输要在基础设施阶段验证。

## 15. 加密、备份与恢复

第一版建议 TLS + PostgreSQL/对象存储/备份的静态加密 + 最小权限，不宣称 E2EE。服务器在授权流程中可以读取明文；这须在用户启用云同步前说明。若要求“服务运营方也看不到正文”，应在实现前改选 E2EE，重新审查密钥恢复、对象加密、服务端校验与 AI 文本披露，而不是上线后补一句隐私承诺。

同步不是备份：错误删除也会同步。建议 PostgreSQL 定期快照与连续 WAL/PITR，图片对象启用版本保护并有独立备份，备份 manifest 同时引用数据库水位、对象版本和解密密钥版本。PITR 需要完整可用的基础备份/WAL 链，不能仅凭“每天有备份任务”认定可恢复。[PostgreSQL PITR](https://www.postgresql.org/docs/current/continuous-archiving.html)

建议验收目标而非当前承诺：云端已确认数据 RPO ≤ 15 分钟，RTO ≤ 24 小时；以选定服务能力和实际恢复演练确认。尚未上传的记录不在云端备份范围，不能声称云端能找回丢失设备上的唯一离线副本。更严格 RPO 需要额外冗余成本与确认。

恢复先到隔离环境，核对用户隔离、行数、Blob hash、审核关系和 tombstone，再切换服务；禁止直接拿旧备份覆盖现网。若恢复导致时间线回退，更新 syncEpoch，让客户端保留本地未同步及已确认但可能超过恢复水位的数据，执行受控重新对账；保留删除屏障，防止旧快照复活已经清除的内容。

仅重置 epoch 不会找回备份水位之后的删除。恢复流程必须同时取得该水位后的可用变更/独立保留的删除账本，并保留客户端最近已确认操作的恢复档案；无法证明删除屏障完整时，暂停正常同步、隔离差异并人工恢复，不能把旧设备缺少的远端行一律重新 create。超过实际 RPO 且所有副本都丢失的内容无法凭协议恢复，应如实报告。

账户注销/永久清理、备份过期及对象 GC 需要独立的保留/删除策略，不在本阶段顺手实现。首版不自动清理未解决冲突、原图或历史墓碑。

## 16. Web/PWA 到原生 iOS

同步协议只包含有版本的 JSON 命令、ID、revision/cursor、事务组、日期/时区、hash 和独立二进制传输，不包含 Dexie 表对象、Blob URL、React 状态或浏览器 cookie 假设。

Web 用 Dexie；原生可以用 SQLite + 本地文件缓存，实现相同 outbox、shadow、conflict、ack/cursor 原子规则。App 的前后台调度只是触发器，正确性不依赖系统一定允许运行后台任务。

跨端必须共享测试向量：JSON canonicalization、UTF-8 hash、精确字段数组、空字符串/null/缺失、UTC 毫秒/IANA/date、safe integers，以及 Proposal 的 **UTF-16 code-unit offsets**。Swift String 的字符数不是 JavaScript string.length；不能直接沿用 Swift 字符偏移高亮证据。Swift 使用 UTF-16 视图并严格检查边界；不重新编码旧正文来“修正”证据。

同一实体的 createdAt、source fingerprint、origin 与审核 ID 保持；API 版本/能力协商遇到旧客户端不支持的操作时停止该项同步并提示升级，保留本地写入，不静默剥掉未知字段。

## 17. 分阶段实施与测试门槛

以下均是待确认路线，本轮没有开始：

| 阶段 | 范围 | 必须通过才进入下一步 |
| --- | --- | --- |
| 16.1 协议与迁移准备 | 固定操作/错误/编码向量、备份回读、删除批次反例、账户命名空间；确认隐私/冲突取舍 | 不丢正文/Blob/ID/时间；旧标签页与失败迁移可恢复 |
| 16.2 云基础设施 | 托管 Auth、PostgreSQL 账户隔离、sync head/change bundles/receipts、私有对象桶和备份 | 跨账户访问失败；事务提交/回执丢失/游标顺序可证明 |
| 16.3 原始记录同步 | 本地 outbox/shadow、Moment/Append/Diary、已有 metadata、删除/恢复、冲突面板 | 两设备离线并发、编辑中收远端更新、删除不复活、连续离线编辑不丢 |
| 16.4 原图同步 | 本地缓存迁移、上传验证、下载、断点/失败恢复 | Blob 字节一致；未上传不得淘汰；缺图不伪装就绪 |
| 16.5 审核链同步 | Job/Proposal/Event 整组、请求去重、终态竞争、历史导入与 source stale | 全链一致，AI 不参与同步，manual 不被覆盖，非 canonical 分支可恢复 |
| 16.6 发布验收 | 完整七实体 bootstrap、离线应用壳、账号切换、长期断网、灾备恢复、iOS 协议夹具 | 完整测试与恢复演练通过，才宣布 cloud sync 第一版完成 |

重点测试矩阵：

- **迁移**：v2/v3/v4/v5/v6 旧库、空库/大量图片、非 UUID ID、换行/emoji/空标题、tombstone、stale/scratch/proposal 唯一索引；磁盘满、升级中断、版本切换；旧数据逐字段/逐 Blob 校验。
- **本地原子性**：业务写成功而 outbox 失败必须整体回滚并保留编辑器输入；远端 apply 与 cursor 不能部分提交；同步不产生回声；相同 origin 多标签页关闭/抢租约/重复发送。
- **网络与幂等**：请求成功但 ack 丢失、重复/乱序/部分响应、刷新时未完成请求、401/429/5xx、切换账户时旧请求迟到；mutationId 相同不同 payload 必须拒绝。
- **Diary**：双端同基准不同正文、同正文重复保存、连续离线修订、自身 ack 迟到、冲突解决期间第三次修改；所有版本可回读。
- **删除**：旧设备离线数月后上传；delete/edit、delete/append、delete/restore、双端 restore；子项先独立删除再删父/恢复父；错误客户端时间；没有永久清理副作用。
- **SQL**：两事务并发取序/提交的反例、账户行锁、并发相同 ID/requestKey/Proposal 审核、回滚不产生孤立 change；快照水位期间新写入和分页边界。
- **附件**：错误 hash/大小、断网/过期签名、重复 finalize、上传后 metadata 提交失败、metadata 到达但 Blob 未到、父删除期间上传、缓存满、对象备份恢复。
- **审核**：Accept 对 Reject、两个不同 Correct、同 requestKey 不同提取结果、当前源变更、历史 stale 审核导入、manual 冲突、Event ID 碰撞、Fake Lab 数据链完整；地图仍只读合格最终 Event。
- **身份与隐私**：A→退出→B→重登 A；未上传数据不自动清理、不串账户；对象 URL 越权、伪造 userId/deviceId、CSRF、JWT 到期、缓存泄漏、RLS bypass 角色、日志正文/token 检查。
- **端到端**：双独立浏览器上下文与真实测试 PostgreSQL/对象存储；恢复网络后语义收敛、无未解决冲突时七实体一致；完全断网冷启动/记录/浏览本地图片；iOS Safari/PWA 真机与原生协议测试向量。
- **发布命令**：现有 typecheck、lint、npm test、test:e2e、production build 全通过，再增加真实 PostgreSQL/object-store 集成和灾备演练；单靠 mock/fake-indexeddb 不能证明云事务正确。

## 待确认的关键取舍与暂停点

1. 第一版完整同步七实体和现存 scratch/Lab 审核数据，不仅同步正文与最终 Event。
2. Diary 双版本保留；审核终态竞争采用首次有效云提交 + 显式冲突保留，不静默覆盖、不承诺所有离线决定都同时成为全局终态。
3. 第一版传输/静态加密，不宣称 E2EE；若要求运营方不可见，应先改变设计。
4. 退出默认保留并锁定本机账户数据；它不是本地加密保险箱，也不自动清除未同步内容。
5. 实施需要新的同步基础设施迁移、Repository 事务接线与删除批次修复；不等于重做现有业务模型，具体迁移在确认后单独审阅。

本轮只有静态代码/文档审阅与官方技术资料核对。没有运行新的同步测试、修改运行代码或部署云服务，也不把 Phase 15 通过的测试当成 Phase 16 已实现的证据。到此暂停，等待用户确认后再进入 16.1。
