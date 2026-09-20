# Codex / ChatGPT Work Instructions — madoc MVP

本文是 MVP 编码时的执行约束。

## 1. 先读文档

编码前至少阅读：

1. `README.md`
2. `PRODUCT.md`
3. `PLAN.md`
4. `docs/ARCHITECTURE.md`
5. `docs/MIGRATION.md`
6. 与当前阶段直接相关的设计文档

如果旧代码与 MVP 文档冲突，**MVP 文档描述的产品方向优先**。但涉及数据安全时，不允许仅因为文档要求迁移就直接删除用户数据。

## 2. 禁止继续 AFFiNE compatibility

除 legacy exporter / migration 以外，不得新增：

- AFFiNE GraphQL query/mutation；
- AFFiNE `serverConfig` compatibility；
- `space:*` compatibility；
- `realtime:*` compatibility；
- License stub；
- Payment stub；
- Quota stub；
- BlockSuite dependency；
- AFFiNE frontend package；
- x-affine-* protocol naming。

不要因为“现有前端还调用它”就新增 stub。正确动作是迁移前端调用。

## 3. 分阶段执行

不要一次提交整个 MVP。

每一阶段必须：

- 先阅读受影响代码；
- 给出要删 / 保留 / 重写的明确文件范围；
- 修改；
- 格式化；
- 单元测试；
- `go test ./...`；
- `go vet ./...`；
- `pnpm build`；
- 更新 `STATUS.md`。

在一个阶段通过之前，不进入下一阶段。

## 4. 不确定性的处理

如果不确定点只是局部实现细节，选择最简单、可测试、符合当前文档的方案继续。

如果不确定点会影响以下任一项，停止继续扩大改动，并明确指出冲突：

- 数据是否会丢失；
- 旧数据迁移策略；
- 权限边界；
- collaboration protocol 的兼容性；
- 安全模型；
- 是否需要引入新的常驻服务；
- 是否破坏单二进制目标；
- 是否需要改变已确认的产品边界。

不要用猜测掩盖架构冲突。

## 5. 代码边界

### Go

倾向：

- 标准库；
- chi；
- modernc SQLite；
- `github.com/coder/websocket`；
- 少量、明确依赖。

避免：

- ORM；
- GraphQL；
- DI framework；
- event bus framework；
- CQRS；
- microservice；
- Redis；
- PostgreSQL。

### Frontend

保留：

- React；
- TypeScript；
- TanStack Router；
- TanStack Query；
- Vanilla Extract。

编辑器：

- Milkdown / Crepe。

白板：

- Excalidraw。

不要复制 AFFiNE 的应用层架构。

## 6. Route / Component 大小约束

旧代码中存在几十 KB 的 route component。MVP 不继续这种结构。

原则：

- route 只做路由加载和页面 composition；
- API client 放 `api/`；
- domain UI 放 `features/`；
- editor adapter 独立；
- realtime provider 独立；
- CSS 与页面逻辑分离；
- 单文件明显变得难以审阅时立即拆分。

不要求机械行数上限，但不得再形成一个文件承载整个 Workspace 产品逻辑。

## 7. 数据安全

迁移不能自动 DROP legacy tables。

任何 destructive migration 必须：

- 有备份说明；
- 有显式版本判断；
- 有用户可理解的错误；
- 不静默清空。

## 8. Realtime

### Markdown

服务端不解析 ProseMirror，不要求 Go 实现 Yjs。

Go 只负责：

- auth；
- permission；
- room；
- update sequence；
- update persistence；
- awareness relay；
- snapshot persistence；
- pruning。

### Whiteboard

不要强行统一为 Yjs。

复用 Excalidraw 自身 element version / reconciliation 思路。

## 9. 测试优先级

优先覆盖：

- auth；
- workspace permission；
- item tree；
- update sequence；
- snapshot compaction race；
- reconnect；
- cross-workspace isolation；
- upload path traversal；
- viewer write rejection。

## 10. 不要扩大产品范围

除非用户明确要求，不实现：

- AI；
- Calendar；
- Kanban；
- Database；
- WebDAV；
- Git sync；
- public publishing；
- plugin system；
- mobile native app；
- OAuth。

做完当前阶段后停止扩张。
