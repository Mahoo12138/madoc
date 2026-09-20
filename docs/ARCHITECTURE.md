# Architecture

## 1. MVP 架构

```text
                    Browser
                       │
          ┌────────────┴────────────┐
          │                         │
     REST / HTTP               WebSocket
          │                         │
          ▼                         ▼
   ┌──────────────┐          ┌──────────────┐
   │   Go API     │          │ Realtime Hub │
   └──────┬───────┘          └──────┬───────┘
          │                         │
     ┌────┴────┐             ┌──────┴─────────┐
     │ SQLite  │             │                │
     │         │        Markdown Room   Whiteboard Room
     └────┬────┘             │                │
          │                 Yjs          Excalidraw
     Asset metadata
          │
          ▼
     Local Filesystem
```

前端：

```text
React Application Shell
├── Workspace
├── Item Tree
├── Markdown
│   ├── Milkdown / Crepe
│   ├── Y.Doc
│   └── MadocYProvider
└── Whiteboard
    ├── Excalidraw
    └── MadocBoardProvider
```

## 2. 为什么彻底移除 AFFiNE compatibility

旧架构的复杂度主要来自“让 AFFiNE frontend 认为 madoc 是 AFFiNE server”：

```text
AFFiNE Web
    ↓
AFFiNE GraphQL contract
    ↓
AFFiNE realtime contract
    ↓
AFFiNE data model assumptions
    ↓
Go compatibility layer
```

即使删除 AI / Payment，协议耦合仍然存在。

MVP 改为：

```text
Madoc UI
   ↓
Madoc REST + Realtime
   ↓
Madoc domain model
```

API 只为 madoc 服务。

## 3. Backend Boundary

Go backend 负责：

- identity；
- authentication；
- authorization；
- workspace；
- tree metadata；
- asset metadata / files；
- realtime connection；
- room isolation；
- persistence；
- backup-friendly storage；
- application static files。

Go backend 不负责：

- 渲染 Markdown；
- 解析 ProseMirror；
- server-side rich text AST；
- 将 Excalidraw 转换成另一个 block model；
- AI；
- SaaS compatibility。

## 4. Frontend Boundary

Frontend 负责：

- Markdown editor state；
- Markdown ⇄ Milkdown document；
- Yjs document；
- 生成 Yjs full snapshot；
- 生成 Markdown cache；
- Excalidraw scene；
- 白板元素 reconciliation；
- awareness / cursor presentation。

这不是“把业务逻辑都放前端”，而是把编辑器特有的数据结构留在最理解它们的运行时。

## 5. REST 与 Realtime 分离

REST 适合：

- CRUD；
- list；
- metadata；
- upload；
- export；
- membership；
- settings。

WebSocket 适合：

- document update；
- cursor；
- presence；
- board update；
- pointer。

不要在 WebSocket 中重新复制全部 REST API。

## 6. 单 WebSocket 连接

推荐每个浏览器 session 只维护一条：

```text
GET /ws
```

在连接中 multiplex room：

```text
join markdown:<item-id>
leave markdown:<item-id>

join board:<item-id>
leave board:<item-id>
```

切换 Item 时加入 / 离开 room。

优点：

- 减少连接数量；
- 统一 auth；
- 统一 reconnect；
- 统一 presence；
- 更容易实现 graceful shutdown。

## 7. Native WebSocket

MVP 删除 Socket.IO。

原因：

- 不再需要兼容 AFFiNE；
- 原生 WebSocket 足够；
- protocol 可以完全按 madoc 需求定义；
- 减少 Engine.IO / Socket.IO 依赖链。

Go 推荐 `github.com/coder/websocket`。

MVP 可先使用 JSON envelope + base64 binary payload，换取可调试性。数据量验证后再决定是否切 binary framing。

## 8. Dependency Direction

建议：

```text
api -> service/domain -> repo
realtime -> permission/domain -> repo
repo -> database/sql

frontend route -> feature -> api/provider
editor adapter -> Milkdown
board adapter -> Excalidraw
```

禁止：

- `db.Repo` 成为一个持续增长的 3000 行万能类；
- route 直接拼 SQL；
- Excalidraw adapter 依赖 Workspace 页面；
- Milkdown provider 依赖具体 route。

## 9. Deployment

生产：

```text
madoc binary
├── embedded web/dist
├── HTTP API
├── WebSocket
└── SQLite
```

外部只需要数据目录。

Asset 使用文件系统，避免大 BLOB 让 SQLite 数据库膨胀。

## 10. Scale Assumption

设计目标是单实例、小团队：

- 5–10 个活跃用户；
- 数百到数千文档；
- 单个 Markdown 文档通常 < 数 MB；
- 白板规模为个人/小团队常规图；
- 不考虑跨实例实时广播。

因此不引入 Redis。

如果未来需要横向扩容，应另外设计 shared pub/sub，而不是在 MVP 中预埋分布式复杂度。
