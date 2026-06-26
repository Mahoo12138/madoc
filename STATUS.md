# madoc 项目状态

> 本文记录 [PLAN.md](./PLAN.md) 中各项任务的推进情况，以及项目整体状态和技术决策。

## 构建与验证

- 构建：`go build -o madoc.exe .` ✅
- Db 测试：`go test -timeout 30s -count=1 -v ./internal/db/` — 6/6 通过 ✅
- 冒烟测试：info、setup admin、登录、GraphQL CRUD、blob 上传下载、Engine.IO 握手 — 全部通过 ✅

---

## Phase 0 — Go 基础设施（已完成）

- SQLite 连接 + modernc.org/sqlite（无 CGO）
- Schema：12 张 AFFiNE 映射表（全部使用 `DATETIME` 类型，确保 time.Time 扫描正确）
- `db.Repo`：Snapshot/Upsert、DocUpdate CRUD、Blob CRUD、Workspace/User 生命周期、AppConfig
- 构建/测试通过

---

## Phase 0.5 — 前端分支清理（已完成）

- `frontend/` 独立 monorepo，构建结果 951 个 dist 文件，0 错误
- 删除所有 AI / 本地工作区 / 支付 / OAuth / 遥测相关源文件
- Blocksuite 0.22.4 npm 依赖通过 SWC exclude 规则接入

---

## Phase 1 — Go 后端核心（已完成）

### Schema 清理
- 删除旧表：`docs`、`doc_updates`、`doc_search`
- 所有 `created_at` / `updated_at` / `expires_at` 从 `TEXT` 改为 `DATETIME`

### Repo.go 重写
- 新增 AFFiNE 风格 CRUD：Snapshot（upsert/get）、DocUpdate（append/list/count/delete-before）、Blob（create/get/delete）、WorkspacePage（upsert/get）、UserSnapshot（get/save）
- `AppendUpdate` 使用 `time.RFC3339Nano` 获取毫秒级唯一时间戳

### Auth 包 (`internal/auth/`)
- `SessionManager`：crypto/rand 32 字节 session ID、30 天过期、SQLite 存储
- `CSRFProtector`：gorilla/securecookie、csrf_token cookie + x-affine-csrf-token 头部验证
- `password.go`：bcrypt hash/check
- `middleware.go`：RequireAuth（阻断）、OptionalAuth（注入 user）、GetUser(ctx)
- `handler.go`：Preflight / SignIn / SignOut / Session
- `setup.go`：首次管理员创建 + 初始化守卫

### GraphQL 包 (`internal/graphql/`)
- 手写 pattern-match 执行器
- 解析器：serverConfig、currentUser、workspaces、workspace(id)、appConfig、createWorkspace、deleteWorkspace

### main.go 重构
- 旧路由删除，新路由：`/info`、`/api/setup/create-admin-user`、auth REST、`POST /graphql`、`/*` SPA fallback

### 旧代码清理
- 删除 `internal/ws/`（hub、client、room、protocol）
- 删除 `internal/api/docs.go`、`internal/api/ws.go`
- 移除 `gorilla/websocket` 依赖（Phase 2 再引入）

---

## Phase 2 — Socket.IO 同步引擎 + Blob 存储（已完成）

### `internal/socketio/` — 自研 Engine.IO v4 + Socket.IO v5 协议
- HTTP polling 握手：`GET /socket.io/?EIO=4&transport=polling`
- HTTP polling 收发：`POST/GET`（带 sid）
- WebSocket 升级 + 双向通信
- Socket.IO 包帧：CONNECT (0)、EVENT (2)、ACK (3)、DISCONNECT (1)
- Namespace 支持（`/`）
- 内存 Session 存储 + polling 挂起消息队列
- 定时 Engine.IO ping/pong 保活

### `internal/sync/` — 文档同步 + 在线感知 + 房间管理
- `RoomManager`：按 workspace 隔离的房间，Peer 跟踪
- `space:join`：加入 workspace 房间，返回 clientId
- `space:leave`：离开房间
- `space:push-doc-update`：追加 Yjs update 到 DB + 广播到房间
- `space:load-doc`：返回该文档所有 stored updates（拼接为 `missing`），不做 diff 计算
- `space:load-doc-timestamps`：返回 `docId → 最新时间戳` 映射
- `space:delete-doc`：删除文档所有 updates
- `space:join-awareness` / `space:leave-awareness`：awareness 房间注册
- `space:update-awareness`：fire-and-forget 广播给同房间其他人
- `space:load-awarenesses`：请求房间内所有对端重新上报 awareness
- 断开连接时清理房间

### Blob 存储 — REST 上传下载 + GraphQL
- `POST /api/workspaces/{workspaceId}/blobs/{key}` — 直传（可选 OptionalAuth）
- `GET /api/workspaces/{workspaceId}/blobs/{key}` — 下载（公开）
- GraphQL `createBlobUpload` 变更（返回 `{ method: "GRAPHQL" }`）
- GraphQL `setBlob` 变更（支持 multipart/form-data Upload 标量）
- GraphQL `completeBlobUpload` / `deleteBlob` / `listBlobs` / `workspaceBlobQuota` / `releaseDeletedBlobs`
- multipart GraphQL 请求解析器，包含文件上传提取

### DB 层新增
- `blobs` 表新增 `data BLOB` 列
- `DeleteUpdates(ctx, workspaceID, guid)`：删除文档所有 updates
- `ListDocIDsByWorkspace(ctx, workspaceID)`：从 updates + snapshots 获取所有文档 ID
- `ListBlobs(ctx, workspaceID)`：列出未删除的 blob
- `CreateBlob` 新增 `data []byte` 参数

---

## 技术决策

### Yjs 策略 — Relay 模式
服务端只存储和转发原始 Yjs update，不做 CRDT 理解。`load-doc` 返回拼接后的所有 updates，客户端 Yjs 引擎自行合并。未来可在 Phase 3 引入 Go Yjs diff 计算优化。

### Socket.IO — 自研实现
基于 `gorilla/websocket`（~350 行 Go 代码），零外部 Socket.IO 库依赖。完全可控。

### Blob — GraphQL + REST 双通道
上传可通过 REST POST 或 GraphQL `setBlob` multipart 变更，下载走 REST GET。不支持 presigned URL/S3。

### `realtime:*` 事件 — 推迟到 Phase 3
`realtime:request/subscribe/unsubscribe` 未实现（用于工作区权限、配置、成员、通知等）。

### 文档广播 — 仅单条发送
仅支持 `space:broadcast-doc-update`（单条 update），不支持批量广播。

### 路由汇总

| 路由 | 用途 |
|---|---|
| `GET /socket.io/?EIO=4&transport=polling` | Engine.IO polling 握手 |
| `POST /socket.io/?EIO=4&transport=polling` | Engine.IO polling 发送 |
| `GET /socket.io/?EIO=4&transport=websocket` | Engine.IO WebSocket 升级 |
| `POST /api/workspaces/{workspaceId}/blobs/{key}` | Blob 上传 |
| `GET /api/workspaces/{workspaceId}/blobs/{key}` | Blob 下载 |
| `POST /graphql` | GraphQL 端点（含 multipart） |
| `GET /info` | 服务器信息 |

---

## 推迟到 Phase 3

- Yjs state vector diff 计算（服务端按需同步）
- `realtime:request / subscribe / unsubscribe`（工作区访问、配置、成员、通知）
- `space:broadcast-doc-updates`（批量广播）
- Blob presigned URL / multipart 分片上传（用于 S3 兼容存储）
- `telemetry:batch` 事件
- 文档快照压缩（服务端 Yjs 合并）
- 快照历史 / 版本管理
- Socket.IO 完整鉴权中间件（当前 `authenticateBySID` 返回 nil）
- GraphQL `workspace(id)` 查询的嵌套 `blobs` 字段展开

---

## 主要文件索引

| 文件 | 说明 |
|---|---|
| `main.go` | 入口，路由配置，go:embed 前端 |
| `internal/db/schema.sql` | 12 张 AFFiNE 表（全部 DATETIME） |
| `internal/db/repo.go` | 所有 CRUD（用户、会话、工作区、快照、更新、blob、页面、配置） |
| `internal/db/db_test.go` | 数据库测试（6 个测试用例） |
| `internal/auth/session.go` | SessionManager |
| `internal/auth/middleware.go` | RequireAuth / OptionalAuth / GetUser |
| `internal/auth/handler.go` | AuthHandler（登录/登出/会话） |
| `internal/auth/setup.go` | SetupHandler（创建管理员） |
| `internal/auth/password.go` | bcrypt hash/check |
| `internal/auth/csrf.go` | CSRFProtector |
| `internal/graphql/handler.go` | GraphQL 执行器（pattern-match + multipart 解析） |
| `internal/socketio/packets.go` | Engine.IO + Socket.IO 包类型定义与编解码 |
| `internal/socketio/handler.go` | Engine.IO HTTP 处理器（polling + WebSocket） |
| `internal/sync/server.go` | SyncServer（事件路由 + 房间管理） |
| `internal/sync/room.go` | RoomManager + Peer/Room 定义 |
| `go.mod` | 依赖：chi、sqlite、securecookie、websocket、crypto/bcrypt |

---

## 无阻塞项
