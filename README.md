# Project Spec: madoc (Open-Source Self-Hosted Collaborative Workspace)

## 1. 项目简介
madoc 是一款面向小团队（5-10人）和家庭的高效、轻量级、开源自部署协同文档/白板工具。
基于 AFFiNE 0.26.2 整体移植到 Go + SQLite，走纯开源极客自部署路线。
专注于实现"单二进制文件、开箱即用、极低内存占用、数据完全私有化"的极客部署体验。

## 2. 技术栈核心 (Tech Stack)

| 组件 | AFFiNE 现状 | madoc 替代 |
|------|-------------|-----------|
| 运行时 | NestJS, `SERVER_FLAVOR=allinone` 单进程 | Go 单进程 |
| 数据库 | PostgreSQL + Prisma ORM | SQLite + WAL (`modernc.org/sqlite`，纯 Go，无需 CGO) |
| 缓存/消息 | Redis (pub/sub + cache + mutex) | 内存 (进程内 channel) |
| 对象存储 | S3/R2 (blob) | 本地文件系统 |
| 实时同步 | Socket.io (非裸 WebSocket) | Go Socket.io 库 (`github.com/zishang520/socket.io/v2`) |
| API | GraphQL (NestJS @Resolver) + REST | gqlgen (schema-first) + chi |
| 认证 | Cookie-based session + CSRF | 同样 cookie session (`gorilla/securecookie`) |
| 密码 | bcrypt | `golang.org/x/crypto/bcrypt` |
| 前端 | `@affine/web` | Fork 为 `@madoc/web`，裁剪定制 |

核心编辑器：**BlockSuite**（Document 文档、Edgeless 白板、Database 数据表）
协同算法：**Yjs (CRDT)**，协同逻辑完全运行在前端（浏览器）
静态资源：使用 `go:embed` 内嵌前端构建产物，编译为单二进制

---

## 3. 核心架构与数据流 (Architecture & Data Flow)
后端对 Yjs 的文档内容保持"内容盲人"状态，不解析富文本，只做二进制流的转发与顺序存储。

### A. 实时协同流 (Socket.io)

前端使用 `socket.io-client` 连接（**不是裸 WebSocket**），消息格式为 JSON + base64 编码的 Yjs 二进制。

**核心事件：**
| 事件 | 方向 | 载荷 | 说明 |
|------|------|------|------|
| `space:join` | C→S | `{ spaceType, spaceId, clientVersion }` | 加入房间 |
| `space:leave` | C→S | — | 离开房间 |
| `space:load-doc` | C→S | `{ spaceType, spaceId, docId, stateVector? }` | 返回 `{ missing, state, timestamp }` |
| `space:push-doc-update` | C→S | `{ spaceType, spaceId, docId, update:"base64" }` | 返回 `{ timestamp }` |
| `space:broadcast-doc-updates` | S→C | — | 服务端广播给房间内其他客户端 |
| `space:load-doc-timestamps` | C→S | — | 批量获取文档时间戳 |
| `space:join-awareness` / `space:update-awareness` / `space:load-awarenesses` | 双向 | — | 光标/在线状态 |

SpaceType: `workspace` | `userspace`

**数据流：**
1. 客户端 A 修改文档 → BlockSuite/Yjs 生成二进制 `Update` → 通过 Socket.io `space:push-doc-update` 发送给 Go 后端。
2. Go 后端收到后执行两步：
   - **广播**: 通过 `space:broadcast-doc-updates` 转发给同房间其他客户端。
   - **落库**: 将 base64 解码后的二进制 `Update` 写入 SQLite 的 `updates` 表（顺序追加）。

### B. 状态初始化与瘦身 (Snapshot & Compaction)
1. 客户端打开文档 → 发送 `space:load-doc` 事件。
2. Go 从 SQLite 读取最新的 `Snapshot` + 尚未合并的 `Updates`，打包 base64 返回。
3. 前端 Yjs 引擎在浏览器端自动合并这些数据，渲染出最终界面。
4. **瘦身策略**: MVP 阶段暂不做服务端合并，等 updates 堆积后让客户端下次 load 时在浏览器端合并。后续可切换到 y-octo (AFFiNE 的 Rust Yjs 实现，通过 CGO 调用) 或纯 Go Yjs 库。

### C. 认证流程
- Cookie-based session: HTTPOnly cookie `sid` + CSRF header `x-affine-csrf-token`
- selfhost 初始化: 首次访问跳转 setup 页面 → `POST /api/setup/create-admin-user` 创建管理员
- 仅支持 email + password 登录，不实现 OAuth / Magic link

### D. 用户注册策略
- 可配置：管理员可通过 `appConfig` 控制是否允许自助注册，默认关闭（仅邀请制）
- 默认流程：管理员/工作区 Owner 邀请 → 被邀请人通过链接设置密码 → 加入工作区
- 可选：开启后任何人可通过注册页面创建账号

---

## 4. API 设计

### REST 端点 (MVP 子集)

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/info` | 服务器版本信息 |
| POST | `/api/setup/create-admin-user` | selfhost 初始化管理员 |
| POST | `/api/auth/preflight` | 检查邮箱注册状态 |
| POST | `/api/auth/sign-in` | 登录 (email + password) |
| POST | `/api/auth/sign-out` | 登出 |
| GET | `/api/auth/session` | 获取当前会话/用户 |
| GET | `/api/auth/sessions` | 列出当前 session 中的用户 |
| GET | `/api/workspaces/:id/blobs/:name` | 下载 blob |
| GET | `/api/workspaces/:id/docs/:guid` | 获取文档二进制 |
| GET | `/api/workspaces/:id/docs/:guid/histories/:ts` | 历史快照 |
| GET | `/api/avatars/:id` | 用户头像 |
| GET | `/api/worker/image-proxy` | 图片代理 |

### GraphQL (gqlgen, schema-first)

从 AFFiNE 的 `schema.gql` 裁剪出 MVP 子集，用 gqlgen 生成 Go 代码。

**Queries:**
- `serverConfig` — 服务器配置（版本、功能开关、认证要求；关闭 payment/copilot/oauth）
- `currentUser` — 当前登录用户
- `workspaces` — 用户的所有工作区
- `workspace(id)` — 单个工作区详情（成员、权限、配额）
- `appConfig` — 应用配置

**Mutations:**
- `createWorkspace(init)` — 创建工作区（init 是可选的初始 Yjs binary upload）
- `deleteWorkspace` — 删除工作区
- `createBlobUpload` / `completeBlobUpload` / `abortBlobUpload` — blob 上传流程
- `deleteBlob` — 删除 blob
- `invite` / `acceptInviteById` / `leaveWorkspace` — 成员管理（Phase 2）

---

## 5. 数据库设计 (SQLite Schema)

强制开启 WAL 模式。从 AFFiNE 的 Prisma 模型映射 12 张表：

| Prisma Model | SQLite 表名 | 关键字段 |
|--------------|------------|---------|
| User | users | id, name, email, password, avatar_url, registered, disabled |
| Session | sessions | id, created_at |
| UserSession | user_sessions | id, session_id, user_id, expires_at |
| Workspace | workspaces | id, public, name, avatar_key, created_at |
| WorkspaceUserRole | workspace_user_permissions | workspace_id, user_id, type(role), status |
| WorkspaceDoc | workspace_pages | workspace_id, doc_id, public, mode, title |
| Snapshot | snapshots | workspace_id, guid, blob, state, updated_at, created_by, updated_by |
| Update | updates | workspace_id, guid, blob, created_at, created_by |
| SnapshotHistory | snapshot_histories | workspace_id, guid, timestamp, blob, state, expired_at |
| UserSnapshot | user_snapshots | user_id, id, blob |
| Blob | blobs | workspace_id, key, size, mime, status |
| AppConfig | app_configs | id, value(JSON) |

**MVP 不需要的表：** ConnectedAccount, VerificationToken, MagicLinkOtp, WorkspaceFeature, WorkspaceDocUserRole, 所有 AI/Copilot/Payment/Calendar/Notification/Comment 表

---

## 6. 前端方案 (Fork @affine/web → @madoc/web)

- **源码位置**：从 AFFiNE `packages/frontend/apps/web` 及其依赖整理到 `frontend/`（madoc 仓库内独立管理）
- **结构**：保留 monorepo 结构（pnpm workspace），保留必要的内部包（core、env、graphql、blocksuite 等），改动最小，方便跟踪上游更新
- **参考源码**：`AFFiNE-0.26.2/` 仅用于开发参考，已在 `.gitignore` 中排除，不入仓库
- **包管理器**：pnpm
- **构建**：Selfhost 入口 `selfhost.html`，构建产物输出到 `frontend/dist/`（`pnpm install && pnpm build`）
- **裁剪清单**：
  - 删除 AI/Copilot 相关 UI（侧栏 AI 按钮、chat panel、AI actions）
  - 删除 cloud/local 工作区切换——所有工作区强制走服务端同步，移除 IndexedDB 本地工作区入口
  - 删除订阅/付费相关 UI（升级提示、plan 页面、价格弹窗）
  - 删除 OAuth 登录按钮（仅保留 email+password）
  - 删除 admin 管理面板入口
  - 简化 serverConfig 消费逻辑——硬编码关闭 AI/payment/oauth 的 feature flags
- **保留**：编辑器核心（BlockSuite）、工作区管理、成员邀请、设置、搜索、i18n 多语言、文档导出（PDF/Markdown/HTML）、移动端视图（`/mobile/*`）

---

## 7. 代码编写规范

1. **纯净与轻量**: 尽量使用 Go 标准库 + 极少第三方库（socket.io、gqlgen、modernc.org/sqlite、chi 路由、securecookie、bcrypt）。不依赖 CGO，确保交叉编译友好。
2. **错误处理**: Go 代码必须严格检查 `err`，对 SQLite 的写入必须包含超时容错和重试。
3. **单文件打包**: 前端构建产物输出至 `frontend/dist/`，后端使用 `//go:embed frontend/dist/*` 内嵌。
4. **性能优化**: 针对 5-10 人场景，限制 SQLite 的并发写入连接数，Go 端对 Write 操作加锁，确保无锁冲突风险。
5. **Blob 存储**: 本地文件系统，数据目录 `$MADOC_DATA/`（默认 `./data/`），子目录 `blobs/`, `avatars/`。

---

## 8. 可裁剪的功能（madoc 不实现）

- Copilot / AI — 全部删除（前端 UI + 后端 resolver）
- Payment / Subscription / License — 全部删除
- OAuth 第三方登录 — 仅保留 email+password
- Magic link 登录 — 删除
- Cloud/Local 工作区切换 — 删除本地工作区概念，所有数据走服务端
- Calendar 集成 — 删除
- 文档评论 (Comment / Reply) — 后续再加
- Admin 面板 — 后续再加
- Doc SSR renderer — 删除
- Telemetry — 删除
- 通知系统 — 后续再加

---

## 9. 目录布局

```
madoc/
├── main.go                     # 入口 + 路由装配 + go:embed
├── internal/
│   ├── db/                     # SQLite 连接 + schema + migrations
│   ├── auth/                   # Session + Cookie + CSRF + 密码
│   ├── graphql/                # gqlgen 生成 + resolvers
│   │   ├── schema.graphql      # 从 AFFiNE schema.gql 裁剪
│   │   ├── generated.go
│   │   └── resolver_*.go
│   ├── sync/                   # Socket.io gateway + space:* 事件
│   ├── doc/                    # Doc 存储适配器 (snapshot + update)
│   ├── blob/                   # Blob 文件系统存储
│   └── api/                    # REST handlers (auth, blobs, docs, setup)
├── frontend/                   # @madoc/web 前端源码（从 AFFiNE 整理而来）
│   ├── ...                     # 前端源码 + 依赖
│   └── dist/                   # 构建产物 (go:embed)
├── go.mod / go.sum
├── PLAN.md                     # 详细开发计划与分阶段实施
└── BUILD.md                    # 构建说明

# 不入仓库（.gitignore）:
# AFFiNE-0.26.2/               # 仅作为开发参考源码
```
