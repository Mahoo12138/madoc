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
- Markdown paste；
- Footnote（脚注引用、定义及多段落内容）。

Mermaid、Admonition 可后置。

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

- 反斜杠转义的 ASCII 标点按普通文本显示，使用无视觉样式的语义 mark 在 Yjs 中保留转义意图，编辑附近文字时不重新触发格式转换。仅在光标进入某个转义字符时，原位显示该字符前的灰色反斜杠，实际符号保持正文颜色；相邻转义符分别触发，正文中间及另一端不同时展开。局部源码支持逐字符移动、选择、修改、实时协作和撤销，离开后恢复普通文本；输入转义标点时不补全括号，双反斜杠显示为单个字面反斜杠，导出保留必要转义。转义链接括号内的网址保持普通文本；保留基于原始 Markdown token 的 GFM 自动链接，禁用对已解码文本再次自动链接的处理，避免导出再导入时把转义网址重新变成链接。代码区域保持原有字面内容；

- 硬换行（行尾双空格、反斜杠或 Shift+Enter）显示淡色换行箭头，普通软换行不显示，标记不进入导出 Markdown；引用与嵌套引用使用紧凑的 16px 缩进；
- 引用式链接保留完整、折叠与快捷引用形式及定义行，定义在正文中可编辑；修改定义地址 / 标题时更新引用目标，通过 Yjs 同步，导出及刷新后仍保留引用语义；
- 图片选中时在预览上方展开可编辑 Markdown 源码，加载失败时仅展示源码，隐藏破损图片与预览占位，修正地址并加载成功后恢复预览；支持独立和行内图片、替代文本 / URL / 标题、即时同步与撤销。未完成的语法保留在本地输入框中；语法不完整或加载失败时，在源码前显示低干扰的无法渲染图标，不显示红色错误说明，Escape 可还原，viewer 只读。独立图片不再将新导入的替代文本当作缩放比例；既有无 alt 属性的图片保持旧导出表示。旧版本已经丢弃的引用定义或替代文本只能从原始 Markdown 恢复；
- 成对补全圆括号、方括号、花括号和引号；输入已有闭合符号时直接越过；空配对可一次退格删除；
- 选中文本后输入括号或引号时保留内容并包裹选区；输入 `*`、`_` 或反引号时直接应用对应行内格式；
- 光标进入加粗、斜体或行内代码（包括两侧边界）时，在原位置显示真实可编辑的 Markdown 源码，左右键可以逐字符穿过分隔符；展开态继承该范围共有的字体、字重、斜体与代码样式，并按实际字形测量宽度，不添加估算留白；
- 超长行内代码按容器宽度自动换行，连续无空格字符也不撑出段落、引用或列表；源码编辑输入框限制在可用宽度内，隐藏字宽测量不产生页面横向溢出。代码块保留独立的滚动与空白处理；
- 链接在光标进入文字或两侧边界时原位展开 Markdown 源码，支持键盘进入、直接修改文字 / 地址 / 标题，离开后恢复链接渲染；保留嵌套加粗、行内代码及相对路径。禁用既有链接的悬停预览浮层，保留工具栏的新建链接入口；
- 行内公式在正文原位置编辑 `$…$`，下方通过 Mantine Tooltip 实时预览同一公式渲染器的结果；预览不接受输入、不抢占光标，离开编辑态后关闭，不使用独立浮动输入框；先输入空的 `****`、`**`、反引号对或 `$$`，再在中间输入内容时，应自动提升为对应的行内元素；
- 代码块不保留占据正文空间的顶部工具栏：语言入口浮在框外右下方，打开可搜索的语言列表；复制按钮以图标覆盖在框内右上角，不新增一行。悬停、键盘聚焦或打开列表时显示工具，触屏设备保持可见；外部语言入口预留紧凑稳定间距，不因显隐推动后续正文；
- 脚注引用按首次出现顺序显示上标编号，重复引用共用编号；定义区显示 `[^标识]:` 并保留多段落、加粗和行内代码，定义位置保持源文档顺序。引用支持原位源码编辑、Ctrl / ⌘ 点击或源码旁跳转按钮定位定义，定义提供返回上次引用入口；修改唯一的定义标识会同步更新匹配引用，拒绝空标识和重名。未定义引用保留原始语法并提示，后续补定义后自动关联；支持逐字输入、导出再导入、协作及撤销，viewer 仅阅读与跳转；
- 块级公式默认仅展示居中公式；点击预览或方向键进入时展开上方灰底源码，显示 `$$` 边界且不显示行号、语言选择或 PREVIEW 标签，下方独立白底实时预览。`Math ✓` 完成或离开公式时收起源码，空公式保持编辑入口；展开状态仅本地生效，保留 KaTeX 编号、错误恢复、撤销、协作和 `$$` 导出。viewer 仅查看预览；
- 代码块不再自动高亮当前行或强调当前行号；围栏语言后的 `{2,3}` 指定高亮第 2、3 行，也支持 `{2-4,6}` 范围组合。行号从 1 开始，指向代码内容行，不包含围栏；指定高亮与光标无关，编辑后仍按行号计算。围栏元数据随 Yjs、导出和重新导入保留，不影响语法着色、语言切换及块级公式；非法或越界行号不绘制高亮；
- 分割线等块之间的插入位置在聚焦时临时展开为与正文段落等高的空行，显示主题蓝色竖光标；移动或失焦时收起，未输入时不写入空段落或改变 Markdown，开始输入后保持下方块的位置稳定；
- 提供专注模式，仅突出当前文本块；提供打字机模式，让当前输入块保持在可视区域中央；
- 显示字符数、预计阅读时间、保存状态和协作人数，并提供紧凑的快捷键说明；
- 标题按 Enter 后保存标题并进入正文，减少鼠标操作。

专注模式和打字机模式属于账号级 Markdown 偏好，与个人设置面板共享状态；阅读、代码行号和自动配对设置通过同一偏好层驱动，按账号缓存并同步服务器，详见 [个人设置](ACCOUNT.md)。这些偏好不进入内容协同协议；文档内容与元数据仍以服务端和 Y.Doc 为准。行内源码是一层本地临时编辑视图，每次输入都通过同一 Markdown parser 写回标准 Milkdown mark 或 math node，不等待失焦才保存。更新仅替换变化片段，协作时用 Yjs 相对位置跟踪编辑范围，并刷新本地源码视图；撤销 / 重做使用同一协作历史。IME 组合期间保留输入，组合结束后将本地修改合入期间收到的远端内容；viewer 不创建可编辑源码视图。

分隔符是实际输入内容，支持左右键逐字符移动和删除。点击行内元素右侧空白时，光标应落在完整源码末尾（包括链接地址及闭合分隔符），左侧边界对应源码开头；未展开与已展开状态采用一致的边界行为，已展开时保留正在输入的原始内容。越过边界后恢复相邻正文的格式；删除分隔符后按当前有效 Markdown 语义重新解析。Markdown cache 允许保存空字符串，确保清空文档后导出和刷新不会恢复旧内容。上述增强不得创建第二套持久化编辑器状态，也不得改变 Yjs canonical state、Markdown cache 或实时协作协议。

Source Mode、全文查找替换和完整桌面快捷键体系不在本阶段范围内。


## 11. 文档 Outline

文档页左侧的「文件 / Outline」共用 Workspace 侧栏，不额外占用正文宽度：

- 文件列表继续是 Workspace 的唯一目录结构；Outline 只表示当前 Markdown 正文中的 H1–H6 标题，不创建 Item，也不改变文件属性、移动或权限语义。
- 两个标签间切换保留文件夹展开状态和文件列表滚动位置；桌面与移动端共享标签选择及文件夹展开状态。白板和 Workspace 首页显示文件列表，Outline 不可用。
- 大纲按实际标题层级缩进，兼容跳级、重复和空标题；标题文字来自实时编辑器模型，代码块中的 Markdown 示例不会进入大纲。无标题时给出明确空状态。
- 带子标题的分支提供独立展开 / 折叠箭头，点击文字仍定位正文；提供全部展开 / 全部折叠。父分支重新展开时保留内部子分支的折叠状态；隐藏的当前章节由可见折叠父分支高亮提示。
- 折叠只影响当前编辑器会话的本地导航视图，桌面、手机和标签切换共享，重新打开文档默认展开，不写入内容、不进入撤销记录、不同步给其他协作者。普通编辑通过事务映射跟踪标题，远端整体替换通过 Yjs 相对位置跟踪；删除标题不会把折叠状态转移到其他同名标题。
- 本地输入、撤销 / 重做、导入和远程协作更新后刷新大纲；切换文档时按 Item 隔离大纲，旧会话销毁不得清空新文档的大纲。
- 点击标题定位正文，避开顶部固定栏；编辑者可从目标标题继续输入，viewer 将键盘焦点移到目标标题但不产生内容写入。正文滚动或编辑位置变化时突出当前章节。
- 移动端在内容导航抽屉中提供同一组标签，点击标题先关闭抽屉、解除页面滚动锁，再定位正文；点击文件后关闭抽屉。

Outline 为本地派生 UI，不新增持久化字段、服务端内容解析或协同协议。
