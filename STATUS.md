# madoc 项目状态

> 本文记录 [PLAN.md](./PLAN.md) 中各项任务的推进情况，以及项目整体状态和技术决策。

## 构建与验证

- 构建：`go build -o madoc.exe .` ✅
- Db 测试：`go test -timeout 30s -count=1 -v ./internal/db/` — 6/6 通过 ✅
- 冒烟测试：info、setup admin、登录、GraphQL CRUD、blob 上传下载、Engine.IO 握手 — 全部通过 ✅
- GraphQL Phase 3 测试：currentUser(token/features/quota)、publishDoc、revokePublicDoc、updateWorkspace、workspace(publicDocs) — 全部通过 ✅

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

## Phase 3 — 鉴权协议增强 + GraphQL 补全 + 快照压缩（已完成）

### Socket.IO 鉴权（`internal/socketio/handler.go`、`internal/sync/server.go`）
- `Handler.AuthFunc` 回调：从请求 `sid` cookie → `SessionManager.GetUserID()` → 写入 Engine.IO Session.UserID
- `Handler.GetUserID(sid)`：暴露给事件处理器查询连接对应的用户 ID
- `auth/middleware.go`：存储 `sessionID` 到 context，`GetSessionID(ctx)` 辅助函数
- 空 `AuthFunc` 或空 cookie 时用户 ID 为空字符串（向后兼容）

### `realtime:request` 协议（`internal/sync/server.go`）
- `user.profile.get`：返回当前用户信息（id、name、email、avatarUrl、features）
- `workspace.access.get`：返回用户在 workspace 的权限类型 + 接受状态
- `workspace.config.get`：返回静态配置（enableSharing、enableUrlPreview 等）
- `notification.count.get`：返回 `{ count: 0 }`（通知系统推迟）
- 未知操作返回 `{ error: { name: "ERROR", message: "unknown op" } }`

### `realtime:subscribe / unsubscribe` 协议（`internal/sync/server.go`）
- `realtime:subscribe`：记录订阅，返回 `subscriptionId`
- `realtime:unsubscribe`：取消订阅
- 当前为桩实现，消息推送推迟到后续

### GraphQL 补全（`internal/graphql/handler.go`、`internal/db/repo.go`）

**`currentUser` 增强：**
- `token { sessionToken }`：返回当前会话 token
- `features`：返回空数组（自部署无特性开关）
- `quota`：静态配额（blobLimit=100MB、storageQuota=1GB、memberLimit=10）
- `quotaUsage`：静态用量
- `settings`：静态通知偏好
- `emailVerified`：默认 true
- 兼容所有被前端 `getCurrentUserQuery`、`getCurrentUserFeaturesQuery`、`quotaQuery`、`getUserSettingsQuery` 等查询的字段

**`workspace(id)` 嵌套字段：**
- `publicDocs { id mode }`：返回已发布的公开文档列表
- `doc(docId:) { id mode public title }`：返回单个文档的页面元数据
- `quota`：静态配额
- `subscription`、`calendars`、`byokSettings`、`commentChanges`：返回空桩
- `resolveVar(vars, query, names...)` 辅助函数：兼容变量名别名（`id` / `workspaceId`、`docId` / `pageId`）

**新增变更：**
- `publishDoc(workspaceId, docId, mode)`：将文档设为公开
- `revokePublicDoc(workspaceId, docId)`：撤销文档公开状态
- `updateWorkspace(input: {id, public, name})`：更新工作区属性
- `leaveWorkspace(workspaceId)`：移除当前用户的 workspace 权限

**DB 层新增：**
- `ListPublicDocsByWorkspace(ctx, workspaceID)`：列出公开文档
- `UpdateWorkspace(ctx, id, public, name, avatarKey)`：更新工作区
- `ListAllDocPairs(ctx)`：列出所有 (workspaceID, docID) 对（快照压缩使用）

### 快照压缩（`internal/sync/server.go`、`main.go`）
- 按数量触发：`push-doc-update` 后检查 updates 数量 ≥ 100，异步执行压缩
- 定时触发：启动时 + 每小时扫描全量文档
- 压缩策略：合并所有 updates blob → UpsertSnapshot → DeleteUpdatesBefore(最新时间戳)
- `StartCompactionLoop()`：后台 goroutine，`main.go` 启动时调用

---

## 技术决策

### Yjs 策略 — Relay 模式
服务端只存储和转发原始 Yjs update，不做 CRDT 理解。`load-doc` 返回拼接后的所有 updates，客户端 Yjs 引擎自行合并。

### Socket.IO — 自研实现
基于 `gorilla/websocket`（~350 行 Go 代码），零外部 Socket.IO 库依赖。完全可控。

### Auth — 双层鉴权
GraphQL 使用 `OptionalAuth` 中间件（`sid` cookie → `SessionManager.GetUserID`），Socket.IO 使用 `AuthFunc` 回调（同一机制），CSRF 保护变更端点。

### Blob — GraphQL + REST 双通道
上传可通过 REST POST 或 GraphQL `setBlob` multipart 变更，下载走 REST GET。不支持 presigned URL/S3。

### 变量名兼容
`resolveVar()` 辅助函数按优先级查找：直接变量键 → 查询语句中 `argName: $varName` 映射。支持别名如 `id`/`workspaceId`、`docId`/`pageId`，确保前后端 GraphQL 操作名差异不导致 400。

### 快照压缩 — 双触发
按数量（每 doc ≥ 100 updates） + 定时（每小时）双触发合并。合并后更新写为 snapshot，原始 updates 删除。

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

### GraphQL 操作一览

| 操作名 | 类型 | 说明 |
|---|---|---|
| `appConfig` | Query | 是否已初始化 |
| `currentUser` | Query | 当前用户（含 token/features/quota/settings） |
| `serverConfig` | Query | 服务器配置 |
| `workspaces` | Query | 用户的工作区列表 |
| `workspace(id)` | Query | 单个工作区（含 publicDocs/doc/quota 等嵌套字段） |
| `createWorkspace` | Mutation | 创建工作区 |
| `deleteWorkspace` | Mutation | 删除工作区 |
| `updateWorkspace` | Mutation | 更新工作区（public/name） |
| `publishDoc` | Mutation | 公开文档 |
| `revokePublicDoc` | Mutation | 撤销文档公开 |
| `leaveWorkspace` | Mutation | 退出工作区 |
| `createBlobUpload` | Mutation | 创建 blob 上传 |
| `setBlob` | Mutation | 上传 blob（支持 multipart） |
| `completeBlobUpload` | Mutation | 完成上传 |
| `deleteBlob` | Mutation | 删除 blob |
| `listBlobs` | Query | 列出 blob |
| `workspaceBlobQuota` | Query | 配额查询 |
| `releaseDeletedBlobs` | Mutation | 释放已删除 blob |

---

## 推迟到后续

- Yjs state vector diff 计算（服务端按需同步）
- `space:broadcast-doc-updates`（批量广播）
- Blob presigned URL / multipart 分片上传（用于 S3 兼容存储）
- `telemetry:batch` 事件
- `realtime:*` 消息推送（目前仅桩处理 subscribe/unsubscribe）
- 快照历史 / 版本管理（`snapshot_histories` 表已就绪）
- 通知系统（`notification.count.get` 返回 0）
- 评论 / Calendar / BYOK / Copilot GraphQL 字段
- `workspace(id)` 的 `blobs` 嵌套展开
- 成员邀请 / 邀请链接 / 权限管理 REST 端点
- 禁用用户 / 会话管理管理接口

---

## 主要文件索引

| 文件 | 说明 |
|---|---|
| `main.go` | 入口，路由配置，go:embed 前端，快照压缩循环 |
| `internal/db/schema.sql` | 12 张 AFFiNE 表（全部 DATETIME） |
| `internal/db/repo.go` | 所有 CRUD（用户、会话、工作区、快照、更新、blob、页面、配置、doc pairs） |
| `internal/db/db_test.go` | 数据库测试（6 个测试用例） |
| `internal/auth/session.go` | SessionManager |
| `internal/auth/middleware.go` | RequireAuth / OptionalAuth / GetUser / GetSessionID |
| `internal/auth/handler.go` | AuthHandler（登录/登出/会话） |
| `internal/auth/setup.go` | SetupHandler（创建管理员） |
| `internal/auth/password.go` | bcrypt hash/check |
| `internal/auth/csrf.go` | CSRFProtector |
| `internal/graphql/handler.go` | GraphQL 执行器（pattern-match + multipart 解析 + 21+ 解析器） |
| `internal/socketio/packets.go` | Engine.IO + Socket.IO 包类型定义与编解码 |
| `internal/socketio/handler.go` | Engine.IO HTTP 处理器（polling + WebSocket + auth 回调） |
| `internal/sync/server.go` | SyncServer（事件路由 + 房间管理 + realtime 协议 + 快照压缩） |
| `internal/sync/room.go` | RoomManager + Peer/Room 定义 |
| `go.mod` | 依赖：chi、sqlite、securecookie、websocket、crypto/bcrypt |

---

## 无阻塞项
