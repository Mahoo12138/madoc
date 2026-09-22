# 个人收藏与最近访问

## 数据边界

`0008_personal_items.sql` 新增 `item_favorites` 和 `item_visits`，均以 `(user_id,item_id)`
为主键。收藏记录首次收藏时间；访问记录只保留最近一次访问时间，不保存逐次行为日志。
不改变 Item 标题、目录顺序、`updated_at`、Markdown 或白板正文。最近访问不能被解释为
最近修改，也不显示其他用户的访问记录。

用户必须有 Item 读取权限，viewer 可管理自己的导航状态。权限校验与状态写入在同一
事务；列表的成员校验与数据读取在同一只读事务。userId 始终来自当前会话，客户端不能
指定其他用户。个人变化不广播到 Workspace 公共频道。

## API

| 接口 | 行为 |
|---|---|
| GET /api/workspaces/{workspaceId}/personal-items | 返回当前账号的 favorites 和 recent |
| PUT /api/items/{itemId}/favorite | 收藏，重复请求不重复插入或改变首次收藏顺序，204 |
| DELETE /api/items/{itemId}/favorite | 取消收藏，重复请求幂等，不清除访问记录，204 |
| POST /api/items/{itemId}/visit | 记录当前服务器时间，重复访问更新同一记录，204 |

所有写入要求 CSRF。列表只包含指定 Workspace 的活动 Item。favorites 按收藏时间降序
返回完整的 Item metadata；recent 最多 50 项，按访问时间降序，每项为 `{item,visitedAt}`。
同时间按 Item ID 确定排序。空列表返回数组，不返回 null。类型覆盖文档、白板和文件夹。

访问不是 GET Item / Markdown / 白板的副作用：前端需在实际打开内容后显式记录，以免
后台预取、搜索或验证请求错误地改变最近访问。前端接入在后续部分完成。

## 生命周期

- 改名和移动后读取当前 Item metadata，不保存可能过期的标题副本。
- 软删除保留个人记录，但收藏和最近访问列表隐藏该 Item；拒绝向已删除 Item 新增记录。
- 按批次恢复后，原收藏及访问记录重新进入有效列表，恢复本身不改变访问时间。
- 彻底删除 Item / Workspace 或删除用户时，外键级联清除对应个人记录。
- 撤销工作区成员权限后，列表和更新都拒绝；保留记录本身不授予访问权。

## 迁移与验证

迁移只创建新表和索引，不清空已有正文、回收站或个人记录。升级前仍按 `BUILD.md` 停服
备份；回退应使用升级前完整备份，不手工删除表或迁移版本记录。

`personal_items_test.go` 覆盖用户与工作区隔离、viewer 可用但无内容写权、幂等、顺序、
50 项上限、失败回滚、改名、软删除 / 恢复 / 彻底删除、撤权以及公共 metadata 不变。
`personal_items_migration_test.go` 从 schema 7 升级，复核正文、代际、删除批次及重复迁移
后的个人记录。HTTP E2E 验证 CSRF、viewer 自有状态和生命周期；真实 CLI 备份恢复测试
同时验证收藏及访问时间原样保留。
