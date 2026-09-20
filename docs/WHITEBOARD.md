# Whiteboard Design

## 1. Editor

使用：

```text
@excalidraw/excalidraw
```

madoc 只负责应用 Shell、持久化、权限和 collaboration adapter。

不要 fork 整个 Excalidraw app 作为 madoc 白板。

## 2. 为什么不统一成 Yjs

Markdown 与 Whiteboard 的协同问题不同。

Milkdown 已有成熟 Yjs integration；Excalidraw 自身元素包含协作所需的 identity / version semantics，并且官方应用已经存在成熟的 reconciliation 思路。

为了统一技术栈而把 Excalidraw scene 强塞进 Yjs 会增加：

- element binding；
- file binding；
- deletion semantics；
- ordering；
- reconciliation；
- upstream upgrade 风险。

MVP 原则：

> 产品层统一，协同实现允许不同。

## 3. Scene

持久化内容至少包括：

- elements；
- appState 中需要保存的部分；
- files mapping；
- scene revision。

不要原样持久化所有 transient appState，例如当前 selection、hover、pointer。

定义明确的 `PersistedBoardScene` DTO。

## 4. Asset

Excalidraw 内嵌图片不能依赖浏览器 local-only file。

上传流程：

1. 用户插入图片；
2. 图片上传 madoc Asset API；
3. Excalidraw file id 与 madoc asset id 建立映射；
4. scene 只保存必要 metadata；
5. 加载 scene 时解析 asset URL。

必须防止 orphan asset 无限增长。MVP 可以先保留，再做 GC。

## 5. Realtime

实时消息分两类：

### Durable scene change

改变 document：

- create；
- update；
- delete element；
- image reference。

### Ephemeral presence

不需要落库：

- pointer；
- active tool；
- username / avatar；
- viewport（是否同步 viewport 可选）。

不要把 pointer event 写 SQLite。

## 6. Reconciliation

禁止用简单的“最后到达的整个 scene 覆盖本地 scene”。

至少按 element identity + version 进行合并。

实现优先级：

1. 调研 Excalidraw 官方 app collaboration；
2. 尽量复用其公开算法或按其 semantics 实现；
3. 保留 MIT attribution；
4. 写并发测试。

关键场景：

- A 新建元素 1，B 新建元素 2；
- A/B 同时编辑不同元素；
- A/B 同时编辑同一元素；
- 删除 vs 修改；
- reconnect 后旧 scene 不得覆盖新 scene。

## 7. Persistence

建议：

- realtime scene update 可以高频 relay；
- durable persist 经过 250–500ms debounce；
- pointer move 更高频但仅 relay；
- page hide / disconnect 前 best-effort flush；
- server 收到 durable change 时保存最新 reconciled scene / revision。

若客户端 reconciliation 产生完整 scene，可以持久化完整 scene JSON。MVP 的小团队规模优先简单可靠，而不是过早做 delta database。

后续如果实际白板很大，再引入 snapshot + delta log。

## 8. Self-host Assets

Excalidraw npm 默认字体可能从外部路径获取。madoc 自部署必须把 Excalidraw 所需字体静态文件复制进 web public/build，并设置正确的 `EXCALIDRAW_ASSET_PATH`。

目标是离线 LAN 内也能正常打开白板。

## 9. Export

MVP：

- PNG；
- SVG；
- Excalidraw-compatible JSON。

导出应在浏览器中完成，Go 不需要实现图形 renderer。
