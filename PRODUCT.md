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

Workspace 基础设置由 owner 管理：

- 桌面端从 Workspace 菜单打开，移动端从顶部设置按钮打开。
- 可修改 Workspace 名称；名称不能为空，保存后同步更新当前 Shell 和 Workspace 列表。
- 删除前展示影响范围，并要求输入完整 Workspace 名称确认；取消不修改数据，请求失败保留输入以便重试，成功后返回 Workspace 列表。
- editor / viewer 不显示设置入口，后端继续独立校验 owner 权限。
- 设置只使用既有 Workspace REST API，不引入新的数据模型或协作协议。

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


## 11. 成功标准

madoc 的成功不是“实现了 AFFiNE 百分之多少”，而是：

- 一个新用户能在几分钟内启动；
- 依赖只有一个 madoc 服务和一个数据目录；
- 两个人能稳定协作编辑 Markdown；
- 两个人能稳定协作白板；
- 重启服务数据不丢；
- `.md` 可以可靠导出；
- 不看 AFFiNE 源码，也能继续维护 madoc。
