# AGENTS.md

## 项目说明

这是一个私人生活记录系统。

在进行任何代码修改之前，必须首先阅读：

* `docs/PRODUCT.md`
* `docs/ARCHITECTURE.md`
* `docs/DATA_MODEL.md`
* `docs/TASKS.md`
* `docs/DECISIONS.md`

其中：

`docs/PRODUCT.md` 是产品需求的最高优先级来源。

如果代码、历史实现、已有页面与 PRODUCT.md 冲突，以 PRODUCT.md 为准，但不要擅自进行大范围修改，应先说明冲突。

---

## 核心开发原则

### 1. 不擅自增加产品功能

不要因为认为某个功能“常见”“有用”或“行业标准”就加入。

尤其禁止擅自加入：

* 打卡
* 连续记录天数
* 情绪评分
* 人生评分
* 成就系统
* 每日提醒
* 社交
* Feed
* 排行榜
* AI 主动教育用户
* 复杂分类
* 地图
* 健康数据

除非 PRODUCT.md 后续明确要求。

---

### 2. 记录优先

整个产品最重要的操作是：

打开 → 写下内容 → 保存 → 离开。

任何功能不得让这个流程变复杂。

---

### 3. 原始数据不可被 AI 覆盖

用户的：

* 随笔原文
* 追加内容
* 日记正文
* 图片

属于原始数据。

AI 可以生成 metadata、总结和整理结果，但不得覆盖用户原始内容。

---

### 4. Moment 原文不可编辑

随笔提交以后，originalText 不允许修改。

用户需要补充时，只允许创建 append。

不要通过 UI 或 API 提供直接修改 originalText 的能力。

---

### 5. AI 不得阻塞保存

用户保存记录时：

必须优先保存本地原始数据。

AI 请求失败、断网、超时或 API 不可用时，不能导致记录失败。

AI 处理必须作为独立的后续任务。

---

### 6. Local-first

V1 采用本地优先架构。

无网络情况下必须能够：

* 创建随笔
* 添加图片
* 创建追加
* 写日记
* 浏览 Timeline
* 浏览日历
* 搜索已有数据
* 收藏
* 删除到回收站

---

### 7. 为未来同步预留

即使 V1 不实现账号和云同步，数据模型必须避免阻碍未来多设备同步。

所有主要实体必须使用稳定、全局唯一 ID。

不要依赖数据库自增 ID 作为永久身份。

---

## 工程规则

每次只完成当前任务要求。

不要顺便实现未来功能。

完成任务之后必须运行现有：

* typecheck
* lint
* unit tests
* integration tests（如果存在）
* build

如果某项失败，不得声称任务完成。

---

## 修改范围

在开始开发前：

1. 阅读相关文件。
2. 确认当前任务影响范围。
3. 优先进行最小必要修改。
4. 不进行与当前任务无关的大规模重构。

---

## 数据安全

涉及删除时优先软删除。

V1 删除的数据进入 30 天回收站。

不要实现未经确认的永久删除操作。

---

## 文档同步

如果发生：

* 架构决策
* 数据模型变化
* 重要技术取舍

更新对应文档。

产品需求变化不得由开发 Agent 自行决定。

---

## 任务完成报告

每次完成开发任务后必须说明：

1. 实现了什么。
2. 修改了哪些主要文件。
3. 测试结果。
4. 是否有未解决问题。
5. 是否存在可能影响后续开发的技术债务。

不要只回复“已完成”。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
