# madoc MVP 重构实施计划

## 0. 总原则

本计划是一次架构重置，不再继续补全旧的 AFFiNE-compatible 原型路线。

执行顺序必须是：

1. 建立安全迁移边界；
2. 删除旧兼容层；
3. 建立新的简化数据模型和 REST API；
4. 重建前端 Shell；
5. 接入 Markdown；
6. 接入 Markdown collaboration；
7. 接入 Whiteboard；
8. 接入 Whiteboard collaboration；
9. 完成部署与稳定性验证。

不要在迁移期间继续修复 AFFiNE compatibility。

---

## Phase 0 — 安全基线

目标：任何结构性删除之前都能回退。

任务：

- 创建迁移前 Git tag / branch；
- 备份当前 SQLite；
- 保证 `go test ./...`、`go vet ./...`、前端 build 在旧基线上通过；
- 将 MVP 文档提交到仓库；
- 加入 legacy schema detection；
- 不自动 DROP 旧表。

验收：

- 当前代码可复现构建；
- 数据文件有明确备份方式；
- MVP 迁移失败时可以回到旧 commit。

---

## Phase 1 — 删除 AFFiNE compatibility

删除：

- `internal/graphql/`
- `/graphql`
- 所有 AFFiNE query / mutation compatibility；
- `serverConfig` compatibility；
- `realtime:request` compatibility；
- `realtime:subscribe` compatibility；
- License / Git / Calendar / Notification / Quota stub；
- AFFiNE doc public endpoint compatibility；
- `@madoc/doc` 旧 AFFiNE doc model；
- `@madoc/editor` / BlockSuite 旧实现；
- `@blocksuite/*` 依赖；
- `github.com/zishang520/socket.io/v2`；
- `x-affine-*` 命名。

保留并整理：

- Go 应用启动；
- chi；
- SQLite 连接；
- Auth 基础代码；
- 初次 setup 流程的产品概念；
- Workspace/User 的可复用 CRUD；
- `go:embed`；
- Vite / React / TanStack Router / TanStack Query / Vanilla Extract。

验收：

- `go.mod` 不再包含 Socket.IO；
- 前端不再包含 BlockSuite；
- 全仓库搜索 `AFFiNE`、`affine`、`blocksuite`，除迁移文档和参考文档外不应存在运行时代码依赖。

---

## Phase 2 — 新的 MVP 数据模型与 REST API

按 `docs/DATA_MODEL.md` 建立新 schema。

新增服务模块建议：

```text
internal/
├── api/
├── asset/
├── auth/
├── db/
├── item/
├── realtime/
│   ├── hub.go
│   ├── protocol.go
│   ├── markdown.go
│   └── whiteboard.go
├── user/
└── workspace/
```

REST API 按 `docs/API.md` 建立。

不要引入 ORM。

验收：

- Workspace CRUD；
- Member CRUD；
- Item tree CRUD；
- Asset upload/download；
- 权限测试；
- 所有 handler 不依赖 GraphQL。

---

## Phase 3 — 前端 Shell 重建

保留现有：

- React；
- Vite；
- TanStack Router；
- TanStack Query；
- Mantine；
- Vanilla Extract。

重建：

- Setup；
- Sign-in；
- Workspace list；
- Workspace shell；
- Item tree；
- Member dialog；
- Item create / rename / move / delete。

要求：

- 不从 AFFiNE UI 搬运大块组件树；
- Route component 不允许继续增长为 4–7 万字节的大文件；
- 页面只负责 composition；
- API、业务状态、UI component 分层；
- 通用交互组件优先使用 Mantine；
- 产品级布局和定制视觉使用 Vanilla Extract；
- 不建立与 Mantine Theme 平行的第二套 Design Token。

推荐：

```text
web/src/
├── api/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── workspace/
│   ├── items/
│   ├── markdown/
│   ├── whiteboard/
│   └── members/
├── routes/
├── styles/
└── utils/
```

验收：

- 无编辑器时也能完成 Workspace + Item tree 基础流程；
- route 文件保持薄层。

---

## Phase 4 — Markdown 编辑器

接入 `@milkdown/crepe`。

先做单人：

- load Markdown；
- edit；
- save Markdown cache；
- image upload；
- `.md` import/export；
- keyboard；
- table；
- code；
- LaTeX；
- link；
- list。

不要先做 collaboration。

验收：

- Markdown round-trip 测试覆盖常用语法；
- 关闭页面再打开内容一致；
- 图片走 madoc Asset API。

---

## Phase 5 — Markdown collaboration

实现 `MadocYProvider`：

- 一个 `Y.Doc` 对应一个 Markdown Item；
- WebSocket join；
- initial snapshot + updates；
- live update broadcast；
- awareness；
- reconnect；
- snapshot compaction；
- Markdown cache debounce。

服务端不需要解析 Yjs update。

验收场景：

1. 两窗口同时输入；
2. 同一段同时修改；
3. A 离线后 B 编辑，A 重连；
4. 服务重启；
5. 1000+ updates 后 compaction；
6. compaction 期间仍有并发 update；
7. viewer 无法发送 update；
8. update 不跨 Workspace 泄漏。

---

## Phase 6 — Whiteboard

接入 `@excalidraw/excalidraw`。

先做单人：

- scene persistence；
- image asset；
- export；
- item switching；
- full-screen canvas。

Excalidraw 字体必须自托管，不能让默认部署依赖外部 CDN。

---

## Phase 7 — Whiteboard collaboration

实现 madoc adapter：

- room join / leave；
- peer presence；
- pointer presence；
- scene update relay；
- element-level reconciliation；
- periodic persisted scene；
- reconnect；
- server restart recovery。

优先复用 / 改写 Excalidraw 官方应用中已经验证过的 reconciliation 思路，并遵守 MIT attribution 要求；不要重新发明白板 CRDT。

验收：

- 两人新增不同图形都保留；
- 同一元素并发修改不会无限抖动；
- 删除同步；
- 图片同步；
- 刷新和服务重启恢复。

---

## Phase 8 — 部署收尾

- `go:embed` frontend；
- Docker；
- 数据目录；
- backup / restore 文档；
- health endpoint；
- graceful shutdown；
- WebSocket shutdown；
- SQLite WAL checkpoint 策略；
- 文件上传限制；
- 安全 header；
- CSRF / Origin 验证；
- release build。

---

## Phase 9 — MVP Release Gate

必须全部通过：

- 首次启动；
- 创建管理员；
- 登录；
- 创建 Workspace；
- 邀请 / 添加成员；
- Markdown 单人编辑；
- Markdown 双人协作；
- Whiteboard 单人编辑；
- Whiteboard 双人协作；
- 图片；
- 重启恢复；
- Docker 数据卷恢复；
- `.md` 导出；
- 白板 JSON / PNG / SVG 导出；
- 权限测试；
- 备份恢复测试。

完成后再讨论搜索、历史版本、公开分享、WebDAV、Git 等功能。
