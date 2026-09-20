# madoc MVP Status

更新时间：2026-09-20

## 当前结论

项目仍处于 MVP 阶段。当前仅调整 MVP 的技术路线：从“基于 AFFiNE 0.26.x 整体移植到 Go + SQLite”切换为：

> Lightweight self-hosted collaborative Markdown workspace.

旧 旧 MVP 代码已经完成了大量 AFFiNE compatibility 工作，但 MVP 明确停止继续扩展该兼容层。

## 已存在且可复用的基础

- Go + chi 应用骨架；
- SQLite + WAL；
- `modernc.org/sqlite`；
- Email + Password；
- Session；
- CSRF 基础；
- 首次初始化管理员概念；
- Workspace / User 的部分 repository 代码；
- Vite；
- React；
- TanStack Router；
- TanStack Query；
- Vanilla Extract；
- `go:embed`；
- Docker / dev script 基础。

## 当前 legacy 架构

现有代码仍包括：

- 15 张 AFFiNE 映射表；
- `internal/graphql/handler.go` AFFiNE-compatible GraphQL；
- Socket.IO `space:*`；
- `realtime:*` compatibility；
- snapshot / updates AFFiNE semantics；
- BlockSuite-based frontend package；
- License / Git / Notification 等 compatibility stub。

这些属于待迁移范围，不再视为 MVP 产品能力。

## 当前 MVP 目标状态

- [ ] 删除 GraphQL compatibility
- [ ] 删除 AFFiNE Socket.IO protocol
- [ ] 删除 BlockSuite
- [ ] 删除 AFFiNE schema coupling
- [ ] 建立 MVP schema
- [ ] 建立 REST API
- [ ] 建立 native WebSocket hub
- [ ] 重建 Workspace Shell
- [ ] Milkdown / Crepe
- [ ] Yjs Markdown collaboration
- [ ] Excalidraw
- [ ] Whiteboard collaboration
- [ ] MVP deployment / backup verification

## 数据迁移状态

MVP 重构初期不能自动删除旧 AFFiNE-compatible tables。

旧数据的原则：

- 若只是开发测试数据，可在人工确认后清理；
- 若存在真实内容，必须先备份；
- BlockSuite Yjs 文档不能被假定为标准 Markdown；
- 若必须保留旧文档，应先做一次性 legacy exporter，而不是把 legacy runtime 永久留在 MVP。

详见 `docs/MIGRATION.md`。
