# Product

## 1. 产品定义

madoc 是一个轻量、自部署、多人协同的 Markdown Workspace。

它不是 AFFiNE 的 Go 版本，也不是 Notion 的完整替代品。madoc 只把两个最常用的知识工作载体做好：

1. Markdown 文档；
2. 无限白板。

产品在一个统一 Workspace 中管理这两种 Item，但不试图将它们统一为一种复杂 block model。

## 2. 目标用户

主要用户：

- 个人开发者；
- 家庭；
- 2–10 人的小团队；
- 希望自托管工作资料的人；
- 重视 Markdown 可移植性的人；
- 不愿维护 PostgreSQL / Redis / S3 等完整 SaaS 基础设施的人。

主要使用方式：

- 写技术文档；
- 写会议记录；
- 维护项目说明；
- 在浏览器中多人协同编辑 Markdown；
- 使用白板做系统设计、流程梳理和头脑风暴；
- 将内容导出为标准 `.md` 或 Excalidraw-compatible 数据。

## 3. 产品人格

**Quiet / Focused / Local-first-minded / Self-hosted-friendly**

UI 应该安静、克制，把内容本身放在首位。可以参考 Typora、Linear、AFFiNE、Obsidian 的部分体验，但不能重新长成一个复杂后台。

## 4. 核心对象

### User

站点用户。服务端管理员只是一种站点级权限，不影响普通 Workspace 权限模型。

### Workspace

内容与成员的隔离边界。

### Item

Workspace 内统一的树节点。

Item 类型：

- `folder`
- `markdown`
- `whiteboard`

Folder 不拥有编辑器状态；Markdown 和 Whiteboard 分别拥有自己的内容状态。

### Asset

图片、白板附件等二进制资源。

## 5. Markdown 体验

目标不是“带预览窗格的 Markdown textarea”，而是接近 Typora：

- 所见即所得；
- Markdown 语义不丢失；
- Heading / List / Quote / Code / Table / Link / Image；
- GFM 常用能力；
- LaTeX；
- 快捷键；
- Slash command 可保留，但不能主导体验；
- 粘贴 Markdown 可直接转换；
- 可随时导出标准 Markdown；
- 后续可增加 Source Mode，但不是 MVP 阻塞项。

编辑器优先使用 Milkdown Crepe，在需要时下沉到 Milkdown / ProseMirror plugin 层扩展。

## 6. Whiteboard 体验

白板使用 Excalidraw 作为编辑器核心。

MVP 要求：

- 无限画布；
- 基本图形；
- 文本；
- 箭头；
- 图片；
- Undo / Redo；
- 导出 PNG / SVG / Excalidraw JSON；
- 多人在线状态；
- 多人同步 scene；
- 刷新后恢复；
- 服务重启后恢复。

不把白板强制改造成 Yjs 文档。

## 7. Workspace Shell

桌面端的主结构：

```text
┌──────────────┬─────────────────────────────────────────────┐
│ Workspace    │                                             │
│              │                  Content                    │
│ Search       │                                             │
│              │       Markdown Editor / Whiteboard          │
│ Files        │                                             │
│ ├─ README    │                                             │
│ ├─ Design    │                                             │
│ └─ Board     │                                             │
│              │                                             │
│ Members      │                                             │
│ Settings     │                                             │
└──────────────┴─────────────────────────────────────────────┘
```

Markdown 页面尽量最大化正文区域；Whiteboard 页面尽量最大化画布。

工作区列表 `/workspaces` 是选择工作区的独立入口页，不设置侧栏或导航抽屉。顶部展示品牌和账号入口，内容区以无分隔线的紧凑横向卡片展示工作区标识、名称与成员角色和进入箭头，宽屏三列、中屏两列、手机单列；名称与角色紧密分组，短名称卡片桌面约 104px、手机约 96px 高，长名称完整换行并自然增高。整张卡片作为可键盘访问的真实链接，加载骨架沿用卡片布局，空列表提供创建引导。新建工作区通过文本输入弹层完成，取消清空草稿，失败保留输入，提交期间防止重复提交和误关闭，成功后打开新工作区。

工作区管理面向当前工作区的所有成员，修改基础设置由 owner 管理：

- 桌面端从工作区菜单的「管理」进入独立页面，移动端从顶部更多操作中的「管理」进入。页面沿用工作区的左侧导航与内容区布局，包含工作区信息、成员管理和活动记录；所有成员可查看成员与活动，owner 可管理成员和邀请，owner / editor 可导出工作区 ZIP。
- 管理页的成员 / 邀请页签使用 Mantine outline 样式；成员、邀请和活动记录采用浅灰底独立卡片，以间距替代列表分隔线，日期分组和创建入口保持无框布局。窄屏身份与操作上下排列，长内容不会撑出页面。
- owner 从工作区信息页打开弹层修改名称；名称不能为空，保存后同步更新当前 Shell 和 Workspace 列表。
- 工作区信息页展示介绍或「未设置介绍」，owner 从「编辑介绍」打开多行文本弹层，最多 500 个 Unicode 字符，可留空清除；取消丢弃草稿，失败保留草稿重试，提交期间阻止重复提交与误关闭。介绍持久化后更新侧栏摘要，其他已打开的工作区页面通过既有工作区事件刷新；editor / viewer 只能查看。
- 删除前展示影响范围，并要求输入完整 Workspace 名称确认；取消不修改数据，请求失败保留输入以便重试，成功后返回 Workspace 列表。
- editor / viewer 可进入只读管理界面，但不能修改名称或删除工作区；后端继续独立校验 owner 权限。
- 设置使用既有 Workspace REST API；介绍仅作为 Workspace 元数据增量字段，不引入新的对象或协作协议。

## 8. 权限

Workspace MVP 只需要三档：

- `owner`
- `editor`
- `viewer`

权限原则：

| 操作 | Owner | Editor | Viewer |
|---|---:|---:|---:|
| 查看 Workspace | ✓ | ✓ | ✓ |
| 编辑 Markdown / Whiteboard | ✓ | ✓ | |
| 新建 / 移动 / 删除 Item | ✓ | ✓ | |
| 上传 Asset | ✓ | ✓ | |
| 管理成员 | ✓ | | |
| 修改 Workspace 设置 | ✓ | | |
| 删除 Workspace | ✓ | | |

站点管理员可以管理用户，但不应默认绕过 Workspace 数据权限读取私人内容；若未来增加管理员审计能力，应单独设计并显式提示。

## 9. 明确不做

MVP 不能因为旧代码已经存在而恢复这些方向：

- AFFiNE GraphQL compatibility；
- AFFiNE Socket.IO protocol compatibility；
- AFFiNE license / payment / quota compatibility；
- BlockSuite；
- AFFiNE `userspace`；
- Database block；
- Edgeless Document；
- Calendar；
- Copilot；
- SaaS subscription；
- cloud/local workspace mode；
- 插件市场。


## 10. 前端设计系统

madoc MVP 的基础 UI 技术栈固定为：

```text
React + TypeScript
├── Vite
├── TanStack Router
├── TanStack Query
├── Mantine
└── Vanilla Extract
```

职责边界：

### Mantine

负责成熟、通用、可复用的 UI primitive 与交互组件，例如：

- Button
- ActionIcon
- TextInput
- Select
- Menu
- Popover
- Tooltip
- Modal
- Drawer
- Tabs
- Avatar
- Badge
- Loader
- Notification
- Form controls

原则：

> Mantine 已经成熟提供的通用 UI，不再自行从零实现。

### Vanilla Extract

负责产品级样式：

- Workspace Shell；
- Sidebar；
- Item Tree；
- Markdown 编辑器布局；
- Whiteboard 布局；
- 页面间距；
- Responsive；
- 自定义状态；
- 动效；
- madoc 品牌视觉；
- Mantine 无法覆盖的定制样式。

### Design Token

**不维护第二套平行 token。**

Mantine Theme 是基础设计系统。Vanilla Extract 应尽量消费 Mantine 暴露的 CSS variables，例如：

```css
var(--mantine-color-gray-1)
var(--mantine-color-gray-6)
var(--mantine-primary-color-filled)
var(--mantine-radius-md)
```

不要再另外建立一整套：

```text
madocGray100
madocGray200
madocBlue500
...
```

Milkdown 与 Excalidraw 的视觉适配也应尽量映射到同一套 Mantine Theme / CSS Variables。

### 设置界面的编辑入口

工作区管理与个人设置使用独立页面，沿用工作区左侧导航加内容区的布局。管理信息、成员邀请和分享管理默认展示当前值或操作摘要；文本输入由明确的「编辑」「创建」入口打开弹层，并提供保存与取消。Markdown 偏好等选择器、开关直接调整并自动保存。取消文本编辑恢复原状态，保存失败保留草稿，权限不足的用户只看到只读信息。登录、首次创建和已触发的危险操作确认等输入本身就是当前任务的界面可直接展示表单。

编辑器的版本弹窗分为历史记录与 owner 专属的只读分享页签。历史记录使用检查点列表与预览的双栏布局，手机端上下排列；版本列表与正文 / 差异独立滚动，保存和恢复表单按入口打开。右侧大纲的全部展开、全部折叠与关闭按钮集中于标题行，目录单独滚动；保留既有宽度、标题层级和缩进。


## 11. 成功标准

madoc 的成功不是“实现了 AFFiNE 百分之多少”，而是：

- 一个新用户能在几分钟内启动；
- 依赖只有一个 madoc 服务和一个数据目录；
- 两个人能稳定协作编辑 Markdown；
- 两个人能稳定协作白板；
- 重启服务数据不丢；
- `.md` 可以可靠导出；
- 不看 AFFiNE 源码，也能继续维护 madoc。
