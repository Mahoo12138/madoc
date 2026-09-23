# HTTP API

## 1. 约定

Base:

```text
/api
```

JSON：

```text
Content-Type: application/json
```

统一 error：

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "item not found"
  }
}
```

不要在 HTTP response 中泄漏 raw SQL error。

## 2. Setup / Auth

```text
GET  /api/setup/status
POST /api/setup/admin

POST /api/auth/sign-in
POST /api/auth/sign-out
GET  /api/auth/session
```

`setup/admin` 只允许未初始化实例调用一次。

CSRF 采用 madoc 自己的命名，不保留 `x-affine-csrf-token`。

例如：

```text
x-madoc-csrf-token
```

## 3. User

MVP：

```text
GET    /api/me
PATCH  /api/me
PUT    /api/me/avatar
DELETE /api/me/avatar
GET    /api/users/:userId/avatar
GET    /api/me/preferences
PATCH  /api/me/preferences
POST   /api/me/password
```

所有接口要求登录，写请求要求 CSRF。姓名 PATCH 接收 `{ "name": "显示名称" }`，返回更新后的 User（含可空 `avatarUrl`）。头像上传使用 multipart `file`，接受不超过 2MB 的 PNG/JPEG；服务端验证尺寸并居中裁切、重编码。头像仅本人或共享 Workspace 成员可读取，移除与上传均返回 User。

偏好 GET/PATCH 返回 `{ preferences, initialized, revision }`，PATCH 只合并传入字段。首次迁移可带 `If-None-Match: *`，已初始化时返回 409；字段与默认值见 [个人设置](ACCOUNT.md)。

密码 POST 接收 `{ currentPassword, newPassword }`，新密码 8–72 字节；当前密码错误返回 400 `INCORRECT_PASSWORD`，成功返回 204。事务内修改密码并撤销其他会话，关闭对应 WebSocket，保留当前会话。

站点管理后续：

```text
GET    /api/admin/users
POST   /api/admin/users
PATCH  /api/admin/users/:id
```

不是编辑器 MVP 阻塞项。

## 4. Workspace

```text
GET    /api/workspaces
POST   /api/workspaces
GET    /api/workspaces/:workspaceId
PATCH  /api/workspaces/:workspaceId
DELETE /api/workspaces/:workspaceId
```

创建：

```json
{
  "name": "Project"
}
```

创建者自动成为 owner。

## 5. Members

```text
GET    /api/workspaces/:workspaceId/members
PATCH  /api/workspaces/:workspaceId/members/:userId
DELETE /api/workspaces/:workspaceId/members/:userId
```

Invite：

```text
GET  /api/workspaces/:workspaceId/invites
POST /api/workspaces/:workspaceId/invites
GET  /api/invites/:token
POST /api/invites/:token/accept
DELETE /api/workspaces/:workspaceId/invites/:inviteId
```

## 6. Items

```text
GET    /api/workspaces/:workspaceId/items
POST   /api/workspaces/:workspaceId/items
GET    /api/items/:itemId
PATCH  /api/items/:itemId
DELETE /api/items/:itemId
POST   /api/items/:itemId/move
```

创建：

```json
{
  "type": "markdown",
  "title": "README",
  "parentId": null
}
```

Folder / Markdown / Whiteboard 共用 metadata API。

## 7. Markdown

首次加载主要走 WebSocket init。

REST 用于可移植内容：

```text
GET /api/items/:itemId/markdown
PUT /api/items/:itemId/markdown
GET /api/items/:itemId/export.md
```

`GET /markdown` 返回最新 Markdown cache。

`GET /export.md` 要求 cacheSeq 达到当前 headSeq，否则返回 409 `EXPORT_NOT_READY`。
可同时传入 `generation` / `minSeq` 两个非负整数查询参数，要求同一代际且 cacheSeq
至少达到 minSeq；允许返回比该最低水位更新的缓存。缺少配对参数、重复参数或非法数字
返回 400；代际不符返回 409 `GENERATION_CHANGED`。登录和 Workspace 读权限照常检查。
成功返回 `text/markdown` 附件，以及 `X-Madoc-Content-Generation`、`X-Madoc-Content-Seq`
响应头，后者为实际 cacheSeq。导出响应使用 `Cache-Control: no-store`。

`PUT /markdown` 的用途是**明确的整篇替换 / 导入**，不能作为实时 autosave endpoint。

整篇替换必须：

1. editor role；
2. 创建新的 Yjs document state（推荐由浏览器完成后走专门 reset protocol）；
3. 不能只改 cache 而不改 Yjs。

因此 MVP 实现时，如果整篇替换语义尚未设计完善，可以先只提供 export 与 import UI，不开放通用 `PUT`。

## 8. Assets

```text
POST /api/workspaces/:workspaceId/assets
GET  /api/assets/:assetId
DELETE /api/assets/:assetId
```

上传：

```text
multipart/form-data
```

限制：

- max size；
- MIME allow/inspection；
- path traversal；
- authenticated workspace editor；
- random server storage key。

Asset download 的公开/私有行为必须跟 Workspace 权限一致。MVP 默认私有，需要 session。

Markdown 图片如果直接 `<img src="/api/assets/id">`，浏览器自然携带同域 cookie。

## 9. Whiteboard Export

白板 PNG / SVG / JSON 优先在浏览器生成。

服务端只需 scene data API（如果需要）：

```text
GET /api/items/:itemId/whiteboard
PUT /api/items/:itemId/whiteboard
```

单人 REST 更新携带 `baseRevision`；revision 冲突返回 `409`。协作中的 scene update 走 WebSocket。

主要编辑同步仍走 WebSocket。

## 10. Realtime

```text
GET /ws
```

详见 `COLLABORATION.md`。

## 11. Health

```text
GET /healthz
```

返回：

```json
{
  "status": "ok"
}
```

可选 `/readyz` 做 DB check，但单实例 MVP 不必过度设计。

## 12. Pagination

Items tree 通常整棵 Workspace 加载，不必强制 pagination。

Admin user list / future history list 再做 cursor / limit。

## 13. Versioning

MVP 不需要 URL `/v1`。

如果未来公开第三方 API，再引入 `/api/v1`。

当前 API 是 madoc frontend 的内部产品 API。

## 内容包原子导入

`POST /api/workspaces/{workspaceId}/imports` 需要 session、CSRF 与 owner / editor 权限。
请求为 multipart/form-data，首项必须是无文件名的 `plan` JSON 字段，其余文件字段名为目标
附件 UUID；完整字段及事务边界见 `CONTENT_IMPORT.md` 和 `core.ContentImport`。

`plan` 包含请求 `id`、目标 `parentId`、单根 `items` 和 `assets`。Item 的 `parentId` 仅引用
本组条目；Markdown 使用 `markdown: {snapshot: base64, markdown: string}`，白板使用
`whiteboard: string`（scene JSON）。附件声明为 `id/itemId/fileName/mime/size/sha256`，
服务端读取真实字节验证，不接受客户端存储路径。所有目标 ID 必须是新 UUID，不覆盖旧记录。

首次成功返回 201，原样重放返回 200；响应为
`{rootId, itemCount, attachmentCount, replayed}`，设置 `Cache-Control: no-store`。
无效数据或缺失附件返回 400，权限 / CSRF 拒绝返回 403，ID / 根名称 / 回执内容冲突返回 409，
超出整体传输大小上限返回 413。文件与数据库联合提交完成后才广播目录更新。
