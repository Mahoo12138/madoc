# madoc

**madoc** 是一个面向个人、小团队和家庭的轻量级、开源、自部署协同 Markdown 工作区。

项目仍处于 MVP 阶段，但 MVP 的实现路线不再以“将 AFFiNE 0.26.x 整体移植到 Go + SQLite”为目标。AFFiNE 仅作为产品体验和协同架构参考，不再作为前端代码基座、API 兼容目标或数据模型规范。

当前 MVP 只聚焦两类内容：

- **Markdown Document**：接近 Typora 的所见即所得 Markdown 编辑体验，并支持多人实时协作。
- **Whiteboard**：基于 Excalidraw 的在线白板，并支持多人实时协作。

## 产品目标

madoc 希望提供一种比 AFFiNE、Notion 类产品更克制的自部署体验：

- 单机即可运行；
- 默认 SQLite；
- 不依赖 PostgreSQL、Redis、S3；
- Go 后端；
- React + TypeScript 前端；
- 尽量保持单二进制分发；
- 数据完全由部署者掌控；
- 优先服务 5–10 人的小型协作场景；
- 不追求“全能工作空间”。

核心产品体验应当是：

```text
Workspace
├── README.md
├── API Design.md
├── Project Notes.md
├── Architecture.board
└── Brainstorm.board
```

打开 Markdown 文档时进入干净的 Typora-like 编辑器；打开白板时进入 Excalidraw。侧边栏统一提供工作区、目录树、成员和基础设置。

## 技术栈

| 层 | 方案 |
|---|---|
| Backend | Go |
| HTTP Router | chi |
| Database | SQLite + WAL |
| Frontend | React 18+ + TypeScript |
| Router | TanStack Router |
| Server State | TanStack Query |
| UI Components | Mantine |
| Styling | Vanilla Extract |
| Markdown Editor | Milkdown / Crepe |
| Markdown Collaboration | Yjs + `@milkdown/plugin-collab` + madoc provider |
| Whiteboard | `@excalidraw/excalidraw` |
| Whiteboard Collaboration | madoc Excalidraw collaboration adapter |
| Realtime Transport | Native WebSocket |
| WebSocket Library | `github.com/coder/websocket` |
| Asset Storage | Local filesystem + SQLite metadata |
| Frontend Packaging | `go:embed` |

依赖版本不在设计文档中永久写死。编码时选择当前稳定版本，并由 `go.mod`、`package.json`、`pnpm-lock.yaml` 固定。

## 架构原则

1. **不兼容 AFFiNE API。** 不保留 GraphQL、`space:*`、`realtime:*`、License、Quota 等 AFFiNE compatibility stub。
2. **产品层统一，协同协议不强求统一。** Markdown 使用 Yjs；Whiteboard 使用适合 Excalidraw 的 element-level reconciliation。
3. **Go 后端保持内容尽量“盲”。** Markdown Yjs update 由浏览器产生和合并，Go 负责权限、sequence、relay、persistence。
4. **Markdown 是可移植格式，但实时协作的 canonical state 是 Yjs。** 服务端同时维护可导出的 Markdown cache。
5. **不要为了技术统一造新的 BlockSuite。** 编辑器与白板是两个独立内容引擎，共享 Workspace、权限、资产、实时连接和应用 Shell。
6. **Mantine 与 Vanilla Extract 分工明确。** Mantine 负责成熟的通用 UI primitive 与交互组件；Vanilla Extract 负责 madoc 自己的产品级布局、视觉语言和复杂页面样式。不要重复实现 Mantine 已经成熟提供的基础组件，也不要维护第二套平行 Design Token。
7. **先做小而完整的 MVP，再扩展。**

## MVP

当前 MVP 的发布边界只要求：

- 首次初始化管理员；
- Email + Password 登录；
- Workspace 创建与成员管理；
- Markdown / Whiteboard 两种 Item；
- 树形目录；
- Milkdown Crepe Markdown 编辑；
- Markdown 多人实时同步、远程光标和在线状态；
- 图片上传；
- Markdown `.md` 导入/导出；
- Excalidraw 白板；
- Whiteboard 多人实时协作；
- 自动保存；
- Docker 和单二进制部署；
- 基础备份说明。

暂不进入 MVP：

- Database / Kanban；
- Calendar；
- AI；
- 评论；
- 知识图谱；
- Notion-style database；
- OAuth；
- 第三方云存储；
- WebDAV；
- Git 双向同步；
- 完整历史版本 UI；
- 公开发布站点；
- 插件系统。

## 文档导航

- [PRODUCT.md](./PRODUCT.md)：产品定位与功能边界
- [PLAN.md](./PLAN.md)：MVP 实施计划
- [STATUS.md](./STATUS.md)：当前迁移状态
- [BUILD.md](./BUILD.md)：开发、构建与部署
- [AGENTS.md](./AGENTS.md)：仓库实现约束
- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)：总体架构
- [docs/EDITOR.md](./docs/EDITOR.md)：Markdown 编辑器设计
- [docs/WHITEBOARD.md](./docs/WHITEBOARD.md)：白板设计
- [docs/COLLABORATION.md](./docs/COLLABORATION.md)：实时协同协议
- [docs/DATA_MODEL.md](./docs/DATA_MODEL.md)：SQLite 数据模型
- [docs/API.md](./docs/API.md)：REST / WebSocket API
- [docs/MIGRATION.md](./docs/MIGRATION.md)：从旧 AFFiNE-compatible 代码迁移
- [docs/REFERENCES.md](./docs/REFERENCES.md)：上游项目与官方资料

## 不变的长期目标

madoc 的竞争力不在“比 AFFiNE 功能更多”，而在：

> **Markdown-first、协作、轻量、自部署、可理解、可维护。**
