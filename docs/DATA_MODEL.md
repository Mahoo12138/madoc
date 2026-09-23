# Data Model

## 1. 原则

新的 MVP 架构不继续复制 AFFiNE Prisma model。

SQLite schema 只表达 madoc 自己的 domain。

不自动删除 legacy tables；迁移策略见 `MIGRATION.md`。

## 2. users

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL DEFAULT '',
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME NOT NULL,
    updated_at    DATETIME NOT NULL
);
```

## 3. sessions

MVP 简化为一个 session 对应一个 user：

```sql
CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL
);
```

不保留 AFFiNE 的 Session container + UserSession 多用户结构。

## 4. workspaces

```sql
CREATE TABLE workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

## 5. workspace_members

```sql
CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
    created_at   DATETIME NOT NULL,
    PRIMARY KEY(workspace_id, user_id)
);
```

一个 Workspace 至少必须有一个 owner。

删除最后一个 owner 必须拒绝。

## 6. workspace_invites

```sql
CREATE TABLE workspace_invites (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL CHECK(role IN ('editor','viewer')),
    inviter_id   TEXT NOT NULL REFERENCES users(id),
    status       TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked','expired')),
    expires_at   DATETIME,
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL
);
```

## 7. items

统一文件树：

```sql
CREATE TABLE items (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    parent_id    TEXT REFERENCES items(id) ON DELETE CASCADE,
    type         TEXT NOT NULL CHECK(type IN ('folder','markdown','whiteboard')),
    title        TEXT NOT NULL,
    sort_key     INTEGER NOT NULL DEFAULT 0,
    created_by   TEXT NOT NULL REFERENCES users(id),
    created_at   DATETIME NOT NULL,
    updated_at   DATETIME NOT NULL
);
```

约束必须在 service 层补充：

- parent 必须属于同一 Workspace；
- parent.type 必须为 folder；
- folder 不能被移动到自己的 descendant；
- root 使用 `parent_id IS NULL`；
- 不要求 sibling title unique。

## 8. markdown_states

```sql
CREATE TABLE markdown_states (
    item_id        TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    snapshot       BLOB,
    snapshot_seq   INTEGER NOT NULL DEFAULT 0,
    markdown_cache TEXT NOT NULL DEFAULT '',
    cache_seq      INTEGER NOT NULL DEFAULT 0,
    updated_at     DATETIME NOT NULL
);
```

`snapshot` 是 Yjs full state update。

## 9. markdown_updates

```sql
CREATE TABLE markdown_updates (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id          TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    client_update_id TEXT NOT NULL,
    update_blob      BLOB NOT NULL,
    created_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at       DATETIME NOT NULL,
    UNIQUE(item_id, client_update_id)
);

CREATE INDEX idx_markdown_updates_item
ON markdown_updates(item_id, id);
```

`id` 充当全局 sequence。

snapshot commit 的 `baseSeq` 对应此 ID。

## 10. whiteboard_states

MVP 简化为持久化最新完整 scene：

```sql
CREATE TABLE whiteboard_states (
    item_id     TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
    revision    INTEGER NOT NULL DEFAULT 0,
    scene_json  TEXT NOT NULL DEFAULT '{}',
    updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    updated_at  DATETIME NOT NULL
);
```

不要将 pointer / selection / active tool 写入 scene。

若实际白板性能表明 full scene 持久化成为瓶颈，再引入 delta log；不要提前复杂化。

## 11. assets

```sql
CREATE TABLE assets (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id      TEXT REFERENCES items(id) ON DELETE SET NULL,
    file_name    TEXT NOT NULL,
    mime         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    sha256       TEXT,
    storage_key  TEXT NOT NULL UNIQUE,
    created_by   TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at   DATETIME NOT NULL
);
```

文件本体：

```text
$MADOC_DATA/assets/<workspace-id>/<asset-id>
```

`storage_key` 由服务端生成，绝不能直接使用用户文件名作为 filesystem path。

## 12. server_config

可选的少量 key-value 配置：

```sql
CREATE TABLE server_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at DATETIME NOT NULL
);
```

只用于真正的 server config / generated secrets，不用于模拟 AFFiNE feature system。

## 13. 不进入 MVP 核心 schema

删除或 legacy-only：

- `workspace_pages`
- AFFiNE `snapshots`
- AFFiNE `updates`
- `snapshot_histories`
- `user_snapshots`
- `user_features`
- AFFiNE quota / feature tables

`user_access_tokens` 是否保留取决于是否当前已有实际需求；API token 不是 MVP 必需，可后置。

## 14. Migration Version

必须增加 schema version：

```sql
PRAGMA user_version;
```

或专用 migration table。

不要继续依靠单个 `CREATE TABLE IF NOT EXISTS schema.sql` 处理所有未来结构变化。

推荐：

```text
internal/db/migrations/
├── 0001_legacy_baseline.sql
├── 0002_mvp_core.sql
└── ...
```

migration 必须事务化（SQLite 不允许事务处理的 pragma 除外）。

## 账号资料与偏好

增量迁移 `0003_account_profile.sql` 新增 `user_avatars`：以 `user_id` 为主键，保存唯一 `storage_key` 和更新时间。头像位于 `assets/_avatars/`，不属于任何 Workspace；现有 assets 备份与恢复完整包含该目录。`User.avatarUrl` 和成员资料由关联查询生成，不暴露文件路径。

`0004_account_preferences.sql` 新增 `user_preferences`：以 `user_id` 为主键，保存完整偏好 JSON、递增 revision 和更新时间。不存在记录时返回默认设置与 `initialized: false`；PATCH 在事务内读取、校验并合并字段。两张表均随账号删除级联清理数据库记录，不改动既有内容或协同数据。

## Markdown update receipts

`0005_markdown_receipts.sql` 增加 `markdown_update_receipts`：

- 主键为 `(item_id, client_update_id)`，保存原始 `seq`。
- 与正文 update 同事务写入；从升级时尚存的 update 日志回填。
- 不随快照压缩清除，保证 ACK 丢失后的重试仍返回同一 seq。
- Item 删除时级联删除；显式正文重置时在同一事务清除。
- 当前无基于时间的自动清理；内容代际与持久化 outbox 的后续约束见 `RELIABILITY.md`。

## Markdown content generation

`0006_markdown_generation.sql` 为 `markdown_states` 增加非空整数 `generation`，
默认 0。正文重置时与更新日志 / receipt 清除一起递增；普通编辑及 compaction
不改变代际。正文、缓存及快照写入都在事务中校验代际，避免旧客户端写入新正文。

## 内容导入回执

`0009_content_imports.sql` 增加 `content_imports`：请求 UUID 为主键，保存 Workspace、
创建用户、请求摘要、根 Item ID 与时间。与整组新内容和附件元数据同事务提交，重复请求
返回既有结果而不重复创建。根 Item ID 刻意不设删除级联，防止彻底删除后旧请求重新创建；
Workspace 删除时清理其回执。暂不自动过期，权限与生命周期详见 `CONTENT_IMPORT.md`。
