# Phase 15 — Production Life Extraction

实施与验收日期：2026-09-07。只实现用户确认的主动提取与候选审核，不继续后续 AI 功能。

## 已实现

- 首页最近 Moment、Timeline/Calendar/Search 共用的 Moment 阅读项，以及已保存 Diary 的阅读态提供「整理」。打开面板只读本机；明确点击「开始整理」才请求 AI。
- Moment 精确发送 originalText；Diary 精确发送完整标题、两个换行及正文。源 ID、fingerprint、追加、图片、附带位置和其他历史不出本机。
- 服务端使用 Responses API、gpt-5.6-terra、medium reasoning、strict JSON Schema、store=false。返回候选及原文引用经过严格验证，原文引用转成既有 UTF-16 evidenceRanges。
- 成功 Job 和全部 Proposal 沿用既有原子提交；接受、修正和拒绝沿用 Phase 14.3 事务。AI 不能直接创建 LifeEvent。源变化/删除阻止接受与修正，仍可拒绝；已存候选可以离线审核。
- 重开和刷新恢复本地审核状态；相同请求复用成功结果；取消会中止等待；错误只提供明确的手动重试。真实服务失败不降级为 Fake，Lab 保留原有行为。
- 无新表、索引、实体或迁移，Dexie 仍为 v6。原始记录 repositories、模型、LifeEvent 模型、审核服务及统计逻辑未修改。

## 主要文件

| 文件 | 职责 |
| --- | --- |
| `src/features/life-intelligence/application/record-extraction-source.ts` | 同一原始快照的精确文字、指纹和日期/时区 |
| `src/features/life-intelligence/extractor/extraction-protocol.ts` | 边界限额、严格 candidate contract、精确证据定位、有限流式读取 |
| `src/features/life-intelligence/extractor/http-life-event-extractor.ts` | 仅允许指定文本/context 的同源 HTTP Extractor |
| `src/features/life-intelligence/server/openai-extractor.ts` | 服务端配置、Responses 请求、保守提示词、结构化输出及安全错误 |
| `src/app/api/life-extraction/route.ts` | GET 描述与 POST 提取，来源/输入检查、并发与频率限制 |
| `src/features/life-intelligence/components/record-extraction*.tsx` / `.module.css` | 共用整理入口、桌面/手机审核面板、证据和修正编辑 |
| `run-life-extraction.ts`、Life Intelligence repository/port | 启用已有 provider/model 与既有源索引读取；审核事务未重写 |
| `recent-moments.tsx`、`timeline-item-view.tsx`、`diary-detail.tsx` | 接入既有阅读页面，保存流程不接 AI |
| `e2e/production-extraction.spec.ts`、新增协议/API/源快照/持久化测试 | 隐私、失败、审核、幂等、离线、过期、焦点与原文保护 |
| `.env.example`、Phase 15 方案、PRODUCT/ARCHITECTURE/DATA_MODEL/TASKS/DECISIONS | 配置说明与已批准边界，ADR-035 |

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，零 warning |
| `npm test` | 40 文件、326 项通过，包含 IndexedDB 集成测试 |
| `npm run test:e2e` | 全量最终回归 60/60 通过（4.1 分钟） |
| `npm run build` | Next.js 16.3.3 production build 通过 |
| Phase 15 E2E 对 production server 重跑 | 5/5 通过 |
| 浏览器产物隐私检查 | 27 个 JS chunk；未发现实际密钥、服务端配置函数或提取系统提示词；`.env.local` 被 Git 忽略 |
| 数据边界 diff 检查 | 原始 repositories、DB schema、数据模型、审核 application service 均未修改 |
| Git 可见文件密钥检查 | 1463 个文件中未发现实际配置密钥，`git diff --check` 通过 |

全部自动化 E2E 使用隔离上下文和 mock API；不会消耗真实模型或访问用户当前浏览器数据。真实 API 联调另行显式执行。

## 真实 API 联调

生产服务器 `http://127.0.0.1:3180`，隔离 Chromium 浏览器，合成数据。脚本 `scripts/phase15-live-check.mjs` 仅在 `LIFE_RUN_REAL_EXTRACTION=1` 时允许执行；默认测试命令不会调用它。

用户配置的网关为 `fanrenapi.com`，实际请求路径 `/v1/responses`，Job provenance 为 `openai-compatible:fanrenapi.com` / `gpt-5.6-terra`。不能将本次结果描述为 OpenAI 官方直连测试。

| 合成用例 | 结果 |
| --- | --- |
| Moment「今天跑步30分钟。」 | 生成 1 个 day 精度、1800 秒候选；Accept 生成 AI LifeEvent；原文不变；刷新恢复审核且不再请求 AI |
| Diary「合成测试日记」+「今天阅读40分钟。」 | 完整标题与正文发送；1 个候选；Correct 成「阅读纸质书」生成 manual LifeEvent；原日记不变 |
| 模糊 Moment「最近好像做了点什么，可能以后去个地方。感觉忙了很久。」 | 成功返回零候选，不捏造地点、活动或时长，不新增 LifeEvent |
| 现有 Life Map | 只显示经接受/修正的跑步与阅读纸质书事件，待审与空结果不计入 |

最终联调 4 次真实 POST：Moment 200（4.55 秒）；Diary 504（30.05 秒），验证原文及全部相关表不变后明确点击重试，200（16.34 秒）；模糊文本 200（24.14 秒）。此前预检查也出现过网关超时。超时没有被隐藏或标作成功；重试是 QA 明确操作，产品不自动重试。逐次状态和时间见 `live-validation.json`；报告不保存 provider 原始响应。

## 界面与第二轮修正

- 查看桌面 1440px 明色、手机 390px 暗色的真实候选、证据、审核结果和既有地图截图。移动审核是可滚动全高面板，关闭按钮固定在面板头部；操作至少 44px，键盘焦点清晰，尊重 reduced motion。
- 修复关闭原生 dialog 时触发按钮仍受 inert 影响、焦点无法返回的问题。
- 修复修正期间源变化后连「取消修正」也被禁用的问题；保存仍禁用，取消后焦点返回可用的拒绝按钮；未保存修正退出需确认。
- 对已结束的审核移除错误的「只能拒绝」提示，保留源有效性对地图呈现的说明。
- 修复服务端 Next URL 使用 bind hostname 而浏览器使用 public Host 时的同源误判，并补充回归测试。
- 既有地图 E2E 曾在轮询前错过短暂动画状态；改为点击前观察属性变化，同时显式设置 no-preference，再验证最终状态。没有修改地图实现或延长动画来迁就测试。

截图：

- `moment-pending-1440-light.png`：真实 Moment 候选与证据。
- `diary-pending-390-dark.png`：真实 Diary 候选。
- `diary-corrected-390-dark.png`：修正完成后的本地审核。
- `reviewed-map-390-dark.png`：审核后的现有生活地图。
- `live-check-failure.png`：先前真实网关超时状态，保留作为失败处理证据。

## 已知限制与技术取舍

- 网关响应延迟有波动。当前维持已确认的 30 秒请求上限，超时后由用户决定是否重试；不以无限等待或自动重试隐藏上游不稳定。
- `store=false` 与应用不落盘不能保证第三方网关或上游服务零留存，也不能独立验证网关内部模型路由。
- 严格 schema、范围和字面证据校验不等同于完整语义证明，候选仍需逐条人工审核。首版保守提示词允许漏提取和空结果。
- 日记没有历史创建时区，参考日期使用记录创建时间与当前设备时区；面板明确显示，可在既有修正字段中核对。
- 进程内限流不等于认证或分布式配额；公网付费密钥部署需宿主访问保护。本期不新增账号体系。
- 仅成功 Job 持久化；没有后台队列、失败任务恢复或自动重试。原生 iOS Safari、软键盘和 VoiceOver 未做真机验证，Chromium 手机模拟不代替真机验收。

Phase 15 之后暂停，不继续 AI Chat、自动提取、总结、情绪分析或新 AI 功能。
