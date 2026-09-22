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

`onChange` 不等于正文已变化：持久化前提取 elements、上述 appState 白名单和 files，
与上一次场景序列化结果比较。工具、选区、指针和相同场景的重渲染不会新增保存任务，
避免 ACK → 重渲染 → 再写入的循环。远端场景事件不能确认本地待提交修改；Saved
必须等待当前本地修改版本获得 ACK。此规则不改变现有白板场景协议。

收到远端场景时调用已安装 Excalidraw 的 `reconcileElements`，与当前包含删除标记的
本地元素按其版本规则合并，避免较旧整篇场景清除本地元素。每个 Item 使用独立编辑器
实例，切换白板不会把上一张画布的本地元素带入新 Item。

白板 ACK 的 `clientUpdateId` 对应请求 envelope 的 `requestId`。前端按已发送请求 ID
确认完整场景版本，不按 ACK 到达次数确认；新版本完整场景的 ACK 可以覆盖更早本地版本，
未知或重复 ACK 不推进状态。待确认场景每 3 秒重试，沿用当前请求 ID。
断线后先 join、合并 init，再发送最新待确认场景；离线不把正文或指针放进通用发送队列。
重试依赖元素版本合并保持内容一致，服务端 revision 仍可能递增，不宣称 revision 去重。

明确拒绝保存时停止自动发送、进入只读并提供“下载本地白板副本”；导出文件名带
“本地副本”。这里的待提交状态仍在内存中，白板跨刷新 / 关闭恢复尚待接入，不能显示
“已保存到此设备”。部署时服务与内嵌前端一起升级；旧服务没有对应 ID 时新前端不会
误报 Saved。

## 8. Self-host Assets

Excalidraw npm 默认字体可能从外部路径获取。madoc 自部署必须把 Excalidraw 所需字体静态文件复制进 web public/build，并设置正确的 `EXCALIDRAW_ASSET_PATH`。

目标是离线 LAN 内也能正常打开白板。

## 9. Export

MVP：

- PNG；
- SVG；
- Excalidraw-compatible JSON。

导出应在浏览器中完成，Go 不需要实现图形 renderer。
