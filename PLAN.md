# madoc 开发计划 v2 — 移植 AFFiNE 到 Go + SQLite

## Context

目标：把 AFFiNE 0.26.2 整体移植到 Go + SQLite，走纯开源极客自部署路线。

- **后端**：用 Go 完全重写 NestJS/PostgreSQL/Redis/S3 后端
- **前端**：从 `@affine/web` **Fork 出 `@madoc/web`**，做定制裁剪——彻底删除 AI、cloud/local 工作区切换、订阅付费等 UI，所有工作区只走服务端同步
- **初始化**：复用 AFFiNE selfhost 流程（`/api/setup/create-admin-user` + `serverConfig.initialized`），首次访问跳转 setup 页面创建站点管理员

参考源码：`D:\Code\Go\madoc\AFFiNE-0.26.2`

---

## 调研摘要

### 后端架构要点

| 组件 | AFFiNE 现状 | madoc 替代 |
|------|-------------|-----------|
| 运行时 | NestJS, `SERVER_FLAVOR=allinone` 单进程跑 graphql+sync+doc+front | Go 单进程 |
| 数据库 | PostgreSQL + Prisma ORM | SQLite + WAL (`modernc.org/sqlite`，纯 Go，无需 CGO) |
| 缓存/消息 | Redis (pub/sub + cache + mutex) | 内存 (进程内 channel) |
| 对象存储 | S3/R2 (blob) | 本地文件系统 |
| 实时同步 | **Socket.io** (非裸 WebSocket) | Go Socket.io 库 |
| API | GraphQL (NestJS @Resolver) + REST | gqlgen + chi |
| 认证 | Cookie-based session + CSRF | 同样 cookie session |

### 同步协议 (Socket.io)

前端用 `socket.io-client` 连接，**不是裸 WebSocket**。消息格式：JSON + base64 编码的 Yjs 二进制。

**核心事件：**
- `space:join` → `{ spaceType, spaceId, clientVersion }` → 加入房间
- `space:leave` → 离开房间
- `space:load-doc` → `{ spaceType, spaceId, docId, stateVector? }` → 返回 `{ missing, state, timestamp }`
- `space:push-doc-update` → `{ spaceType, spaceId, docId, update:"base64" }` → 返回 `{ timestamp }`
- `space:broadcast-doc-updates` → 服务端广播给房间内其他客户端
- `space:load-doc-timestamps` → 批量获取文档时间戳
- `space:join-awareness` / `space:update-awareness` / `space:load-awarenesses` → 光标/在线状态

SpaceType: `workspace` | `userspace`

### 数据模型 (Prisma → SQLite)

**必须移植的表：**

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
| UserFeature | user_features | user_id, name, type, activated |
| AppConfig | app_configs | id, value(JSON) |

**MVP 不需要的表：** ConnectedAccount, VerificationToken, MagicLinkOtp, WorkspaceFeature, WorkspaceDocUserRole, 所有 AI/Copilot/Payment/Calendar/Notification/Comment 表

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

### GraphQL (MVP 子集)

**Queries:**
- `serverConfig` — 服务器配置（版本、功能开关、认证要求）
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

### 前端定制 (Fork @affine/web → @madoc/web)

- **源码位置**：从 AFFiNE `packages/frontend/apps/web` 及其依赖整理到 `madoc/frontend/`（madoc 仓库内独立管理）
- **参考源码**：`AFFiNE-0.26.2/` 仅用于开发参考，不入 git 仓库
- **构建**：Selfhost 入口 `selfhost.html`，构建产物输出到 `frontend/dist/`
- **裁剪清单**：
  - 删除 AI/Copilot 相关 UI（侧栏 AI 按钮、chat panel、AI actions）
  - 删除 cloud/local 工作区切换——所有工作区强制走服务端同步，移除 IndexedDB 本地工作区入口
  - 删除订阅/付费相关 UI（升级提示、plan 页面、价格弹窗）
  - 删除 OAuth 登录按钮（仅保留 email+password）
  - 删除 admin 管理面板入口
  - 简化 serverConfig 消费逻辑——硬编码关闭 AI/payment/oauth 的 feature flags
- **保留**：编辑器核心（BlockSuite）、工作区管理、成员邀请、设置、搜索、i18n 多语言、文档导出（PDF/Markdown/HTML）、移动端视图（`/mobile/*`）

---

## 实施分阶段

### Phase 0 — 清理 + 基础设施（1天）

- 删除之前错误产物：`AFFiNE-canary/blocksuite/madoc-frontend/`
- 保留并重构现有 Go 代码：`internal/db/` schema 扩展，`main.go` 保留
- 新增依赖：
  - `modernc.org/sqlite`（纯 Go SQLite 驱动，无需 CGO）
  - `github.com/zishang520/socket.io/v2`（Socket.io 服务端，兼容 v4 协议）
  - `github.com/99designs/gqlgen`（GraphQL 代码生成）
  - `github.com/gorilla/securecookie`（session 管理）
  - `golang.org/x/crypto/bcrypt`（密码哈希）
- 重写 `internal/db/schema.sql`：映射上面的 12 张表到 SQLite

### Phase 0.5 — 前端 Fork + 裁剪（2天，可与 Phase 1 并行）

**目标**：从 `@affine/web` Fork 出 `@madoc/web`，整理到 `frontend/` 目录，去掉不需要的功能模块

1. 从 AFFiNE-0.26.2 的 `packages/frontend/apps/web` 及相关依赖整理到 `madoc/frontend/`
2. 以 `apps/web/` 内容为起点
3. **裁剪模块引用**：
   - 移除 local workspace 相关（IndexedDB provider、BroadcastChannel sync）
   - 移除 AI 模块引用（`blocksuite/ai/`、copilot panel）
   - 移除 payment/subscription 模块
   - 移除 OAuth 登录组件
4. 修改 workspace 创建逻辑：新建工作区时直接走服务端（无 local 选项）
5. 确保 `selfhost.html` 入口 + setup 页面保持可用
6. 构建产物输出到 `frontend/dist/`

**验证**：构建通过，`selfhost.html` 加载无 JS 错误，无 AI/local/payment 相关 UI 残留

### Phase 1 — 认证 + 静态资源 + GraphQL 骨架（3天）

**目标**：浏览器打开 → 看到 AFFiNE selfhost 初始化页面 → 创建管理员 → 登录成功

1. **SQLite schema** — 完整 12 表建表语句
2. **Session + Auth**
   - `internal/auth/` — cookie-based session (HTTPOnly cookie `sid` + CSRF header `x-affine-csrf-token`)
   - `POST /api/setup/create-admin-user` — 第一次设置
   - `POST /api/auth/sign-in` — 密码登录
   - `POST /api/auth/sign-out`
   - `GET /api/auth/session` — 返回 `{ user: {...} }` 或空
   - `POST /api/auth/preflight` — 返回 `{ registered, hasPassword }`
3. **GraphQL**
   - 用 gqlgen 从 AFFiNE 的 `schema.gql` 裁剪出 MVP 子集生成 Go 代码
   - 实现 resolvers：`serverConfig`, `currentUser`, `workspaces`, `workspace(id)`, `createWorkspace`, `deleteWorkspace`, `appConfig`
   - `serverConfig` 返回 selfhosted 标记 + 版本 + 功能开关（关闭 payment/copilot/oauth）
4. **静态资源**
   - 构建 AFFiNE web 前端 → `frontend/dist/`（含 `selfhost.html`）
   - `go:embed` 嵌入 + 路由：`/admin/*`, `/mobile/*`, `/*` → SPA fallback 到 `selfhost.html`
5. **GET /info** — `{ version, type: "selfhosted", flavor: "allinone" }`

**验证**：浏览器打开 → selfhost setup 页面 → 创建管理员 → 登录 → 看到空的工作区列表

### Phase 2 — Socket.io 同步引擎（3天）

**目标**：实时协同编辑可用

1. **Socket.io 服务端** — `internal/sync/`
   - Go Socket.io 库监听在 `/socket.io/` 路径
   - Auth 中间件：从 handshake cookie 提取 session → 验证用户
   - 实现所有 `space:*` 事件处理：
     - `space:join` → 校验权限 → 加入 room
     - `space:load-doc` → 从 DB 读 Snapshot + Updates → merge → 返回 base64
     - `space:push-doc-update` → 写入 Updates 表 → 广播 `space:broadcast-doc-updates`
     - `space:load-doc-timestamps` → 返回 `{[docId]: timestamp}`
     - `space:join-awareness` / `space:update-awareness` / `space:load-awarenesses`
2. **Doc 存储适配器** — `internal/doc/`
   - `GetDoc(wsId, docId)` → Snapshot.blob + merge Updates.blob → 返回合并后的 Yjs binary
   - `PushDocUpdates(wsId, docId, updates, editor)` → INSERT Updates
   - **合并 (compaction)**：当 Updates 超过阈值 → 在 Go 端用 y-octo 或让客户端合并（和原版一样，服务端直接 merge Yjs updates）
   - `GetDocTimestamps(wsId)` → 查 Snapshot + Update 表取最新时间
3. **Userspace 支持** — 和 workspace 同理但走 `user_snapshots` 表

**验证**：两个浏览器窗口打开同一文档 → 实时同步 → 刷新恢复

### Phase 3 — Blob + 剩余 REST（2天）

1. **Blob 存储** — `internal/blob/`
   - 文件系统存储：`$MADOC_DATA/blobs/{workspaceId}/{key}`
   - `POST /graphql` mutation `createBlobUpload` → 返回 upload URL
   - `PUT /api/storage/upload` → 接收二进制写入文件系统 + 更新 blobs 表
   - `completeBlobUpload` / `abortBlobUpload` — 状态更新
   - `GET /api/workspaces/:id/blobs/:name` → 读文件返回
   - `deleteBlob` mutation → 标记 deleted_at
2. **Image proxy** — `GET /api/worker/image-proxy?url=...` — 简单 HTTP 转发
3. **User avatar** — `GET /api/avatars/:id` → 从文件系统返回

**验证**：在文档中插入图片 → 图片正确上传 → 刷新后图片正常显示

### Phase 4 — 工作区管理 + 成员（2天）

1. **createWorkspace** mutation — 处理可选的 init binary upload（工作区初始 Yjs snapshot）
2. **Workspace 设置** GraphQL resolvers — name、avatar、public 等
3. **成员邀请/管理** — invite、acceptInviteById、leaveWorkspace、revokeMember
4. **权限检查** — 读/写/管理权限在 sync + REST 层统一检查

### Phase 5 — 构建 + 打包 + 文档（1天）

1. **前端构建脚本**
   - `cd frontend && pnpm install && pnpm build`
   - 构建产物输出到 `frontend/dist/`
2. **Go 构建** — `go build -o madoc` 单二进制
3. **Docker 支持** — 简单 Dockerfile
4. **BUILD.md** — 完整构建说明

---

## 技术决策

### Socket.io 库选择

前端用的是 Socket.io 4.x 客户端。Go 端必须用兼容 Socket.io 协议的服务端库。
推荐 `github.com/zishang520/socket.io/v2` — 较活跃，兼容 Socket.io v4 协议。

### GraphQL 库选择

gqlgen（schema-first 代码生成）— 可以直接从 AFFiNE 的 `schema.gql` 裁剪出子集生成 Go 类型和 resolver 骨架。

### Yjs Update 合并

AFFiNE 后端在 `PgWorkspaceDocStorageAdapter` 中周期性合并 Updates 到 Snapshot（服务端直接操作 Yjs binary）。Go 端可以：
- (a) 用 `y-octo`（AFFiNE 自带的 Rust Yjs 实现，在 `packages/common/y-octo`）通过 CGO 调用
- (b) 纯 Go：用 `github.com/nicois/ygo` 或类似库
- (c) 暂不合并，等 updates 堆积后让客户端下次 load 时在浏览器端合并（MVP 可接受）

推荐 MVP 用 (c)，后续切换到 (a) 或 (b)。

### Blob 存储

不用 S3/R2，改为本地文件系统。数据目录 `$MADOC_DATA/`（默认 `./data/`），子目录 `blobs/`, `avatars/`。

### SQLite 驱动选择

使用 `modernc.org/sqlite`（纯 Go 实现），无需 CGO 和 C 编译器，交叉编译友好，确保"单二进制"的部署体验。5-10 人场景性能足够。

### 前端 monorepo 结构

前端整理到 `frontend/` 时保留 pnpm workspace monorepo 结构（保留 core、env、graphql、blocksuite 等内部包），改动最小，方便后续跟踪 AFFiNE 上游更新。

### 用户注册策略

可配置：通过 `appConfig` 控制是否允许自助注册，默认关闭（仅邀请制）。管理员/工作区 Owner 邀请新用户，被邀请人通过链接设置密码后加入。管理员可开启开放注册。

---

## 可裁剪的功能（madoc 不实现）

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

## 验证清单

1. **Selfhost 初始化**：首次打开 → setup 页面 → 创建管理员 → 自动登录
2. **登录登出**：退出 → 重新登录 → session 恢复
3. **创建工作区**：创建 → 列表显示 → 进入工作区
4. **实时协同**：两窗口同编辑 → <500ms 延迟同步
5. **持久化**：关闭所有窗口 → 重启服务 → 内容完整恢复
6. **Blob**：插入图片 → 上传 → 刷新显示正常
7. **单二进制**：`madoc` 拷贝到空目录运行 → 一切正常（自动建 `madoc.db` + `data/`）

---

## 目录布局（最终）

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
├── PLAN.md
└── BUILD.md

# 不入仓库（.gitignore）:
# AFFiNE-0.26.2/               # 仅作为开发参考源码
```
