# Markdown Editor Design

## 1. 目标

madoc Markdown 编辑器应当让用户感受到：

> “这是一个浏览器里的 Typora，而不是一个 Markdown textarea + Preview。”

编辑器核心选择：

- `@milkdown/crepe`
- Milkdown
- ProseMirror
- Yjs collaboration plugin

Crepe 提供高层完整体验；只有 Crepe 无法满足需求时才下沉到 Milkdown plugin。

## 2. MVP Syntax

至少支持：

- Paragraph；
- Heading 1–6；
- Bold / Italic / Strike；
- Link；
- Inline Code；
- Fenced Code Block；
- Ordered / Unordered List；
- Task List；
- Blockquote；
- Horizontal Rule；
- Table；
- Image；
- LaTeX inline / block；
- Markdown paste。

Footnote、Mermaid、Admonition 可后置。

## 3. Markdown Fidelity

madoc 必须把“Markdown 可移植”当产品约束，而不是只提供一个 `.md` 导出按钮。

要求：

- 常用 Markdown round-trip 不出现无意义结构变动；
- 不引入无法序列化到 Markdown 的核心自定义 block；
- 若未来加入专有扩展，必须定义 Markdown representation；
- 导入后不能静默丢掉用户原始文本中的关键内容。

必须建立 fixture：

```text
testdata/markdown/
├── basic.md
├── gfm.md
├── code.md
├── table.md
├── math.md
├── images.md
└── mixed.md
```

对 fixture 做 import → edit model → export 回归测试。

## 4. Canonical State

多人协作时：

```text
Y.Doc = live canonical state
Markdown string = portable representation / cache
```

原因：

直接用一个 Markdown 字符串做 CRDT，会把 AST / selection / rich editor mapping 问题重新推给 madoc。

Yjs 只用于编辑器协作，不代表 madoc 放弃 Markdown。

## 5. Markdown Cache

服务端保存最新 `markdown_cache`，用于：

- REST export；
- search（未来）；
- backup；
- API；
- preview（未来）。

客户端在编辑过程中 debounce 生成 Markdown：

建议初始值：

- 1–2 秒 debounce；
- blur / page hide 时尝试 flush；
- snapshot commit 时强制携带当前 Markdown。

Cache 可以短暂落后于 Yjs live state，但不能成为协同写入的 source of truth。

## 6. Image

Milkdown ImageBlock 的 upload callback 对接：

```text
POST /api/workspaces/:workspaceId/assets
```

返回：

```json
{
  "id": "...",
  "url": "/api/assets/..."
}
```

Markdown 存储 madoc 内部 URL。

后续导出为独立目录时可选择把 assets 一并打包并重写相对路径。

## 7. Source Mode

Typora-like WYSIWYG 是 MVP 主模式。

Source Mode 是后续功能，不允许为了 Source Mode 阻塞 MVP。

若实现 Source Mode：

- 不能同时让两个编辑器实例独立写同一 Y.Doc；
- 切换时必须通过统一 document state；
- 必须测试 selection 与 undo history 行为。

## 8. Autosave

用户不应该看到传统“保存”按钮作为主流程。

状态提示：

```text
Saving…
Saved
Offline
Reconnecting…
```

这里的 Saved 表示：

- Yjs update 已被服务器确认持久化；
- Markdown cache 可能稍后 debounce，但 snapshot 时必须一致。

## 9. Large Documents

MVP 不针对几十 MB 文档优化。

但要避免：

- 每个 keypress 发整个 Markdown；
- 每个 keypress 创建 REST request；
- 每次远程 update 重建整个 editor；
- 无界增长 updates。

Yjs update 使用实时 WS；Markdown cache 使用 debounce；updates 用 snapshot compaction。

## 10. 输入体验

MVP 在 Crepe 既有的所见即所得、选区工具栏和 `/` 快速插入基础上，采用 MarkText 一类桌面 Markdown 编辑器的低干扰输入方式：

- 成对补全圆括号、方括号、花括号和引号；输入已有闭合符号时直接越过；空配对可一次退格删除；
- 选中文本后输入括号或引号时保留内容并包裹选区；输入 `*`、`_` 或反引号时直接应用对应行内格式；
- 光标进入加粗、斜体或行内代码（包括两侧边界）时，在原位置显示真实可编辑的 Markdown 源码，左右键可以逐字符穿过分隔符；展开态继承该范围共有的字体、字重、斜体与代码样式，并按实际字形测量宽度，不添加估算留白；
- 行内公式在正文原位置编辑 `$…$`，下方通过 Mantine Tooltip 实时预览同一公式渲染器的结果；预览不接受输入、不抢占光标，离开编辑态后关闭，不使用独立浮动输入框；先输入空的 `****`、`**`、反引号对或 `$$`，再在中间输入内容时，应自动提升为对应的行内元素；
- 提供专注模式，仅突出当前文本块；提供打字机模式，让当前输入块保持在可视区域中央；
- 显示字符数、预计阅读时间、保存状态和协作人数，并提供紧凑的快捷键说明；
- 标题按 Enter 后保存标题并进入正文，减少鼠标操作。

专注模式和打字机模式属于本地界面偏好，可以保存在浏览器中；文档内容与元数据仍以服务端和 Y.Doc 为准。行内源码是一层本地临时编辑视图，每次输入都通过同一 Markdown parser 写回标准 Milkdown mark 或 math node，不等待失焦才保存。更新仅替换变化片段，协作时用 Yjs 相对位置跟踪编辑范围，并刷新本地源码视图；撤销 / 重做使用同一协作历史。IME 组合期间保留输入，组合结束后将本地修改合入期间收到的远端内容；viewer 不创建可编辑源码视图。

分隔符是实际输入内容，支持左右键逐字符移动和删除。越过边界后恢复相邻正文的格式；删除分隔符后按当前有效 Markdown 语义重新解析。Markdown cache 允许保存空字符串，确保清空文档后导出和刷新不会恢复旧内容。上述增强不得创建第二套持久化编辑器状态，也不得改变 Yjs canonical state、Markdown cache 或实时协作协议。

Source Mode、全文查找替换和完整桌面快捷键体系不在本阶段范围内。
