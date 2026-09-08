# Phase 15 — Production Life Extraction

状态：用户已确认，实现与验收已完成，暂停在 Phase 15。方案日期 2026-09-06；实施与验收日期 2026-09-07。326 项单元/集成测试、60 项全站 E2E、5 项生产版整理 E2E、类型检查、Lint、production build 及合成数据真实联调通过。网关超时与明确手动重试如实保留在 `design/phase15/` 证据中。

## 目标与架构结论

把 Phase 14.3 已持久化的 Life Intelligence 接入已保存的 Moment/Diary。用户主动「整理」后才调用真实 AI；返回候选，经用户逐条审核后才允许进入 LifeEvent。

现有 Dexie v6、ExtractionJob、Proposal、LifeEvent 及索引足以承载首版，无需迁移、新实体、后台队列或新的统计 contract。Accept 创建 AI Event，Correct 创建含用户修正的 manual Event，Reject 只修改 Proposal 状态，绝不生成 Event。

方案审阅时确认了两项阶段限制，本期仅做以下定向接入：

- `run-life-extraction.ts` 原先将 provider/model 固定为 null；Dexie adapter 的 `assertJob` 拒绝非 null 值。Phase 15 已启用已有字段、验证完整描述，并保留 Fake Extractor 的 null/null 兼容性。
- 当前 adapter 只接收一次成功提取的 Job，尚未实现 queued/processing/failed 的持久化生命周期。首版沿用成功 Job + 全部 Proposal 原子提交；正在整理、失败和取消由临时 UI 状态表达。刷新中断后由用户重试，不承诺后台恢复或自动重试。

原始 Moment、MomentAppend、Diary、Attachment 的模型和写入 repository 不改；审核事务仍由 LifeIntelligenceRepository 持有。Life Statistics 与 Life Map 继续只读符合资格的最终 LifeEvent。

## 接入流程

```text
已保存的 Moment / Diary
  → 主动打开「整理」面板（本地读取，恢复已有审核）
  → 查看本次发送范围，点击「开始整理」
  → 读取精确源快照、计算已有 fingerprint、确定日期/时区上下文
  → 获取服务端 Extractor 描述，查找相同 requestKey
      已有成功 Job → 恢复原 Proposal，不再次请求模型
      没有 Job → HTTP Extractor → 同源 API → 真实模型
  → 校验整批候选及证据，原子保存成功 Job + pending Proposals
  → 用户审核
      Accept  → 原子插入 AI LifeEvent + accepted Proposal
      Correct → 原子插入 manual LifeEvent + corrected Proposal
      Reject  → rejected Proposal，不创建事件
  → 现有 Statistics / Life Map 读取最终且源有效的事件
```

网络请求不能放入 IndexedDB 事务。加载页面、保存、编辑、追加、刷新、回到前台和网络恢复都不能触发模型请求。

### 源快照与幂等

- Moment 首版只整理 `originalText`。现有 Moment fingerprint 不包含追加，不能将追加拼进同一请求而继续使用 Moment 原文指纹。追加独立整理留到后续明确范围。
- Diary 使用完整 `title` 和 `body`，通过稳定、无损的拼接约定形成请求文本和证据偏移；fingerprint 继续使用已有 `[title, body]` 算法。不使用列表摘要、搜索摘录或 DOM 文本。
- 参考日期来自记录 `createdAt` 在明确显示的设备时区下的日期，不使用点击整理当天。当前实体没有创建时的历史时区，不能伪称知道当时所在地。用户可通过既有 Correct 字段核对日期与时区。
- 源读取、文本和 fingerprint 必须来自同一快照。服务端不能读取 IndexedDB，也不能替浏览器确认源仍然有效。
- 请求期间或审核前 Diary 被编辑、记录被删除：保留已有审计数据，显示 source stale/missing，阻止 Accept/Correct，仍允许 Reject。旧证据不得高亮在已经变化的新正文上。
- 使用现有 requestKey（source/fingerprint + context + extractor descriptor）。同页锁定重复点击；多标签页的持久化去重仍由唯一索引与事务保证，不能把本地去重描述成云端调用/计费恰好一次。
- 同一版本再次打开恢复原审核结果，不重新生成已拒绝候选。源版本变化可以主动生成新 Job，不删除或重置旧终态。重复的同名事件不做跨记录语义合并。
- Accepted 不能再 Correct；修正必须发生在 pending 阶段，不新增已接受事件的编辑机制。

## UI 入口

1. 首页最近 Moment 的既有操作区增加低强调「整理」，与「追加」并列。快速记录编辑器中不放 AI 入口。
2. Timeline 共用记录呈现组件中的 Moment 增加同一个入口，因此 Calendar/Search 的完整 Moment 结果也可使用；提取始终按 ID 重新读取源，不整理搜索摘录。
3. Diary 只在已保存的详情阅读态提供「整理」，列表仍通过既有详情进入；新建、编辑和未保存草稿不显示入口。
4. 共用一个审核面板：桌面受控宽度浮层，手机全高阅读面。复用当前视觉 tokens、焦点、44px 目标、明暗主题与 reduced motion。关闭返回触发按钮，Correct 未保存内容保留退出确认。
5. 初始面板说明「仅发送这条记录的文字给配置的 AI 服务；确认后才加入生活地图，原文保持不变」，点击「开始整理」才发送。打开已有整理结果只读本地数据，离线也可审核已有候选。
6. 候选展示名称、类别、日期、明确的时间/时长和原文证据；动作使用「接受 / 修正 / 拒绝」。不展示评分、推测情绪、AI 建议或技术 ID。不增加批量接受、AI 首页、全局通知或后台任务中心。
7. 明确区分正在整理、成功但没有候选、已保存待审核、服务未配置、离线/超时/限流、无效模型输出和本地写入失败。失败保留原记录，并提供显式重试。

## 服务端 API 边界

采用一个 `src/app/api/life-extraction/route.ts`，独立于原始记录保存。

| 接口 | 输入与职责 | 不具备的能力 |
| --- | --- | --- |
| GET `/api/life-extraction` | 返回可用状态、非敏感 extractor/provider/model/version 描述及限额，供显式整理时计算 requestKey | 不读正文、不调用模型、不创建 Job |
| POST `/api/life-extraction` | 接收单条文字、参考日期、IANA 时区及预期 descriptor；服务端校验、调用固定模型、验证并返回候选 | 不读写浏览器 DB、不创建 Proposal ID/Event ID、不执行 Accept/Correct/Reject |

若请求使用的 descriptor 与部署配置不同，返回明确冲突并由用户重新发起，避免模型变更后复用错误 requestKey。

- Provider、model 和 key 由服务端 `.env` 配置，沿用 `AI_PROVIDER`、`AI_MODEL`、`AI_API_KEY`；浏览器不得传模型 URL、密钥、系统提示词或自定义工具。不建立通用 AI 代理。
- 首版接一个真实 provider adapter，Fake 仅保留 Lab 与测试，不在真实流程失败后伪装成功降级。
- 服务端仅导入纯协议、候选验证和 provider adapter；不能导入当前导出 Dexie 的 feature barrel。浏览器 HTTP Extractor 不导入服务器配置或密钥。
- 只接受严格 JSON 请求；实际读取限制为 64 KiB 文字、80 KiB 请求体，超出明确拒绝而非截断。候选最多 32、输出最多 128 KiB、模型请求 30 秒超时。
- 使用受约束的结构化输出，并在服务端、浏览器入库前分别做运行时验证；复用现有四类别、日期/时区、精度、区间、整数秒规则。
- 证据必须能精确匹配请求原文并转换为既有 UTF-16 offsets。模型返回的越界证据、重复 key、无效字段、额外指令、截断 JSON、拒答不能作为成功候选入库。不能仅靠 TypeScript 类型或 prompt 宣称安全。
- 保守解释明确事件；没有事实依据可返回空集合。「下午」不虚构具体钟点，未知时长保留 null。记录文本视为数据，不作为系统指令；不给模型浏览、工具执行、代码执行或数据写入权限。
- 响应 `Cache-Control: no-store`；错误只返回稳定错误码和可读提示，不透传原文、密钥或 provider 原始响应。限制并发和请求频率，429 后只允许用户主动重试。

当前没有账号体系。同源检查有助于约束浏览器跨站请求，但不是身份认证。真实 AI 首先在本机或已有访问保护的部署验证；公网启用付费 key 前必须使用部署层访问控制，不能公开一个匿名消耗密钥的接口。本期不为此增加账户模型。

## 隐私边界

- 仅在明确开始整理后，发送该条原始文字和必要日期/时区。本文首版不发送图片、Blob、文件名、EXIF、定位 metadata、经纬度、追加、其他记录、搜索词或完整生活历史。
- 私密信息如果本来写在这条正文中，仍属于发送内容；不能承诺正文被匿名化。
- source ID/fingerprint、Job/Proposal/Event ID 留在本地；模型无须知道本地实体身份。服务端只在本次请求内存中处理文字，不新增远端数据库、内容日志或响应缓存。
- record Job 继续只保存 source 引用和 fingerprint，不复制原文或原始 provider 响应。Proposal 与确认后的 LifeEvent 仍由本机 IndexedDB 保存。
- 查看、Accept、Correct、Reject 均为本地操作，不把审核动作再发送给模型。
- 取消可停止客户端等待并尽力中止请求；已经发给 provider 的文字不能撤回。第三方留存政策需要在选定 provider 后核对，不能将应用不落盘等同于第三方零留存。
- 自动测试使用隔离浏览器和合成文字，不读取用户当前浏览器数据。真实模型 smoke test 也只使用固定合成样例。

## 预计修改范围

- 新增：record-source 读取/组装用例、HTTP Extractor、服务端 provider adapter/协议验证、Route Handler、共享整理入口和审核面板，以及对应测试。
- 定向修改：`run-life-extraction.ts` 使用真实 descriptor；Dexie adapter 校验已有 provider/model 字段；通过已有 `[input.source.type+input.source.id]` 索引增加按源恢复 Job 的读取方法。不新增表或索引，不改审核事务的语义。
- 接线：`recent-moments.tsx`、`timeline-item-view.tsx`、`diary-detail.tsx`，不接入任何保存 hook。
- 保留：Lab Fake 行为，原始记录 repositories，LifeEvent 的原始模型，Statistics/Map 合同及现有数据。
- 文档：确认后新增 ADR-035、更新 Architecture/Data Model 的 provider 阶段说明及 `.env.example`；将 Tasks 中旧「Phase 15 Offline application shell」明确标成 deferred，本次 Phase 15 使用用户指定名称。
- PRODUCT 的旧第 13 节「AI 手动整理」指临时文字整理，与本次事件提取不同；确认后单独记录此次明确授权的 Proposal-first 扩展，不把临时总结需求带入本期。

## 测试与验收计划

| 层级 | 必测行为 |
| --- | --- |
| 单元 | 精确源组装与 fingerprint、descriptor/requestKey、日期参考、严格候选解析、中文/emoji/重复文本证据、未知时长、提示注入样例、空结果 |
| API | 无配置、非法输入与超限、descriptor 变化、无效 JSON、拒答、超时、限流、上游错误、无内容日志/缓存、密钥不进入浏览器产物；mock provider fetch，不依赖外部服务 |
| IndexedDB 集成 | 原文/追加/标题/正文/图片/元数据及时间戳保持不变；Job+Proposal整批回滚；重复请求和并发审核；Accept/Correct/Reject；手工事件优先；Event ID冲突；源变化/删除/恢复；旧Fake Job兼容；按源刷新恢复 |
| 组件与 E2E | 保存及浏览不会请求 AI；Moment/Diary 主动整理、证据与逐条审核、跨页/刷新恢复、离线保存和本地审核、失败重试、编辑过程中源过期；手机/桌面、明暗、键盘、reduced motion |
| 统计与地图 | pending/rejected 不计入，Accept/Correct 后按既有资格进入；源后续变化后排除，原事件保持审计记录 |
| 真实联调 | 配好服务端 provider/model/key 后，用合成 Moment/Diary 走真实模型→本地 Proposal→审核→地图流程，单独记录结果，不能以 Fake 或 mock 代替 |

最终运行 `npm run typecheck`、`npm run lint`、`npm test`、`npm run test:e2e`、`npm run build`。真实联调单独使用隔离浏览器与合成数据，不属于自动化测试默认网络行为。最终计数与截图见 `design/phase15/README.md`。

## 已确认的模型及隐私取舍

用户确认使用 Responses API、`gpt-5.6-terra`、`reasoning.effort="medium"`、JSON Schema Structured Outputs 和 `store=false`。既有 `LifeEventCandidate` 八个字段严格校验；临时 `evidenceQuotes` 仅用于精确定位证据，转换为既有 `evidenceRanges` 后丢弃，不改变模型。

`AI_PROVIDER`、`AI_MODEL`、`AI_API_KEY`、`AI_BASE_URL` 只从服务端环境读取。默认直连 `https://api.openai.com/v1/responses`。本机按用户提供的 `https://fanrenapi.com` 联调 `/v1/responses`，Job provider 如实保存为 `openai-compatible:fanrenapi.com`，model 保存为 `gpt-5.6-terra`。这是配置及请求来源记录，不能独立证明兼容网关的上游模型路由或留存政策。

提示词明确排除模糊推断、计划、否定、假设、情绪与旁及地点；未知时长保留 null。运行时还验证精确原文引用、名称证据、完整字段、日期/时区、时间精度和区间秒数；语义理解仍需用户审核，结构验证不等同于事实正确性保证。

密钥保存在 Git 忽略的 `.env.local`，不进入文档、截图、报告或客户端产物。`store=false` 不等同于第三方零留存。生产流程不自动重试；联调脚本若遇到超时，先验证原文及所有衍生表不变，再最多模拟一次明确点击重试，并逐次记录 HTTP 状态和耗时。
