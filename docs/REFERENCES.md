# References

更新时间：2026-09-20

这些项目是实现参考，不代表 madoc 要复制其整个架构。

## Mantine

- https://mantine.dev/
- https://mantine.dev/theming/theme-object/
- https://mantine.dev/styles/css-variables/

在 madoc 中：

- Mantine 负责基础 UI primitive；
- Mantine Theme 是基础设计 token；
- Vanilla Extract 负责应用级定制布局和视觉；
- 优先消费 Mantine CSS variables，避免维护第二套完整 token。

## Vanilla Extract

- https://vanilla-extract.style/

主要用于 madoc 的 Workspace Shell、复杂布局、响应式和产品级定制样式。


## Milkdown

主页 / Docs：

- https://milkdown.dev/
- https://milkdown.dev/docs/guide/getting-started
- https://milkdown.dev/docs/guide/using-crepe
- https://milkdown.dev/docs/api/crepe
- https://milkdown.dev/docs/guide/collaborative-editing

重点：

- Crepe 是 Milkdown 上层的完整 Markdown editor；
- 提供 table、CodeMirror、image、block editing、toolbar、LaTeX 等；
- Milkdown 官方 collaboration 使用 Yjs；
- `@milkdown/plugin-collab` 可绑定 Y.Doc 与 awareness；
- provider 可以由 madoc 自己实现，不要求使用 y-websocket server。

## Yjs

- https://github.com/yjs/yjs
- https://docs.yjs.dev/

madoc 使用 Yjs 解决 Markdown editor realtime collaboration。

Go 服务端不必实现 Yjs document semantics；MVP 使用 update log + client-generated snapshot。

## Excalidraw

- https://github.com/excalidraw/excalidraw
- https://docs.excalidraw.com/
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation
- https://github.com/excalidraw/excalidraw-room

重点：

- editor npm package 可嵌入 React；
- Excalidraw 主项目为 MIT；
- 官方应用有 realtime collaboration；
- npm editor 不应被误认为自带完整 drop-in collaboration backend；
- self-host 需要处理字体 assets；
- collaboration / reconciliation 参考官方 app 和 room server。

若从官方源码复制或改写代码，保留对应 MIT copyright / attribution。

## Go WebSocket

- https://github.com/coder/websocket

选择理由：

- minimal；
- idiomatic；
- `context.Context`；
- zero dependencies；
- 不再需要 Socket.IO compatibility。

## AFFiNE / BlockSuite

- https://github.com/toeverything/AFFiNE
- https://github.com/toeverything/blocksuite

MVP 中只作为：

- UI/UX 参考；
- 协同产品交互参考；
- legacy exporter 参考。

禁止重新建立 AFFiNE API compatibility。

## Typora

- https://typora.io/

只作为 Markdown 编辑体验参考。

madoc 不复制其专有实现。
