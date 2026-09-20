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
GET /api/me
```

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
POST /api/invites/:inviteId/accept
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
```

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
