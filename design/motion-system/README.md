# 统一动效系统验收

日期：2026-09-03。依据用户提供的动效实施请求完成，范围为表现层。已有版式、文案、配色、字体和数据接口保持原样；保存成功的可访问标签按要求更新为「已保存」。

[打开截图对比与交互录像](review.html)。`before/` 为修改前 20 张截图，`after/` 为相同日期、示例和尺寸的 20 张截图；`matrix/` 保留 72 张真实浏览器检查截图。`production/` 包含本地生产构建的两套 390×844 交互录像与最终画面。所有样本都来自独立测试浏览器，没有访问用户的日常浏览器数据。

## 修改与实现

| 范围 | 主要文件 | 实现 |
| --- | --- | --- |
| 参数与 SSR | `src/components/ui/motion.ts`、`src/app/layout.tsx`、`src/app/motion.css` | 曲线 .22/1/.36/1；160/220/420/580ms；服务端输出相同 CSS 变量 |
| 页面边界 | `src/components/ui/page-entrance.tsx`、首页及 Timeline/Calendar/Diary/Search 的 `page.tsx` | 小型客户端边界；根 layout 保持服务端；无 pathname key、无路由退出等待 |
| 首页层级 | `home-page.tsx`、`home-page.module.css` | 四个局部区域 8px、420ms，间隔 80ms；仅首次挂载进入；邀请文字上移 2px、细线延展 |
| 编辑器 | `reveal.tsx`、`writing-textarea.tsx`、`quick-moment-record.tsx`、`moment-appends.tsx` | 6px 淡入、实测高度与无回弹 spring；快速反向开关；焦点返回；内容自然增长 |
| 保存状态 | `stateful-button.tsx`、`design-system.css` | 一个共享组件；最长标签占位；内部 4px 交叉淡入；spinner、短描边、1100ms 成功反馈；异常可重试 |
| 列表连续性 | `motion-entry.tsx`、`recent-moments.tsx`、`moment-appends.tsx` | 稳定 ID、position-only layout；首次错峰最多累计到第六项；后续仅新增项进入 |
| 图片 | `record-image.tsx`、`motion.css`、`recent-moments.tsx` | 淡入与最多 1.02 hover；复用未变化的 Blob URL/DOM；过期响应丢弃与资源释放；无灯箱 |
| 导航 | `nav-link.tsx`、`page-nav.tsx`、各页现有导航 | 220ms 细线、focus-visible、aria-current；链接不缩放；保留原路由关系 |
| 文档与工程 | `DESIGN.md`、`docs/DECISIONS.md`、`docs/TASKS.md`、`README.md`、`eslint.config.mjs` | 同步动效规范；仅把 Netlify 生成目录加入 lint 忽略 |

表中的组件简写位于 `src/components/ui/` 或原有 `src/features/*/components/`，没有迁移业务模块。

## 连续性与性能处理

- 用户的本地写入不等待动画。写入成功立即刷新列表，成功反馈结束才关闭编辑器；反馈期间保留文字和预览，避免内容先清空再收起。
- CSS 与 Framer Motion 主要改变 transform/opacity。只有编辑器局部高度需要布局；ResizeObserver 观察内层实际尺寸，不逐帧读取 DOM 或用 React state 推动画面。不混用 `height: auto` 的异步测量与数值目标，避免窄屏出现过量留白。
- 页面进入使用 backwards fill，完成后释放 transform；没有永久 will-change、大面积 blur、文字缩放或新增动画依赖。
- 已有记录和图片保持 DOM/URL 身份，刷新失败仍可读；旧查询不能覆盖新视图或分配泄漏的 URL。替换后释放旧 URL，卸载清理缓存、observer 和 timer。
- 保存组件以同步忙碌标记阻止重复操作，操作序号和卸载标记约束延迟回调。不会让先前保存的计时器重置下一次保存。
- reduced motion 取消位移、错峰、旋转和过渡等待；状态标签、焦点、保存与错误恢复完全保留。CSS 精确作用于本轮组件，不覆盖第三方全局动画。

## 测试

新增 5 项单元行为测试：最近记录刷新时的 DOM/URL/追加草稿保留、过期附件响应丢弃、失败重试时保留最近视图、连续保存计时器隔离、当前导航语义更新。既有测试更新了成功标签和反馈期间保留内容的断言；URL 释放在提交后的 effect 中验证。

新增 `e2e/motion.spec.ts` 的 10 项浏览器测试：

- 首页四层动画只进入一次；实际保存时逐帧检查旧记录 opacity 始终为 1、DOM 未断开。
- 新增记录的顺序、图片 URL/DOM 保留、未保存追加不丢失；图片 hover 不改变布局尺寸。
- 每次间隔 65ms 的连续开关；主编辑器、追加编辑器均无重复残留，并保持输入和焦点。
- 中断一次真实 IndexedDB 事务验证失败保留；用有时限的并发事务验证真正 pending 的按钮状态、重复保护、固定宽度和成功重试。
- 空列表、单条、20 条以上列表的入场和新增；延迟不随完整列表增长。
- 同一路由内输入与 DOM 保留、浏览器前后导航、直接访问、单一可见页面与键盘导航。
- 1440×900、768×1024、430×932、390×844、320×700，light/dark × normal/reduced motion；无横向溢出、44px 点击目标、编辑器内容高度吻合、保存控件不重叠。

实际质量结果：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run lint` | 通过；源码规则未放宽 |
| `npm test` | 23 个文件、159 项通过 |
| `npm run test:e2e` | 38 项通过，开发环境约 3.7 分钟 |
| `npm run build` | 通过，Next.js 16.3.3 生产构建；9 个静态生成任务完成 |
| 生产构建关键复测 | 动效与三类保存按钮共 12 项通过；9 项首轮通过，3 项调整提示分类后重跑通过（19.5s） |
| Netlify 发布 | 构建、适配、上传成功；平台状态 ready，2026-09-03 08:55:32 UTC 发布 |

生产复核使用 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101`。首次有 3 项因 Chrome 对 Next Link 的目标页面 CSS 预加载提示而失败，功能断言通过。已核对这些资源属于 Diary、Timeline、Calendar、Search 的预取样式，并在测试中精确记录为提示；资源加载错误、脚本异常、hydration、React key 和状态更新警告仍导致失败。开发环境同样精确排除 Motion 在 reduced motion 下主动输出的说明，不把它当成应用错误。

最新部署：[Life](https://life-kelelega.netlify.app)，[平台详情](https://app.netlify.com/projects/life-kelelega/deploys/6a9935dc08d1754a8e879de8)。原有账户登录保护生效，未登录请求返回 401；不宣称已通过线上功能验收。

## 复现

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3101
```

另一终端：

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:3101'
npm run test:e2e -- e2e/motion.spec.ts e2e/stateful-button.spec.ts
Remove-Item Env:PLAYWRIGHT_BASE_URL
npx playwright install ffmpeg
node design/motion-system/capture-video.mjs
```

静态前后对比沿用 `design/ui-refresh/capture.mjs` 的相同样本。最新精确尺寸矩阵来自 `e2e/motion.spec.ts`；录像用本地生产构建，没有 Next.js 开发指示器。

## 已知边界与技术债务

- 真实 iPhone/iPad、Safari 软键盘、VoiceOver 和真实设备 60fps 尚未实测。Chromium 的视口、键盘、逐帧连续性和 field-sizing fallback 验证不等同于原生设备认证。
- 既有 `listRecentMoments(20)` 遍历实现没有实际中止超过上限的结果，21 条样本会显示 21 条。本轮只限制动画延迟，没有修改 repository 或通过 UI 偷改查询结果；以后需在独立数据层任务中修正并补足超过上限的测试。
- 既有 Search 关键词只在页面组件内保存；离开路由再返回不恢复搜索。新增边界没有 pathname key，也没有增设框架缓存或搜索持久化。动画与同页更新不会丢失草稿。
- CSS 目标页面预加载提示仍可能出现在 Chrome 控制台；不是零告警承诺，具体来源和测试处理见上文。
- Netlify 已有登录保护仍然生效，线上功能验收以 [部署状态](../../docs/DEPLOYMENT.md) 为准。本地测试和录像不是公开线上验收证明。

Dexie schema、实体、repository API、Timeline/Calendar/Search 查询文件以及 Moment 原文不可编辑规则均未修改。
