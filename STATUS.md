# madoc MVP Status

更新时间：2026-09-20

## 当前结论

项目仍处于 MVP 阶段。本轮工作是内部架构重构，不是正式版本升级，也不引入公开 API 版本号。

madoc 已从 AFFiNE-compatible 原型切换为 madoc-native 协同 Markdown Workspace：Go 单二进制、SQLite、本地 Asset、REST、原生 WebSocket、Milkdown/Crepe 和 Excalidraw。

## 已完成

- [x] 为基线提交 `4657ab6` 创建 `pre-mvp-affine-port` tag
- [x] 删除 GraphQL、Socket.IO、`space:*` / `realtime:*` compatibility
- [x] 删除 BlockSuite、`@madoc/doc`、`@madoc/editor`
- [x] 建立事务化 `schema_migrations` 与 canonical MVP schema
- [x] 启动时拒绝 legacy schema，不自动删除旧表
- [x] 提供显式 `maintenance legacy-clean --confirm`
- [x] 建立 User、Session、Workspace、Membership、Invite、Item、Asset 数据模块
- [x] 建立统一 `/api` REST error envelope、session 与 CSRF
- [x] 建立 owner/editor/viewer 权限、最后 owner 与 Workspace 隔离
- [x] 建立 folder/markdown/whiteboard Item tree 与安全移动
- [x] 使用 `github.com/coder/websocket` 建立 multiplex realtime hub
- [x] 建立 Mantine + Vanilla Extract Workspace Shell
- [x] 接入 Milkdown/Crepe、Yjs、Markdown cache、ACK、重连与 compaction
- [x] 接入 `.md` 导入/导出和私有图片上传
- [x] 接入 Excalidraw scene persistence、revision CAS、element reconciliation 与导出
- [x] 接入 Whiteboard room、presence、remote pointer 与 durable scene update
- [x] 自托管 Excalidraw 字体与静态资源
- [x] 建立 `/healthz`、安全 header、Origin 校验、消息大小限制与 graceful shutdown
- [x] 建立一致性备份、验证与可回滚恢复命令
- [x] 更新 Vite proxy、Docker、`go:embed` 与数据目录说明

## 当前验证

- `go test ./...`：通过
- `go test -race ./...`：通过
- `go vet ./...`：通过
- `pnpm --dir web typecheck`：通过
- `pnpm --dir web build`：通过
- Playwright 首次启动、邀请注册、双窗口 Markdown、双窗口 Whiteboard 与导出：通过
- 浏览器深链接刷新、Markdown 单次初始化、桌面和移动端 Workspace Shell：通过
- Docker image、`/healthz`、数据卷、secret `0600`：通过
- SQLite、Asset、server secret 备份及恢复回滚：通过

## 发布门槛

- [x] `go test ./...`
- [x] `go test -race ./...`
- [x] `go vet ./...`
- [x] 前端 typecheck 与 production build
- [x] Docker image 与持久卷 smoke test
- [x] 备份 / 恢复端到端 smoke test
- [x] 双窗口 Markdown / Whiteboard 协作回归
- [x] Playwright 核心流程自动化
- [x] 修复 Workspace 新建文档标题逐字输入时读取已失效事件 currentTarget 的问题，并加入 E2E 回归覆盖
- [x] 修复 Markdown 标题 / 段落键盘输入回归断言，并将协同光标与远程选区改为 madoc 自定义样式
- [x] 修复 Markdown h1-h6 字号阶梯，避免 h3-h6 继续使用 Milkdown 默认字号

## 明确不进入当前 MVP

AI、Calendar、Database/Kanban、Git、WebDAV、公开发布、插件系统以及 AFFiNE/BlockSuite 内容转换器均不在当前范围。
