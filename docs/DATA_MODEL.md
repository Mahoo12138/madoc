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

### 2.1 站点准入字段

增量迁移 `0017_site_settings_and_user_capabilities.sql` 增加两列：

```sql
ALTER TABLE users ADD COLUMN can_create_workspace INTEGER NOT NULL DEFAULT 0
  CHECK (can_create_workspace IN (0, 1));
ALTER TABLE users ADD COLUMN signup_source TEXT NOT NULL DEFAULT 'legacy'
  CHECK (signup_source IN ('setup', 'workspace_invite', 'public_signup', 'admin_created', 'legacy'));
```

| 列 | 含义 |
| --- | --- |
| `can_create_workspace` | 该账号是否可以创建工作区。`1` 允许，`0` 不允许 |
| `signup_source` | 账号的创建来源，用于追溯与后续策略；`legacy` 表示本次迁移之前就存在的账号 |

**回填语义**：迁移在加列后统一执行 `UPDATE users SET can_create_workspace = 1`。因此升级前已存在的账号全部保留「可以创建工作区」的旧行为，`signup_source` 由列默认值自动成为 `'legacy'`。这是**保留旧行为，不是收紧权限**——收紧要由站点管理员在站点设置里主动关闭「受邀新账号默认可创建工作区」，且只影响之后创建的账号。

创建路径显式写入这两列，不依赖列默认值：

| 创建路径 | `can_create_workspace` | `signup_source` |
| --- | --- | --- |
| `POST /api/setup/admin`（首个管理员） | `1` | `setup` |
| `POST /api/invites/:token/accept`（新账号分支） | 接受那一刻的 `inviteDefaultCanCreateWorkspace` | `workspace_invite` |
| 既有账号再次接受邀请 | 不变 | 不变 |

`public_signup` 与 `admin_created` 目前没有写入方：公开注册与管理员显式建号属于后续工作包，枚举值先入库以固定结构。

**创建能力判定**在服务端执行时读取数据库当前事实，不是会话缓存快照：

```text
CanCreateWorkspace(user):
    if user 不存在 or user.disabled: return false
    return user.is_admin or user.can_create_workspace
```

同一条判定在事务内用于 `POST /api/workspaces`（不满足返回 403 `WORKSPACE_CREATION_DENIED`），并由 `/api/auth/session`、`/api/me` 的 `capabilities.canCreateWorkspace` 暴露给前端收敛入口。判定规则只有这一处实现，见 `internal/site`。

### 2.2 管理员管理字段的并发版本

```sql
ALTER TABLE users ADD COLUMN admin_revision INTEGER NOT NULL DEFAULT 0
  CHECK (admin_revision >= 0);
```

`admin_revision` 只跟踪 `is_admin`、`disabled`、`can_create_workspace` 三个由管理员在用户管理页修改的字段，**不跟踪**头像、姓名、邮箱或编辑器偏好。个人资料接口不修改这三个字段，管理员修改它们必须走 `PATCH /api/admin/users/:userId`。

管理界面用它做乐观并发：一个管理员调整授权时，另一个管理员改了同一个账号的启用状态，前者会拿到 409 `REVISION_CONFLICT` 而不是静默覆盖。成功变更后递增；无实际变化时原样返回，不递增。

它是**这个作用域**的版本号，不要把它当成整个用户对象的全局版本——用一次头像上传去撞另一位管理员的授权表单是没有意义的。

### 2.3 邮箱验证时间

```sql
ALTER TABLE users ADD COLUMN email_verified_at DATETIME;
```

可空，**当前没有任何写入方**。管理员显式建号会把邮箱留在 `NULL` 上：管理员担保的是人，不是邮箱可达性。只有真正的邮箱验证流程（取回一次性链接并完成验证）才写入时间，**不按 `signup_source` 推断邮箱已验证**。公开注册尚未交付，所以这一列至今为空——看到它为空不要以为是缺陷，也不要因为某个流程「看起来验证过邮箱」就顺手写入。

### 2.4 建号授权记录（account_enrollments）

管理员显式建号的一条授权记录：

```sql
CREATE TABLE account_enrollments (
    id                   TEXT PRIMARY KEY,
    kind                 TEXT NOT NULL CHECK (kind IN ('public_signup', 'admin_created')),
    email                TEXT NOT NULL,
    token_hash           TEXT NOT NULL UNIQUE,
    status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at           DATETIME NOT NULL,
    created_at           DATETIME NOT NULL,
    consumed_at          DATETIME,
    created_by           TEXT REFERENCES users(id) ON DELETE SET NULL,
    can_create_workspace INTEGER CHECK (can_create_workspace IN (0, 1))
);
```

- **明文令牌不落库**：`token_hash` 是 `id.secret` 中 `secret` 部分的 `sha256` 摘要，原始令牌只在创建响应里出现一次，因此数据库泄漏不可重放
- `email` 是**规范化后**的目标邮箱（小写 + 去首尾空格）；不套用任何邮箱服务商的 `+tag` 与点号规则，所有入口一致
- `created_by` 与 `can_create_workspace` 只服务于 `admin_created`：公开注册记录没有审批人，其初始创建授权必须在完成注册时读取当时的设置默认值，**不能冻结进记录**（否则就绕过了后来收紧的默认值）
- `created_by` 是 `ON DELETE SET NULL`：审批账号被删除后记录仍在，审计链不丢
- `status` **只有三态**。是否过期由 `expires_at` 在每次请求时判定、不落库——后台任务没跑也不影响过期记录被拒绝；因此界面上的「已过期」由 `expires_at` 推出，不要指望 `status` 里有一个 `expired`
- 同一邮箱重复签发时**撤销旧记录再插入新行**：一次授权不能有两个入口，而旧令牌只有摘要、无法复现
- 索引：`(email, status)` 用于查重与替代判定，`(created_by, id DESC)` 用于回答「这位管理员批准过哪些账号」

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
    description TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);
```

工作区介绍由 `0016_workspace_description.sql` 增量添加，既有工作区默认为空；不是将侧栏此前的固定文案作为用户介绍回填。介绍最多 500 个 Unicode 字符，由服务端校验，空字符串表示未设置。列表、详情和接受邀请返回的 Workspace 使用相同字段。

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

### 12.1 site_settings（站点设置）

`site_settings` 是 `server_config` 里的**单个业务设置键**，存库、可在线修改，与 `internal/config` 那套启动期环境配置是两回事。当前只有这一个键。

```json
{
  "schemaVersion": 1,
  "revision": 0,
  "registrationMode": "invite_only",
  "allowWorkspaceOwnerInviteNewUsers": false,
  "inviteDefaultCanCreateWorkspace": false,
  "publicSignupDefaultCanCreateWorkspace": false,
  "origin": "new"
}
```

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `schemaVersion` | int | 配置结构版本，当前必须为 `1`；不匹配视为结构不兼容 |
| `revision` | int | 乐观并发令牌，`>= 0`，仅成功变更后 +1 |
| `registrationMode` | enum | `closed` / `invite_only` / `open` |
| `allowWorkspaceOwnerInviteNewUsers` | bool | 普通 owner 是否可邀请尚无账号的人 |
| `inviteDefaultCanCreateWorkspace` | bool | 受邀新账号的默认创建授权（**本次唯一已接入生效的设置**） |
| `publicSignupDefaultCanCreateWorkspace` | bool | 公开注册新账号的默认创建授权 |
| `origin` | enum | `new` / `upgrade`，**只持久化、不出现在 API 响应里** |

`origin` 是元字段：迁移时用它区分该实例该用哪一套默认值（`upgrade` = 升级时实例已有账号，采用保留旧行为的默认值）。API 响应里对应的是只读的 `upgradedInstance` 布尔，由 `origin == "upgrade"` 推导。设置一旦持久化就不再按用户数切换。

四个业务字段中只有 `inviteDefaultCanCreateWorkspace` 已接入生效路径；其余三项入库并校验，但**不参与任何判定**，因此对外只作为「尚未接入」的只读事实展示。

**结构损坏即失败关闭**：`site_settings` 行缺失、JSON 非法、`schemaVersion != 1`、必需键缺失、字段类型不符，以及**存量 `registrationMode` 为 `open`** 时，依赖该策略的操作（创建工作区、邀请创建账号）一律拒绝，并记录可诊断日志；不退回「允许所有人」。未知附加键被忽略，结构闸门是 `schemaVersion`。

`registrationMode = "open"` 列入损坏判定，是因为写侧对 `open` 的请求一律返回 422 `REGISTRATION_NOT_READY`，服务自身没有任何写入路径能存下该值；读到它即说明文档被服务之外的来源改写过。它在读取阶段就被判为损坏，因此读侧（`GET /api/admin/settings`）与写侧（`PATCH`）返回同一个结论——GET 不会返回一个任何修改都无法生效的值，两者都是 500 `INTERNAL`。

新安装与升级实例采用不同默认值，理由与回滚影响见 [构建与部署](../BUILD.md)。

## 13. admin_audit_events

```sql
CREATE TABLE admin_audit_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_kind    TEXT NOT NULL CHECK (actor_kind IN ('user', 'system', 'maintenance')),
    actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    action        TEXT NOT NULL,
    target_type   TEXT NOT NULL,
    target_id     TEXT,
    changes_json  TEXT NOT NULL DEFAULT '{}',
    request_id    TEXT,
    created_at    DATETIME NOT NULL
);

CREATE INDEX idx_admin_audit_target
ON admin_audit_events(target_type, target_id, id);
```

管理操作用于追溯，**独立于工作区活动流**——工作区成员都能看活动流，但管理变更不应混入其中。当前状态：

- **只写不读**。本次只写入 `site.settings_changed`，没有查看页面，也没有修改 / 删除接口；
- 记录与被它描述的设置变更在**同一个数据库事务**内提交，审计写入失败则设置变更整体回滚；被拒绝的请求不写审计；
- `actor_kind` / `actor_user_id` / `target_*` / `created_at` 由服务端决定，不信任客户端提交的操作者信息；`request_id` 当前写 `NULL`；
- `action` 使用服务端白名单。

`changes_json` **只保存白名单业务字段的前后值**，形如：

```json
{ "inviteDefaultCanCreateWorkspace": { "from": true, "to": false } }
```

禁止写入密码、密码哈希、Cookie、CSRF token、完整邀请 / 激活令牌、文档内容或任意请求体。当前不自动清理审计记录；保留策略以后单独设计。该表定位是应用内可追溯记录，不宣称能抵抗服务器管理员直接篡改数据库。

## 14. 不进入 MVP 核心 schema

删除或 legacy-only：

- `workspace_pages`
- AFFiNE `snapshots`
- AFFiNE `updates`
- `snapshot_histories`
- `user_snapshots`
- `user_features`
- AFFiNE quota / feature tables

`user_access_tokens` 是否保留取决于是否当前已有实际需求；API token 不是 MVP 必需，可后置。

## 15. Migration Version

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

## 站点设置与用户能力

`0017_site_settings_and_user_capabilities.sql` 一次性完成三件事，细节见上文 2.1 / 12.1 / 13：

- `users` 增加 `can_create_workspace` 与 `signup_source`，并把升级前已存在的账号
  `can_create_workspace` 统一置为 `1`、`signup_source` 置为 `'legacy'`；
- 新建 `admin_audit_events`，当前只写入 `site.settings_changed`；
- 按「迁移执行时是否已有账号」写入 `server_config` 的 `site_settings` 键：新安装写入
  保守默认（`origin = "new"`），升级实例写入保留旧行为的默认（`origin = "upgrade"`）。

两条写入互斥且都带 `NOT EXISTS (… WHERE key = 'site_settings')` 守卫，因此重复启动或重开
数据库不会覆盖管理员已经保存过的值。该迁移只加列、加表、插默认值，不删除或重写任何
既有内容；迁移与回滚注意事项见 [构建与部署](../BUILD.md)。
