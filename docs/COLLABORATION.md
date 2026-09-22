# Collaboration Protocol

## 1. 总体原则

一条 `/ws` 连接承载所有实时能力。

所有消息必须先经过：

1. authenticated session；
2. Item lookup；
3. Workspace membership；
4. role permission。

服务器绝不能仅凭客户端提供的 Workspace ID 信任权限。

## 2. Envelope

MVP 优先可调试 JSON：

```json
{
  "type": "markdown.join",
  "requestId": "optional-id",
  "itemId": "item-id",
  "payload": {}
}
```

Yjs binary update 初期使用 base64：

```json
{
  "type": "markdown.update",
  "itemId": "item-id",
  "payload": {
    "update": "<base64>"
  }
}
```

实际测量性能后可改 binary framing，但不能让 framing 优化阻塞 MVP。

## 3. Common

Client → Server：

```text
hello
room.leave
ping
```

Server → Client：

```text
hello.ok
error
pong
presence.changed
```

连接建立后 server 返回当前 user basic profile。

## 4. Markdown Join

Client：

```json
{
  "type": "markdown.join",
  "itemId": "doc-1"
}
```

Server：

```json
{
  "type": "markdown.init",
  "itemId": "doc-1",
  "payload": {
    "snapshot": "<base64|null>",
    "snapshotSeq": 120,
    "updates": [
      { "seq": 121, "update": "<base64>" },
      { "seq": 124, "update": "<base64>" }
    ],
    "headSeq": 124
  }
}
```

注意 `seq` 可以使用数据库中全局自增 update ID，不要求每个 Item 连续。

客户端：

1. apply snapshot；
2. 按 seq 排序 apply updates；
3. 建立 local Y.Doc；
4. 开始发送新 update。

## 5. Markdown Update

Client：

```json
{
  "type": "markdown.update",
  "itemId": "doc-1",
  "payload": {
    "clientUpdateId": "uuid",
    "update": "<base64>"
  }
}
```

Server：

1. permission；
2. SQLite transaction append；
3. 得到 `seq`；
4. ACK sender；
5. broadcast room。

ACK：

```json
{
  "type": "markdown.update.ack",
  "itemId": "doc-1",
  "payload": {
    "clientUpdateId": "uuid",
    "seq": 125
  }
}
```

广播：

```json
{
  "type": "markdown.update.remote",
  "itemId": "doc-1",
  "payload": {
    "seq": 125,
    "update": "<base64>",
    "userId": "..."
  }
}
```

必须用 `clientUpdateId` 做连接级幂等 / retry 防重策略，或在数据库增加唯一键避免重连重复 append。

## 6. Awareness

Awareness 不落 SQLite。

可以直接转发 Yjs awareness payload：

```text
markdown.awareness
```

断开连接时必须清理该 connection 的 awareness。

不要把 awareness 存为 document state。

## 7. Snapshot Compaction

这是 Markdown persistence 的关键。

Go 不解析 Yjs，因此 snapshot 由客户端生成。

### 条件

当：

- update 数量超过阈值，例如 200；
- 或累计 update bytes 超过阈值；
- 或文档长时间编辑后达到周期阈值；

server 向一个已同步 client 请求 snapshot：

```json
{
  "type": "markdown.snapshot.request",
  "itemId": "doc-1",
  "payload": {
    "baseSeq": 500
  }
}
```

被请求 client 必须确认本地已经应用所有 `seq <= 500` 的 update。

然后：

```json
{
  "type": "markdown.snapshot.commit",
  "itemId": "doc-1",
  "payload": {
    "baseSeq": 500,
    "snapshot": "<Y.encodeStateAsUpdate(doc)>",
    "markdown": "# current markdown..."
  }
}
```

Server transaction：

1. 再次检查 Item；
2. 保存 snapshot / `snapshot_seq=500` / markdown cache；
3. 删除该 Item `seq <= 500` 的 update；
4. **绝不删除 `seq > 500` 的并发 update。**

这是并发安全边界。

不能实现成：

```text
merge everything -> delete all updates
```

因为 snapshot 生成期间仍可能产生新 update。

## 8. Snapshot Producer

不能信任任意 viewer。

只有：

- owner；
- editor；

可以提交 snapshot。

Server 可选择 room 中：

- 已确认 head seq 最高；
- 最近活跃；
- RTT 较低；

的客户端。

MVP 可以简单选择第一个已 caught-up 的 editor。

如果当前没有客户端，不执行 compaction。

## 9. Markdown Cache Update

单独允许：

```text
markdown.cache.update
```

客户端 1–2 秒 debounce：

```json
{
  "type": "markdown.cache.update",
  "itemId": "doc-1",
  "payload": {
    "markdown": "...",
    "seenSeq": 520
  }
}
```

Cache 不是 CRDT authoritative state。

Server 只接受 editor，并记录 `cache_seq`。若收到明显落后的 `seenSeq`，可拒绝覆盖更新 cache。

snapshot commit 时的 Markdown 优先级最高。

## 10. Reconnect

Client 记录最后 acknowledged seq 只是优化，不是 source of truth。

重连最简单可靠流程：

1. 新建 / 复用 local Y.Doc；
2. `markdown.join`；
3. 应用 server snapshot + updates；
4. Yjs 自然 merge local offline state；
5. 本地产生的新 update 发给 server。

必须测试 offline edit merge。

## 11. Whiteboard Protocol

基础：

```text
whiteboard.join
whiteboard.init
whiteboard.scene.update
whiteboard.scene.ack
whiteboard.pointer
whiteboard.presence
```

`pointer` / `presence` 不落库。

`scene.update` 携带：

- elements / changed elements；
- client revision；
-必要 scene metadata。

Server 分配 revision 并 relay。

客户端使用 Excalidraw element reconciliation，不用 whole-scene last-write-wins。

## 12. Backpressure

单 connection 发送缓冲必须有上限。

慢客户端不能无限占内存。

策略：

- durable update：不可静默丢；超限时断开客户端并让其重连恢复；
- ephemeral pointer：允许 drop；
- presence：允许合并覆盖旧状态。

## 13. Security

WebSocket：

- 检查 Origin；
- cookie session；
- 每次 join 查 membership；
- 每次 durable write 查 write permission；
- 房间广播接收者及瞬时消息发送者重新校验 session / Item read permission，失效时退订该 Item；
- presence 列表仅包含当前有效成员，房间订阅不作为永久授权；
- 消息大小限制；
- update 大小限制；
- rate limit 基础防护；
- 禁止通过 itemId 读取其他 Workspace。

## 14. Markdown content generation

`markdown.init` 含整数 `generation`。所有 `markdown.update`、
`markdown.cache.update`、`markdown.snapshot.commit` payload 必须包含此值。
相应 ACK、远端正文更新及快照请求也携带代际。正文重置递增代际，与清除旧状态
同事务提交；服务端写入时在事务中校验编号。缺少编号返回 `GENERATION_REQUIRED`，
不匹配返回 `GENERATION_CHANGED`。客户端不得将不同代际的 Y.Doc 合并。

升级前已打开的旧客户端需要先确认保存、关闭，再随服务升级重新打开。
