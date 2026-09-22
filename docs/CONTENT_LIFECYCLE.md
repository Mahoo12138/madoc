# Item 生命周期：回收站基础

## 范围与状态

阶段 1 第一部分实现 Item / 活动子树软删除和批次恢复 API。普通 Item 删除不再执行
物理 DELETE。回收站界面、owner 手动彻底删除和目录事件广播尚待后续部分接入。
没有定时清理，也没有默认 30 天保留期限。Workspace 删除仍是独立的 owner 操作，
保留原有名称确认和永久删除语义。

## 数据与迁移

增量迁移 `0007_item_trash.sql` 新增 `item_deletion_batches` 与
`items.deletion_batch_id`。历史条目默认 NULL，保持活动状态；不删除或重写正文、
Markdown update / receipt / generation、白板 revision、附件 metadata 或文件。
升级前仍按 `BUILD.md` 停服并备份数据库、assets 和 server.secret。

批次保存 Workspace、删除根 Item、原父目录、删除者和时间。Item 保留原 parent_id、
sort_key 和内容关联。删除只遍历当时仍活动的子树，并在一个事务中标记同一批次；
早先单独删除的子项保留自己的批次，不会随父目录恢复而复活。

原父目录 ID 是恢复线索，不是永久保留该目录的外键约束。未来彻底删除父目录时，
必须先处理其他删除批次的根 parent_id，避免现有 ON DELETE CASCADE 误删其他批次；
不能直接执行原来的递归物理删除。此版本尚无 Item 彻底删除入口。

## 访问与并发

正常 Item 列表、详情及 ItemAccess 只返回活动条目。Markdown 读取 / 导出 / update /
cache / snapshot / reset，以及白板读取 / CAS 更新，在同一数据库事务内检查角色和
活动状态，再读取或修改内容。已进回收站的 Item 返回 NOT_FOUND；旧 WS 连接的写入
和消息接收继续复用这一权限检查，不因先前 join 过房间而绕过。

重命名、移动与创建子项同样拒绝已删除目标或父目录。上传在写入 metadata 的语句中
重新验证写权限和活动 Item，避免文件传输期间发生删除仍把新资产挂到已删除条目。
失败上传移除本次生成的文件。

附件不随软删除清理或断开关联，读取仍遵守现有 Workspace 成员边界。附件可能被
同 Workspace 的其他内容引用；不以原始 item_id 的删除状态推导资源无用。
本部分不新增附件垃圾回收，不改变现有显式附件删除操作。

## API

| 请求 | 行为 |
| --- | --- |
| DELETE /api/items/{itemId} | owner/editor 将活动子树移入回收站，成功 204 |
| GET /api/workspaces/{workspaceId}/trash | owner/editor 查看本 Workspace 的批次根与条目数量 |
| POST /api/workspaces/{workspaceId}/trash/{batchId}/restore | owner/editor 恢复该 Workspace 指定批次，成功 204；要求 CSRF |

恢复请求 `{}` 使用原位置。原父目录不可用时返回 409
`RESTORE_DESTINATION_REQUIRED`，不隐式搬到根目录，也不局部恢复。

显式选择目标：`{"destination":{"parentId":"folder-id"}}`；
显式恢复到 Workspace 根：`{"destination":{"parentId":null}}`。
目标必须是同 Workspace 的活动目录；不能恢复到自身、同批次的已删除子目录或普通文件。
显式目标将批次根追加到目标目录末尾，内部层级和排序保留；原位恢复保留原排序值。

viewer / 非成员不能查看或操作回收站。恢复清除指定批次全部 Item 的删除标记并移除
批次记录，事务失败全部回滚。重复恢复返回 NOT_FOUND。正文和代际不因软删除 / 恢复重置。

## 后续交付

- 回收站 UI：批次根、内部条目查看、恢复位置选择与失败反馈。
- owner 手动彻底删除：独立确认、跨批次子树保护，附件清理仍需引用依据。
- 目录变化 / 删除通知：让其他客户端立即退出失效内容，保留未提交本地副本。
- 搜索、收藏与最近访问：只展示活动 Item，恢复后重新进入有效导航。

## 验证

`trash_test.go` 覆盖子树与早期批次隔离、正文 / 白板 / receipt / 附件关联保留、
失效原目录和显式目标、权限 / Workspace 隔离、事务失败回滚及 Workspace 删除。
`trash_migration_test.go` 从旧 schema 升级两次，校验现有内容和资源关联不变。
`trash-api.spec.ts` 用真实 HTTP 和编辑器验证删除后拒绝读取、按批次恢复正文 / 白板 /
附件及明确的恢复位置冲突。既有撤权与本地恢复测试继续覆盖删除后的救援路径。
