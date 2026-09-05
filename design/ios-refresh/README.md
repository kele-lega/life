# Life 全站 UI 升级验收

日期：2026-09-05。基于当前项目直接实现，覆盖 `/`、`/diary`、日记新建 / 阅读 / 编辑、`/timeline`、`/calendar`、`/search`、`/life`。

## 改造前的问题

- 纸色、衬线字和页面间不同的表单边界，使私人记录空间更接近传统内容网站。
- 首页写作区、最近记录和二级入口的层次不够统一；长文与追加需要更明确的阅读分组。
- 日历、搜索、日记与地图使用不同的按钮、圆角、间距和状态反馈。
- 地图的英文切换、紧凑侧栏和窄屏详情削弱了成品感；快速切换时退出浮层会短暂保留可访问内容。

基线证据：[首页](before/home.png)、[生活地图](before/life.png)。其他 before 图片保留作过程记录，部分捕获于进入动画中，不用于严格视觉对比。

## 已实现

| 范围 | 最终表现 |
| --- | --- |
| 全局 | 系统字体、冷中性底色、明暗设计 tokens、统一圆角 / 分隔线 / 输入 / 按钮 / 导航 / 空状态 |
| 首页 | 800px 连续阅读列，整行快速记录入口，按日期成组的完整原文，追加与地点分层，轻量折叠生活入口 |
| 日记 | 列表、阅读和编辑使用同一内容面，舒适的段落行距，保留未保存内容保护 |
| 时间线 | 日期锚点和时间轨迹，按日分组，随笔与日记保持原顺序，追加留在原记录内 |
| 日历 | 桌面月历与日详情并列，移动端自然堆叠；圆形日期、44px 目标、共享分段筛选 |
| 搜索 | 清晰的搜索入口与结果层次，继续显式提交，保留真实命中高亮 |
| 生活地图 | 中文 Lens、柔和顶栏、精简侧栏、触控详情、移动端视角预览；范围失败保留地图并可重试 |
| 交互 | 320ms / 6px 页面进入、120–180ms 交互反馈、分段选中面移动；地图高亮 180ms、原有时间沉积 760ms |
| 无障碍 | 清晰键盘焦点、地图方向键 / Home / End / Escape、退场浮层 inert、系统主题响应、reduced motion / transparency 降级 |

## 设计取舍

- 保留朱红强调色和「写下 → 保存 → 离开」的优先级，以克制的材质和留白形成层次。
- 毛玻璃仅用于地图顶栏和详情浮层。正文使用实色内容面，优先阅读清晰度；这是 Web 实现的 iOS 风格近似。
- 延续现有页面和入口，不加入 Dashboard、社交、任务、评分或额外统计模块。
- 使用现有 CSS Modules、Radix Icons 和 Framer Motion。没有新增生产依赖，没有远程字体或装饰图片请求。
- 本轮不修改 repository 语义、Dexie schema、数据模型、统计 contract 或 AI / proposal 架构。工作区原先已有的数据层改动保持原样。

## 主要文件

- 设计基础：`src/app/design-system.css`、`src/components/ui/motion.ts`、`page-nav.tsx`。
- 共享表达：`src/components/ui/segmented-control.tsx`、`segmented-control.module.css`、`empty-state.tsx`。
- 六个功能目录下的页面 CSS Modules 与呈现组件；地图重点为 `life-visualization.tsx`、`life-map-canvas.tsx`、`life-visualization.module.css`。
- `src/app/icon.svg` 复用现有 Radix 铅笔图标，补齐站点图标。
- 浏览器验收：`e2e/ios-ui.spec.ts`；相关既有测试更新视觉预期并保留业务断言。
- 文档：`DESIGN.md` 第 27 节、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md` ADR-033、`docs/TASKS.md`。

## 截图

[打开可筛选截图图库](index.html)。共 54 张，来自本地生产构建：9 个页面 / 状态 × 1440 / 390 / 430px × 浅色 / 深色。

| 页面 | 桌面浅色 | 390px 浅色 | 430px 深色 |
| --- | --- | --- | --- |
| 首页 | [查看](after/home-1440-light.png) | [查看](after/home-390-light.png) | [查看](after/home-430-dark.png) |
| 快速记录 | [查看](after/home-writing-1440-light.png) | [查看](after/home-writing-390-light.png) | [查看](after/home-writing-430-dark.png) |
| 日记列表 | [查看](after/diary-1440-light.png) | [查看](after/diary-390-light.png) | [查看](after/diary-430-dark.png) |
| 日记阅读 | [查看](after/diary-reading-1440-light.png) | [查看](after/diary-reading-390-light.png) | [查看](after/diary-reading-430-dark.png) |
| 日记编辑 | [查看](after/diary-writing-1440-light.png) | [查看](after/diary-writing-390-light.png) | [查看](after/diary-writing-430-dark.png) |
| 时间线 | [查看](after/timeline-1440-light.png) | [查看](after/timeline-390-light.png) | [查看](after/timeline-430-dark.png) |
| 日历 | [查看](after/calendar-1440-light.png) | [查看](after/calendar-390-light.png) | [查看](after/calendar-430-dark.png) |
| 搜索 | [查看](after/search-1440-light.png) | [查看](after/search-390-light.png) | [查看](after/search-430-dark.png) |
| 生活地图 | [查看](after/life-1440-light.png) | [查看](after/life-390-light.png) | [查看](after/life-430-dark.png) |

截图记录为 Playwright 隔离浏览器中的测试数据，未写入个人浏览器或真实用户数据库。生产版没有新增自动填充示例的行为。

重新截图（先在另一个终端启动生产服务）：

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3180
```

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3180'
$env:LIFE_UI_SCREENSHOTS = 'D:/code/life/design/ios-refresh/after'
npm run test:e2e -- e2e/ios-ui.spec.ts --output=design/ios-refresh/production-results
```

## 验证

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过，零 warning |
| `npm test` | 34 个文件，259 个单元 / 集成测试通过 |
| `npm run test:e2e` | 47 个 Chromium E2E 测试通过 |
| `npm run build` | 通过，13 个路由条目 |
| 生产版截图矩阵 | 2 个测试通过，54 张截图 |
| 最终入口无障碍修正回归 | 2 个首页单元测试、7 个生产版浏览器测试通过（含截图矩阵） |
| `node design/ios-refresh/check-contrast.mjs` | 18 / 18 色彩组合通过，见 [contrast.json](contrast.json) |
| Lighthouse 首页生产版 | 性能 97、无障碍 100、最佳实践 100；LCP 2.6s、TBT 90ms、CLS 0，见 [lighthouse.json](lighthouse.json) |

回归覆盖真实创建 / 保存 / 刷新恢复、追加、日记编辑与草稿保护、搜索、日历、地图切换，以及明暗主题、键盘、触控、reduced motion、320–1440px 布局与文字缩放。截图矩阵针对 390 / 430 / 1440px 验证六个核心页面无横向溢出，并检查地图详情位于视口内。

入口的可访问名称直接来自完整可见文字，`aria-expanded` 表达展开状态；避免人为拼接名称与页面文字不一致。axe 的 `label-content-name-mismatch` 检查在展开 / 收起状态均无违规。地图快速切换的回归曾检出退场详情重复暴露，已通过 `useIsPresent`、`aria-hidden` 和 `inert` 修复后重跑通过。

Lighthouse 初次 CLI 运行在 Windows 清理临时浏览器目录时出现 EPERM。最终改为由 Playwright 管理隔离 Chromium 生命周期、调用同一 Lighthouse 引擎，完整生成报告并正常退出。首页没有控制台错误；性能报告仍提示可减少初始未使用脚本，留作后续性能专项。

## 交付边界与后续技术债务

- 没有已知阻塞问题。原生 iOS Safari、软键盘及 VoiceOver 尚未进行真机验收；Chromium 模拟不能代替设备测试。
- 当前 Canvas 仍在主线程绘制。保留现有数据规模与绘制架构，未用本轮 UI 改造引入 worker；极大地图数据量的性能属于后续专项。
- 全量 Lighthouse 仅测首页和本地实验环境，自动化分数不等于全站无障碍认证。截图与测试结果是本地验收证据，没有执行线上发布。
