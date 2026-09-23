# 单项只读分享与固定发布

分享只向持有随机链接密钥的人公开单个 Markdown / 白板检查点。分享默认关闭；创建、发布更新、撤销和查看管理列表都要求 Workspace owner。viewer、editor 和匿名访客均不能改变发布内容。

## 发布模型

发布必须绑定同一 Item 的手动版本。自动版本不能公开，文件夹不能分享。创建分享时同时固定该版本的标题与正文 / 白板场景；原 Item 后续编辑、改名或移动不会改变外部看到的内容。owner 必须在版本历史中保存新的手动版本，然后明确选择“发布更新”。一次更新原子地切换版本与公开标题。

可创建多个独立链接，每条链接可单独撤销并可选设置 RFC 3339 到期时间。服务端仅保存 256 位随机 token 的 SHA-256 摘要；明文 token 只在创建响应中返回一次。遗失链接时撤销旧链接并新建。撤销或到期会使此后的正文和附件请求返回 404；不能收回访客此前已经读取或下载的副本。

## 公开读取边界

匿名接口只返回固定版本的标题、内容类型、版本名称、发布时刻、正文 / 场景，以及该版本正文实际引用附件的最小元数据。不返回 Workspace、Item、创建者或成员信息。历史版本为防止误删而保留的附件集合与公开内容引用集合分开存储；公开附件接口只授权后者，并在单条 SQL 读取中同时检查 token、有效期、撤销状态、Item 活动状态和附件是否属于当前发布版本。知道同 Workspace 或同 Item 的其他资产 ID 不会获得访问权。

版本附件清单从创建手动版本时编辑器解析出的本地 madoc 图片 URL 生成。迁移前创建的版本没有精确正文附件清单，因此其历史附件不会被匿名接口公开；需要分享图片时，owner 应重新保存一个手动版本并发布该版本。版本正文和固定分享本身不受此迁移影响。

Markdown 公开页使用只读 Milkdown 渲染，禁用协作 provider 和上传能力。发布附件改写到分享专用资源 URL；未发布资源和远程图片不显示，锚点和链接会检查协议，拒绝 `javascript:` 等活动 URL。`/s/{token}` 页面响应附加限制性 CSP、禁止 referrer 与缓存；公开 JSON / 附件均 `no-store` 并设置 `X-Robots-Tag: noindex`。

白板公开页把固定 Excalidraw 场景导出为 SVG 并作为图片显示，不初始化编辑器或协作连接。匿名访问不包含写入 API、公开搜索、目录遍历或评论。

物理删除 Item 会级联删除它的分享记录；软删除期间公开读取返回 404，恢复后尚未撤销且未过期的链接重新有效。备份包含分享 token 摘要和版本引用，但不含可重建的明文 token。

## API

- `GET /api/items/{itemId}/shares`：仅 owner 可列出分享状态，不返回 token。
- `POST /api/items/{itemId}/shares`：owner 提交 `{versionId, expiresAt?}`，返回一次性 `{share, token, url}`。
- `POST /api/items/{itemId}/shares/{shareId}/publish`：owner 提交 `{versionId}`，显式更新固定版本。
- `DELETE /api/items/{itemId}/shares/{shareId}`：owner 撤销链接。
- `GET /api/public/shares/{token}`：匿名读取固定发布内容。
- `GET /api/public/shares/{token}/assets/{assetId}`：匿名读取且仅可读取固定版本引用的附件。

所有写请求要求 session、CSRF 和 owner 权限。资源不存在、无权限、过期、撤销和越界附件统一返回 404，避免通过接口区分 token 状态或枚举资源。

## 验证

`internal/core/shares_test.go` 覆盖 owner 边界、非手动 / 类型不匹配检查、原文编辑不影响发布、显式更新、过期与撤销及附件集合隔离。`internal/api/shares_test.go` 通过真实 HTTP handler 检查匿名访问、token 仅以摘要持久化、分享外附件拒绝、撤销后正文和附件均不可读取。浏览器回归见 `web/e2e/public-share.spec.ts`。
