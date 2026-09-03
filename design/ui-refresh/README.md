# UI 品质改造验收记录

日期：2026-09-03。范围：已确认审计中的 UI-1 至 UI-5，以及生产部署。

[打开截图对比](review.html)。可切换 320、390、430、768、1440px，浅色/深色，以及首页、写作、时间线、日记、日历、搜索。右侧最终截图来自本机生产构建，不代表已上线。

## 设计落实

暖白纸面、深灰黑夜间层次、中文衬线阅读与无衬线操作文字；暗红用于主要动作和选中日期。布局通过行宽、留白、日期和细分隔组织内容。所有页面共用颜色、间距、圆角、状态和动效 tokens。

首页保持日期、写点什么、最近记录、更多入口。输入通过实测高度的 spring 展开，正文随内容生长，真实保存成功后显示短反馈并归还焦点。Timeline 用日期作为锚点，追加保留独立时间；Diary 采用宽松阅读和写作区域；Calendar 保留月份与当日内容；Search 保持显式关键词搜索，显示匹配位置和原文高亮。

## 阶段记录

| 阶段 | 修改前 | 实施范围与截图 | 验证 |
| --- | --- | --- | --- |
| UI-1 | `before/` | tokens、Home、保存反馈、输入展开与回焦；`after/` | typecheck、lint、152 个单元/集成测试、25 个 E2E、build；另有 5 个生产首页测试 |
| UI-2 | `before-ui-2/` | 日期侧栏、阅读组件、自然图片和追加层级；`after-ui-2/` | typecheck、lint、152 个单元/集成测试、25 个 E2E、build |
| UI-3 | `before-ui-3/` | 日记列表、阅读、长文写作、离开草稿确认；`after-ui-3/` | 新增草稿返回测试；主题检查发现输入背景问题，明确背景后在后续完整回归通过 |
| UI-4 | `before-ui-4/` | 月份和日期内容、44px 日期、搜索层级与高亮；`after-ui-4/` | 高亮测试覆盖 Unicode；更新日历选中态与空状态断言，26 个 E2E 通过 |
| UI-5 | `before-ui-5/` | 清理旧全局样式，统一页面/按钮/图片动效，所有目标宽度；`after-ui-5/` | 修正日记取消按钮不足 44px；最终 154 个单元/集成测试、28 个 E2E 通过 |

`production/` 包含最终生产构建的 70 张页面/状态截图。各阶段使用同一组示例文字；日期固定为上海时区的 2026-09-03。示例内容只写入自动化启动的临时浏览器上下文，不读取或修改日常浏览器的私人记录。

## 主要文件

- `src/app/design-system.css`：共享 tokens、按钮、导航、焦点和动效。
- `src/components/ui/`：展开容器、自适应 textarea、图片状态、导航、匹配高亮。
- `src/features/moment/components/`：首页、快速记录、最近记录、追加。
- `src/features/timeline/components/`：日期时间轴和共享记录阅读。
- `src/features/diary/components/`：列表、详情和写作。
- `src/features/calendar/components/`、`src/features/search/components/`：日历和搜索。
- `e2e/ui-quality.spec.ts`：目标宽度、明暗主题、点击区域、键盘和 200% 字体回流。
- `netlify.toml`、根 README：当前部署配置与说明；Vercel 配置保留为备用。

未修改 Dexie schema、repository API、实体结构、Timeline/Calendar/Search 查询模块，未提供编辑 Moment 原文的入口。

## 验证与复现

最终质量检查：`npm run typecheck`、`npm run lint`、`npm test`（22 个文件、154 个测试）、`npm run test:e2e`（28 个 Chromium 测试）、`npm run build` 均已通过。

生产复测首次为 27/28：定位用例的权限 origin 写死为开发端口，导致生产端口没有定位授权。改为读取 Playwright 的 baseURL 后，保留原有断言和应用代码，生产构建的 28/28 项 E2E 全部通过（1.4 分钟）。正式站点状态见 [部署记录](../../docs/DEPLOYMENT.md)。

截图复现（先启动 3101 端口的生产构建）：

```powershell
$env:LIFE_BASE_URL = 'http://127.0.0.1:3101'
node design/ui-refresh/capture.mjs production
node design/ui-refresh/capture.mjs production timeline
node design/ui-refresh/capture.mjs production diary
node design/ui-refresh/capture.mjs production diary/new
node design/ui-refresh/capture.mjs production calendar
node design/ui-refresh/capture.mjs production search
Remove-Item Env:LIFE_BASE_URL
```

完整生产浏览器测试：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3101'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_BASE_URL
```

已检查：无横向溢出、交互区域至少 44px、焦点可见、写作焦点恢复、状态可访问名称、关闭动态效果、200% 字体回流；验证 textarea 原生自动高度及强制 fallback 两条路径。真实 iOS 软键盘、Safari、VoiceOver 尚未实机验收，不能用 Chromium 结果替代。

## 部署与遗留边界

正式发布状态以 [部署记录](../../docs/DEPLOYMENT.md) 为准。

数据只保存在当前浏览器和当前域名，没有云同步或域名迁移。项目尚未实现 Service Worker，已加载页面可以进行本地离线操作，但不能保证完全关闭后断网重开。这些是现有产品边界，本轮没有扩展数据功能。
