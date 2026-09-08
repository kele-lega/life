# Life 体验层重构 · 2026-09-06

本轮直接重构现有呈现层，覆盖首页、日记列表/编辑/阅读、时间线、日历、搜索和生活地图。所有原有记录、保存、查询、追加、图片与数据行为保留。

[打开截图图库](index.html) · [设计规范第 28 节](../../DESIGN.md) · [ADR-034](../../docs/DECISIONS.md)

## 审阅发现与设计取舍

原界面的圆角卡片、内嵌浅底区域和页面留白层层叠加，手机正文被挤窄；折叠导航需要回到首页再展开，页面之间缺少稳定的连续感。长文保存操作远离当前输入位置，地图拥有另一套品牌栏与浮层语言。

本轮以比例、排版和连续阅读建立层级：

- 统一暖中性页面、系统字体和陶红强调色。去掉重复卡片、毛玻璃顶栏和装饰性阴影，保留浮层与分段选择真正需要的层次。
- 桌面使用 208px 边缘呼出侧栏，手机使用四个底部入口；日历和搜索由既有上下文入口访问。没有新增目的地或设置。
- 首页保留写作优先；展开时让出日期与全局导航占用的空间，原有保存/取消移至顶部。追加、日记草稿继续使用原来的确认与保存逻辑。
- Diary 成为宽度受控的长文空间；Timeline 由日期锚点和细线组织；Calendar 保留月份与日详情；Search 整合输入与提交，保留显式搜索和准确高亮。
- 地图保留地形、沉积、Lens 和统计，控制与预览降噪。桌面详情采用实色浮层，手机详情随文档在地形下方展开，关闭与 Escape 返回区域焦点。
- 390/430px 正文使用 22px 页边，320px 使用 16px；处理安全区域、底部内容留白、44px 点击目标、键盘焦点及 reduced motion。静态加载占位保留辅助技术状态，不加闪烁动画。

## 第二轮实际修正

第一轮实现后，使用隔离浏览器记录检查六个核心页面、两种主题和桌面/手机尺寸，再修正以下问题：

1. AppShell 的 CSS Modules 选择器没有匹配原有编辑器类，写作时导航未隐藏；改为显式全局选择器，补充草稿出口检查。
2. 手机端不应预留桌面滚动条槽；修正后恢复完整阅读宽度，并统一小屏日历和地图边距。
3. 辅助文字在浅色分段背景上的对比度为 4.40:1；轻微加深后为 4.69:1，全部 22 组颜色检查通过。
4. 收起日期使用 `display:none` 会在保存后重播首页入场动画；改为保持节点与动画时间线的高度/可见性收起。
5. 截图等待真实查询结果后再拍摄，避免把加载占位误当成最终时间线。手机采用视口截图，避免完整页面截图将固定底栏拼在正文中间。

测试中的旧导航、圆角、焦点外观断言已同步更新；保存反馈期间区分待保存内容与已写入文章，继续验证原文、Blob、追加和刷新后的真实持久化。

## 主要文件

| 文件 | 职责 |
| --- | --- |
| `src/app/design-system.css`、`motion.css` | 全局 tokens、焦点、状态、页面尺寸与动效 |
| `src/components/ui/app-shell.*`、`src/app/layout.tsx` | 应用导航、写作状态下的导航收起、安全区域 |
| `src/components/ui/reading-placeholder.tsx`、`segmented-control.module.css` | 统一读取占位和分段选择 |
| `src/features/moment/components/` | 首页连续阅读、编辑工具栏、图片与追加层次；移除旧 Portal |
| `src/features/diary/components/` | 日记列表、沉浸编辑、正文阅读 |
| `src/features/timeline/components/` | 日期锚点及跨页面复用的记录呈现 |
| `src/features/calendar/components/`、`search/components/` | 月历布局、整合搜索与结果层次 |
| `src/features/life-visualization/components/` | 地图工具区、预览、详情与焦点 |
| `e2e/experience-refresh.spec.ts`、既有 UI 测试 | 新导航、遮挡、草稿、真实写入与尺寸回归 |

没有修改 Repository、Schema、模型、query、统计口径或 AI/proposal/extraction 架构；没有新增依赖。

## 关键截图

`after/` 中为整体重构时的本地生产构建 60 张截图：10 个页面/状态 × 390、430、1440px × 浅色/深色。桌面侧栏的后续更新见下方 `sidebar/`，手机保持原样。`before/` 为改造前基线，`review/` 为第一轮审阅记录。所有文字与事件来自一次性 Playwright 浏览器上下文，未写入个人浏览器。

| 页面 | 手机浅色 | 手机深色 | 桌面 |
| --- | --- | --- | --- |
| 首页 | [390px](after/home-390-light.png) | [430px](after/home-430-dark.png) | [1440px](after/home-1440-light.png) |
| 日记 | [阅读](after/diary-reading-390-light.png) | [编辑](after/diary-writing-430-dark.png) | [列表](after/diary-1440-light.png) |
| 时间线 | [390px](after/timeline-390-light.png) | [430px](after/timeline-430-dark.png) | [1440px](after/timeline-1440-light.png) |
| 日历 | [390px](after/calendar-390-light.png) | [430px](after/calendar-430-dark.png) | [1440px](after/calendar-1440-light.png) |
| 搜索 | [390px](after/search-390-light.png) | [430px](after/search-430-dark.png) | [1440px](after/search-1440-light.png) |
| 生活地图 | [390px](after/life-390-light.png) | [430px](after/life-430-dark.png) | [1440px](after/life-1440-light.png) |
| 地图详情 | [390px](after/life-detail-390-light.png) | [430px](after/life-detail-430-dark.png) | [1440px](after/life-detail-1440-light.png) |

## 桌面侧栏后续更新 · 2026-09-06

按用户反馈，桌面导航默认收起，靠近左侧 44px 区域时，以 460ms 轻弹性位移和透明度过渡展开。离开后保留 180ms 缓冲，再用 280ms 收起；快速返回取消关闭。浮层覆盖页面，不推动正文，不用背景遮罩或毛玻璃。顶部、底部和最左侧留白也保持指针命中，避免边缘反复开关。

键盘可以通过「显示主导航」打开，Escape 关闭并返回焦点；关闭面板使用 inert，减少动态效果偏好关闭位移动画。写作时继续隐藏导航，保留草稿确认。1100px 以下的手机导航、布局和触摸行为保持原样。

主要改动在 `src/components/ui/app-shell.tsx` 与对应 CSS Modules；新增 `e2e/desktop-sidebar.spec.ts` 四项交互回归，适配既有导航测试。没有数据层改动或新增依赖。

| 生产效果 | 浅色 | 深色 |
| --- | --- | --- |
| 默认收起 | [截图](sidebar/closed-light.png) | [截图](sidebar/closed-dark.png) |
| 靠近展开 | [截图](sidebar/open-light.png) | [截图](sidebar/open-dark.png) |
| 完整开关动画 | [录屏](sidebar/motion-light.webm) | [录屏](sidebar/motion-dark.webm) |

最新验证见 [侧栏验证记录](sidebar/validation.json)。可在 3180 生产服务启动后运行 `node design/experience-refresh/capture-sidebar.mjs` 重新录制；记录来自隔离浏览器中通过真实保存流程创建的样例。

## 整体重构验证（侧栏后续更新前）

本阶段结果见 [validation.json](validation.json)。布局与交互检查包含 320/390/430/768/1440px、200% 字号、两主题、正常/减少动态效果、键盘与触控、长文、错误重试、保存状态、图片刷新、草稿确认和地图切换。

完整 E2E 使用项目默认开发服务。既有的两项地图测试依赖仅在开发环境提供的 Demo Data，因此在完整开发套件验证；额外的生产套件复验另外 49 项真实记录与交互测试。没有为了生产测试开启示例数据或修改数据行为。

重新生成生产截图：

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3180
```

在另一终端执行：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3180'
$env:LIFE_UI_SCREENSHOTS = 'D:/code/life/design/experience-refresh/after'
npm run test:e2e -- e2e/ios-ui.spec.ts --output=.scratch/experience-screenshots
node design/experience-refresh/check-contrast.mjs
```

## 边界与后续技术债务

本轮没有新增数据迁移或架构债务。Canvas 仍在主线程绘制，极大事件量的性能延续既有边界。真实 iPhone 的 Safari、软键盘与 VoiceOver 尚未进行设备验收；Chromium 模拟不能替代真机。此次交付为本地实现与生产构建验收，没有执行线上发布。
