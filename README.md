# Project Spec: madoc (Open-Source Self-Hosted Collaborative Workspace)

## 1. 项目简介
madoc 是一款面向小团队（5-10人）和家庭的高效、轻量级、开源自部署协同文档/白板工具。
专注于实现“单二进制文件、开箱即用、极低内存占用、数据完全私有化”的极客部署体验。

## 2. 技术栈核心 (Tech Stack)
- **后端**: Go (Golang) 标准库 + 轻量级路由（如 chi 或 gin），使用 `go:embed` 内嵌前端静态资源。
- **前端**: AFFiNE 核心编辑器组件 **BlockSuite** (负责 Document 文档、Edgeless 白板、Database 数据表)。
- **协同算法**: **Yjs (CRDT)**，协同逻辑完全运行在前端（浏览器）。
- **通信协议**: WebSocket (用于实时传递 Yjs 的二进制 Update 字节流)。
- **数据库**: **SQLite** (开启 WAL 模式，高频顺序追加)。

---

## 3. 核心架构与数据流 (Architecture & Data Flow)
后端对 Yjs 的文档内容保持“内容盲人”状态，不解析富文本，只做二进制流的转发与顺序存储。

### A. 实时协同流:
1. 客户端 A 修改文档 -> BlockSuite/Yjs 生成二进制 `Update` 片段 -> 通过 WebSocket 发送给 Go 后端。
2. Go 后端收到 `Update` 后执行两步：
   - **广播**: 立即转发给当前连接在相同 `doc_id` 上的其他所有客户端 WebSocket。
   - **异步落库**: 将该二进制 `Update` 字节流作为 `BLOB` 写入 SQLite 的增量日志表（顺序追加，微秒级写入）。

### B. 状态初始化与瘦身 (Snapshot & Compaction):
1. 客户端打开文档 -> 向 Go 请求初始数据。
2. Go 从 SQLite 读取最新的 `Snapshot`（完整快照）+ 尚未合并的 `Updates`（所有增量日志），打包返回给前端。
3. 前端 Yjs 引擎在浏览器端自动合并（Merge）这些数据，渲染出最终正确的界面。
4. **定时/触发式瘦身**: 当增量日志达到一定数量（如100条）或文档无活跃连接时，Go 协同其中一个前端生成一份最新的完整 `Snapshot` 存入主表，并清空该文档旧的增量日志。

---

## 4. 数据库设计 (SQLite Schema)

在为 madoc 编写任何数据库相关代码时，必须严格遵守以下 Schema 结构，并强制开启 WAL 模式。

```sql
-- 启用 WAL 模式和超时重试（在 Go 初始化连接时执行）：
-- PRAGMA journal_mode=WAL;
-- PRAGMA busy_timeout=5000;

-- 1. 文档主表（存储完整快照）
CREATE TABLE IF NOT EXISTS docs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'Untitled',
    snapshot BLOB,                -- Yjs 完整的文档二进制快照
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 增量日志表（极高频追加写入）
CREATE TABLE IF NOT EXISTS doc_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id TEXT NOT NULL,
    update_blob BLOB NOT NULL,     -- 客户端传来的二进制增量片段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doc_id) REFERENCES docs(id) ON DELETE CASCADE
);

-- 3. 全文搜索虚拟表（用于解决二进制 BLOB 无法在后端直接搜索的问题）
CREATE VIRTUAL TABLE IF NOT EXISTS doc_search USING fts5(
    doc_id,
    content
);
```

## 5. 核心功能实现逻辑提示 (Code Generation Guidelines)

### 📌 WebSocket Hub 编写要求 (Go):

- 使用 `gorilla/websocket` 或原生 `net/http` 升级。
- 维护一个内存中的 `RoomManager`，按 `doc_id` 对连接（Clients）进行分组管理。
- 必须保证高并发安全（使用 `sync.RWMutex` 或 Go Channel 调度机制）。
- 妥善处理连接断开（Disconnect）时的清理，防止内存泄漏。

### 📌 全文搜索设计 (Shadow Text):

- 由于后端存储的是 Yjs 二进制，无法直接使用 SQL 检索。
- **解法**: 前端在停止输入后（Debounced 3秒），将当前文档的纯文本（Markdown 字符串）通过 HTTP API 或 WS 上报。
- Go 后端接收到纯文本后，使用 `INSERT OR REPLACE INTO doc_search` 更新或建立该文档的 FTS5 索引。

## 6. 代码编写规范

1. **纯净与轻量**: 尽量使用 Go 标准库或极为克制的第三方库（如 `sqlite3` 驱动、`chi` 路由、`websocket`）。
2. **错误处理**: Go 代码必须严格检查 `err`，对 SQLite 的写入必须包含超时容错和重试。
3. **单文件打包**: 所有前端静态资源编译后必须输出至 `frontend/dist`，后端使用 `//go:embed frontend/dist/*` 进行静态资源单文件内嵌。
4. **性能优化**: 针对 5-10 人场景，限制 SQLite 的并发写入连接数，或在 Go 后端对 `Write` 操作加锁，确保无锁冲突风险。

已经将 AFFiNE 的代码克隆到本地了，然后项目的本质就是把 AFFiNE 移植到 Go 而且使用 Sqlite，不使用 redis。