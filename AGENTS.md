# Work Instructions — madoc MVP

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
- Vite；
- TanStack Router；
- TanStack Query；
- Mantine；
- Vanilla Extract。

### Mantine / Vanilla Extract 边界

Mantine 负责基础 UI primitive 和成熟交互组件：

- Button；
- ActionIcon；
- Input / Select；
- Menu；
- Popover；
- Tooltip；
- Modal；
- Drawer；
- Tabs；
- Avatar；
- Notification；
- Form controls。

Vanilla Extract 负责：

- Workspace Shell；
- Sidebar；
- Item Tree；
- 编辑器布局；
- Whiteboard 布局；
- 响应式；
- madoc 自定义视觉；
- Mantine 无法覆盖的复杂样式。

规则：

- Mantine 已提供的通用组件，不自行重复造轮子；
- 不要为了简单布局滥用 Mantine style props，复杂页面样式统一进入 Vanilla Extract；
- 不创建第二套完整的颜色、圆角、间距 token；
- Mantine Theme 为基础 token source；
- Vanilla Extract 优先消费 Mantine CSS variables；
- Milkdown / Excalidraw 的自定义主题尽量映射到同一套 CSS variables。

### 设置与管理表单

- 管理页、设置页、信息卡片等常驻容器默认展示当前值和操作入口，不直接平铺可编辑输入框、选择器及保存 / 取消按钮。
- 文本输入由明确的「编辑」或「创建」入口打开 Popover、Modal、Drawer 等弹出层；多栏目管理弹窗的常驻内容只展示当前值和入口。选择器、开关等非文本偏好直接调整并保存，不要求单独进入编辑态。
- 文本编辑弹层提供保存与取消；取消恢复原值，保存失败保留草稿并允许重试，提交期间防止重复提交与误关闭。只读角色只显示值，不出现可写控件。
- 登录、首次创建、独立向导、搜索与编辑器正文等以输入为主要目的的界面，以及危险操作已触发后的确认表单，不适用常驻设置容器的展示规则。

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
