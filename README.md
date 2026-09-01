# Life

一个以“打开、记录、保存、离开”为核心的私人生活记录系统。本仓库当前只包含工程基础，不包含产品功能。

## 技术栈

- Next.js App Router + React + TypeScript
- IndexedDB + Dexie（local-first 数据层）
- ESLint
- Vitest + Testing Library + fake-indexeddb

## 环境要求

- Node.js 24.15 或更高版本
- npm 11 或更高版本

## 本地开发

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

打开 <http://localhost:3000>。

## 质量检查

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

## 目录

```text
src/
  app/            Next.js 路由与全局样式
  components/     跨功能共享的 React 组件
  features/       按产品功能组织的 UI 与用例
  lib/            基础设施适配器
    db/           Dexie 数据库、schema 与迁移
  test/           测试环境配置与测试工具
  types/          跨模块共享类型
docs/             产品、架构、数据模型、任务与决策文档
```

功能代码应优先放在对应的 `features/<feature>` 内；只有确实跨功能复用的代码才提升到 `components`、`lib` 或 `types`。

## 环境变量

以 `.env.example` 为模板。AI 服务暂未实现，示例变量仅记录未来服务端接入所需的配置边界；任何私钥都不得使用 `NEXT_PUBLIC_` 前缀。

## 项目文档

- [产品定义](docs/PRODUCT.md)
- [工程架构](docs/ARCHITECTURE.md)
- [数据模型](docs/DATA_MODEL.md)
- [V1 任务拆分](docs/TASKS.md)
- [架构决策](docs/DECISIONS.md)
