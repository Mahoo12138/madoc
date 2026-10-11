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

`setup/admin` 只允许未初始化实例调用一次。它创建的第一个管理员带 `signup_source = 'setup'` 与 `can_create_workspace = 1`。

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

### 3.1 User DTO 与 capabilities

`GET /api/auth/session` 与 `GET /api/me` 返回同构的 User：

```json
{
  "id": "…",
  "avatarUrl": null,
  "name": "…",
  "email": "…",
  "isAdmin": false,
  "disabled": false,
  "capabilities": { "canManageSite": false, "canCreateWorkspace": true }
}
```

`capabilities` 由服务端根据数据库当前事实计算，**客户端只读**，不允许也不需要根据 `isAdmin` 推导：

| 字段 | 语义 |
| --- | --- |
| `canManageSite` | 用户存在、未被禁用、且是启用中的站点管理员 |
| `canCreateWorkspace` | 用户存在、未被禁用，且（是管理员 **或** `users.can_create_workspace = 1`） |

列定义、回填与创建路径写入规则见 [数据模型](DATA_MODEL.md)；设置存储见 4. 站点管理设置。

## 4. 站点管理设置

```text
GET   /api/admin/settings
PATCH /api/admin/settings
```

中间件顺序固定为 `auth.Require → adminRequired → csrfRequired`（`csrfRequired` 只作用于 PATCH）。`adminRequired` 独立于中间件层再校验一次：未登录由 `Require` 返回 401 `UNAUTHORIZED`，已登录但不是启用中的管理员返回 403 `ADMIN_REQUIRED`。**不依靠隐藏菜单作为安全措施**，前端是否显示入口与服务端校验是两件事。

读写站点设置：

```json
{
  "schemaVersion": 1,
  "revision": 3,
  "registrationMode": "invite_only",
  "allowWorkspaceOwnerInviteNewUsers": true,
  "inviteDefaultCanCreateWorkspace": true,
  "publicSignupDefaultCanCreateWorkspace": false,
  "implemented": {
    "registrationMode": true,
    "allowWorkspaceOwnerInviteNewUsers": true,
    "inviteDefaultCanCreateWorkspace": true,
    "publicSignupDefaultCanCreateWorkspace": false
  },
  "upgradedInstance": true,
  "updatedAt": "2026-10-09T00:00:00Z"
}
```

上例是一个从旧版本升级来的实例：管理员尚未改过受邀默认授权，因此两个创建授权相关的值仍是升级默认的 `true`。新安装实例的初始值见 [构建与部署](../BUILD.md) 的默认值表。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schemaVersion` | int | 配置结构版本，当前必须为 `1` |
| `revision` | int | 乐观并发令牌，`>= 0`；仅成功变更后 +1，无实际变化不递增 |
| `registrationMode` | enum | **已接入**：`closed` / `invite_only` / `open`；决定是否允许通过工作区邀请**创建新账号**（`closed` 一律禁止，管理员也不例外）。请求设为 `open` 仍被 422 拒绝 |
| `allowWorkspaceOwnerInviteNewUsers` | bool | **已接入**：非管理员的 workspace owner 是否可以邀请尚无账号的人；站点管理员豁免该项限制 |
| `inviteDefaultCanCreateWorkspace` | bool | **已接入**：`AcceptInvite` 创建新账号时写入 `users.can_create_workspace` |
| `publicSignupDefaultCanCreateWorkspace` | bool | 本次**入库但不参与判定**（公开注册属后续阶段） |
| `implemented` | object | 服务端事实来源：该设置是否已真正接入生效。客户端只读，不得硬编码这份映射 |
| `upgradedInstance` | bool | 本次初始化时实例已有账号（迁移写入的 `origin = "upgrade"`），页面据此提示「已按旧版本行为保留」 |
| `updatedAt` | string | `server_config.updated_at`，UTC RFC 3339 |

两个接口的响应都带 `Cache-Control: no-store`。

### 4.1 PATCH 请求体

```json
{
  "expectedRevision": 2,
  "changes": { "inviteDefaultCanCreateWorkspace": false }
}
```

- `expectedRevision` 必须存在且为整数（缺失或非整数 → 400）；
- `changes` 必须存在且至少 1 个字段（空对象 → 400）；
- `changes` 只接受上表 4 个业务字段。`schemaVersion` / `revision` / `implemented` 一律 400；
- 布尔字段必须是严格 JSON 布尔，`null`、`"true"`、`0` / `1` 都拒绝；
- `registrationMode` 必须是三个枚举值之一。

响应是**完整 DTO**（与 GET 同构，含新的 `revision`）。`changes` 与当前值完全相同时原样返回：不递增 `revision`、不写审计。

### 4.2 错误码

下表覆盖设置端点；用户管理端点的错误码见 4.5。

| 状态 | code | 触发 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | 解码失败、`expectedRevision` / `changes` 不合法、字段不在白名单、布尔类型不严格 |
| 401 | `UNAUTHORIZED` | 未登录（沿用既有 code） |
| 403 | `CSRF_INVALID` | 写请求 CSRF 校验失败 |
| 403 | `ADMIN_REQUIRED` | 非启用中的管理员；也包括事务内复检时操作者已不再是启用中管理员 |
| 409 | `REVISION_CONFLICT` | `expectedRevision` 与当前 `revision` 不一致（其他管理员已修改） |
| 422 | `REGISTRATION_NOT_READY` | 请求把 `registrationMode` 设为 `open`（公开注册尚未接入，服务端预埋拒绝） |
| 500 | `INTERNAL` | `site_settings` 结构损坏、缺失关键字段或读取失败（含存量 `registrationMode: "open"`）；服务端记录可诊断日志 |

校验在单个数据库事务内按固定顺序执行：读取并校验结构（结构损坏直接 500 短路，不做任何写入）→ 合并白名单变更 → 拒绝 `open` → 比对 `revision` → 事务内复检操作者 → 写回 `server_config` → 写 `admin_audit_events`。业务错误的优先级为 **400 → 422 → 409 → 403**。审计与设置写入同事务提交，任一步失败整体回滚；被拒绝的请求不留下审计记录。

首次由管理员访问时若 `site_settings` 不存在，会在该事务内**惰性初始化并持久化**（`revision = 0`）。非管理员请求不触发初始化。结构损坏时不会退回「允许所有人」，依赖该策略的操作失败关闭。

判定结构损坏时，**存量 `registrationMode: "open"` 也算损坏**：写侧对 `open` 的请求一律返回 422，因此服务自身没有任何写入路径能存下该值，读到它就说明文档被服务之外的来源改写过（例如手工改库）。这条闸门在读取阶段生效，读侧（GET）与写侧（PATCH）因此给出同一个结论——GET 不会返回一个任何修改都无法生效的值，而是与 PATCH 一样返回 500 `INTERNAL`；依赖该策略的敏感操作（`POST /api/invites/:token/accept` 建号、`inviteDefaultCanCreateWorkspace` 读取）同样失败关闭。

### 4.3 生效点（同一批交付的其他既有接口）

这些接口的路由未改变，只是接入了新的能力事实：

| 接口 | 变化 |
| --- | --- |
| `POST /api/workspaces` | 事务内判定创建能力；不满足返回 **403 `WORKSPACE_CREATION_DENIED`**。管理员即使 `can_create_workspace = 0` 仍可创建；已禁用账号一律拒绝 |
| `POST /api/invites/:token/accept` | 仅**新建账号**分支写入 `signup_source = 'workspace_invite'`，`can_create_workspace` 取**接受那一刻**的 `inviteDefaultCanCreateWorkspace`；已有账号的来源、授权、管理员身份与密码都不被改写。接受邀请不再覆盖既有成员角色，响应的 `workspace.role` 是实际角色 |
| `POST /api/setup/admin` | 首个管理员写入 `signup_source = 'setup'`、`can_create_workspace = 1` |

设置损坏时，`POST /api/workspaces`、工作区邀请的创建与 `POST /api/invites/:token/accept` 失败关闭（不建号、不放行、不写入邀请）。

### 4.4 公开站点信息

```text
GET /api/site
```

**不要求登录**，供登录页与邀请页读取最小注册状态。响应体**只有两个键**，不因调用者身份而变化：

```json
{
  "registrationMode": "invite_only",
  "publicRegistrationAvailable": false
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `registrationMode` | enum | 与 4. 的设置同名同枚举；这里只读出当前生效值 |
| `publicRegistrationAvailable` | bool | 综合注册模式与「公开注册能力是否就绪」给出的结论 |

- 响应带 `Cache-Control: no-store`。
- `publicRegistrationAvailable` **不等于** `registrationMode === "open"` 的判断结果。公开注册属后续阶段，当前恒为 `false`；客户端不得由模式自行推导它。
- 该接口不返回 owner 邀请策略、用户列表、数据目录、SMTP 凭证、服务器密钥或完整 `server_config`。这是唯一一个不需要会话就能读到的配置出口；不要为了调试便利往这个响应里加字段。
- 服务自身没有任何写入路径能存下 `registrationMode: "open"`，因此读到 `open` 与其他损坏形式同样对待。

| 状态 | code | 触发 |
| --- | --- | --- |
| 200 | — | 读取成功 |
| 500 | `INTERNAL` | `site_settings` 行缺失、结构损坏，或存量 `registrationMode: "open"` |

失败时**不返回默认值、不自愈、不降级成「公开注册可用」**。这句文案是纯说明性内容、不承载任何能力，`auth` 本身完全不读 `server_config`，所以登录页把它静默省略不会影响任何流程；真正需要看到该 500 的是管理员，他们会在 `/api/admin/settings` 遇到同一个错误并去修数据。

**读取路径必须不写入**：该接口走 `Store.LoadPublic`（`Load` 经 `*sql.DB` 执行只读查询，**不会** INSERT 默认文档），与管理端 `GET /api/admin/settings` 的惰性初始化（`Ensure`，读到缺失会在事务内 `INSERT`）是**相反语义**。**公开路径不得改用 `Ensure`**，否则未登录请求就获得了写库能力。反过来，持有事务的代码（如 `core.AcceptInvite`）必须让自己的设置读取走同一个 `*sql.Tx`：连接池是 `SetMaxOpenConns(1)`，事务内误用全局句柄表现为死锁而不是报错。

### 4.5 用户管理

```text
GET    /api/admin/users?q=&status=&role=&limit=&cursor=
GET    /api/admin/users/:userId
PATCH  /api/admin/users/:userId        {"expectedRevision":3,"changes":{"disabled":true}}
DELETE /api/admin/users/:userId/sessions
```

中间件顺序与设置端点一致（`auth.Require` → `adminRequired` → `csrfRequired`），响应 `Cache-Control: no-store`。

**列表**：`q` 匹配姓名或邮箱，`status` 只接受 `enabled`/`disabled`，`role` 只接受 `admin`/`user`，省略即不筛选。默认每页 20、最多 100，非法值返回 400。排序固定为 `created_at DESC, id DESC`，**不拼接任何客户端文本**；`cursor` 由服务端签发并解析验证（keyset 而非裸偏移量），指向已不存在的用户时同样 400。响应 `{users, nextCursor}`，末页 `nextCursor` 为 `null`。**列表不一次加载全部用户。**

**用户对象**：`{id, avatarUrl, name, email, isAdmin, disabled, canCreateWorkspace, effectiveCanCreateWorkspace, signupSource, createdAt, revision}`。`canCreateWorkspace` 是管理员维护的原始授权字段，`effectiveCanCreateWorkspace` 是最终能力。管理员的原始字段可以保留原值——他的创建能力来自身份，但界面必须展示**最终生效权限**，撤销管理员身份后按该字段判断。

**详情**额外返回 `stats`：`memberWorkspaces`（加入的工作区数）、`ownedWorkspaces`（创建的工作区数）、`soleOwnerRisk`（是否存在仅剩该账号**可用**的工作区）。判定排除已被禁用的 owner：另一个 owner 无法登录时，那个工作区同样没人能管理，正是这个提示要暴露的情况。`soleOwnerRisk` 只是提示，**不阻止封禁，也不自动转移内容所有权**。**详情不返回任何工作区标题或内容**，避免用户详情成为读取私人内容的旁路。

**PATCH**：`changes` 只接受 `isAdmin`、`disabled`、`canCreateWorkspace`，至少一个；布尔必须是严格 JSON 布尔。`expectedRevision` 对应 `admin_revision`，不匹配返回 409。事务内顺序：读取目标 → 规范化变更 → 比对 `revision` → 事务内复检操作者 → 禁止禁用自己 → 最后管理员不变量 → 无变化则原样返回 → 写库并递增 `admin_revision` → 条件删除 session → 写审计 → 提交。**组合修改作为整体检查不变量**，一部分非法则整体不落库。

| 状态 | code | 触发 |
| --- | --- | --- |
| 404 | `NOT_FOUND` | 用户不存在 |
| 400 | `INVALID_REQUEST` | 变更字段不在白名单，或布尔类型不严格 |
| 403 | `SELF_DISABLE_FORBIDDEN` | 管理员试图禁用自己 |
| 409 | `LAST_ACTIVE_ADMIN` | 操作会使站点没有 `is_admin=1 且 disabled=0` 的账号 |
| 409 | `REVISION_CONFLICT` | `admin_revision` 与 `expectedRevision` 不一致 |

**两条不变量在同一个事务内成立**：任何操作后站点至少保留一个启用中的管理员；禁止管理员禁用自己。允许把自己降为普通用户，但必须另有启用中的管理员。两个管理员同时互相降级时按事务顺序的最终状态判定，不依据过时的读取结果。

**连带撤权**：禁用账号或变更其管理员身份时，在同一事务内删除该用户全部 session，提交后通知 Hub 关闭其实时连接，使旧的身份快照失效。**仅修改创建能力不撤销 session**——成员权限没有变化，不该打断正在编辑的人。Hub 不可用时记录可诊断错误，但已提交的数据库状态不回滚；进程重启后仍从数据库读到禁用状态。

`DELETE .../sessions` 只撤销现有会话并关闭连接，**不禁用账号、不改密码、不撤销创建权限**，用户凭有效凭据仍可重新登录。客户端**不得对该动作自动重试**，以免稍后误撤销用户刚建立的会话。

**失败关闭的边界**：用户管理**不读 `site_settings`**。禁用账号只依据用户自身的列，因此设置文档损坏时列表、详情、修改与撤销会话**照常可用**；失败关闭只适用于真正依赖注册策略的操作（创建工作区、邀请建号、`GET /api/site`）。把封禁账号这条应急通道绑在一份无关的配置上，会让实例不健康时恰好无法停用恶意账号。

### 4.6 操作记录（审计查询）

```text
GET /api/admin/audit-events?action=&targetType=&targetId=&limit=&before=
```

中间件顺序与前两个端点一致（`auth.Require` → `adminRequired`，只读无 CSRF），响应 `Cache-Control: no-store`。

**列表**：`action` 只接受服务端已登记的动作（`site.settings_changed`、`user.disabled`、`user.enabled`、`user.admin_role_changed`、`user.workspace_creation_changed`、`user.sessions_revoked`），`targetType` 只接受 `site_settings` / `user`，省略即不筛选。默认每页 20、最多 100，`targetId` 超过 200 字符、`before` 超过 32 字符同样返回 400，**任何非法值一律 400 而不是被忽略**——被忽略的筛选会让一次拼写错误悄悄变成一份未筛选的全量页面。`before` 是 keyset 游标（上一页最小的 `id`）而非偏移量，`limit+1` 行探测是否还有下一页。

一处例外值得知道：查询串里含**原始分号**时，Go 的 `net/url` 会把整条 query 丢弃（1.17 的安全加固），结果是所有筛选被静默丢弃、退化为一个无筛选的 200，而不是 400。行为是安全的——无解释、无注入——但它不是「非法输入必 400」。

排序固定 `id DESC`。`id` 是 `INTEGER PRIMARY KEY AUTOINCREMENT`，与写入顺序同序，因此单列游标即可稳定翻页；首版数据量小，全表倒序扫描可接受，**为此新增索引属于过早优化**。响应 `{events, nextBefore}`，末页 `nextBefore` 为 `null`，空表返回 `events: []` 而非 `null`。

**事件对象**：`{id, actorKind, actorId, actorName, action, targetType, targetId, changes, createdAt}`。`actorName` 通过 `users` 左连接取得；`actor_user_id` 是 `ON DELETE SET NULL`，因此**操作者账号被删除后 `actorId` 为 `null`、`actorName` 为空字符串，这不是错误**，整条记录照常列出。

`changes` 是白名单业务字段的前后值——设置四项（`registrationMode`、`allowWorkspaceOwnerInviteNewUsers`、`inviteDefaultCanCreateWorkspace`、`publicSignupDefaultCanCreateWorkspace`）与用户四项（`isAdmin`、`disabled`、`canCreateWorkspace`、`sessionsRevoked`）——例如 `{"disabled":{"from":false,"to":true}}`。写入侧已保证其中不含密码、哈希、Cookie、CSRF、令牌、请求体或 IP，因此读路径无需再脱敏。**单行 `changes_json` 解析失败时降级为空对象并在服务端记录可诊断日志，而不是让整个页面 500**——这是只读页面，一条脏数据不该让它打不开。

**失败关闭的边界**：审计查询**不读 `site_settings`**，与用户管理同一条边界。设置文档损坏时列表照常可用，因为「谁停用了这个账号」正是实例不健康时最需要看到的信息。

| 状态 | code | 触发 |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | `action` / `targetType` 不在白名单，或 `limit` / `before` 不合法 |
| 401 | `UNAUTHORIZED` | 未登录，或会话已被撤销 / 账号已禁用 |
| 403 | `ADMIN_REQUIRED` | 已登录但不是启用中的管理员 |

首版**不提供**修改或删除审计的接口，也不自动清理；它是应用内可追溯记录，不宣称能抵抗直接改库。保留策略以后单独设计。

## 5. Workspace

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

创建者自动成为 owner。创建前服务端在事务内判定创建能力（管理员，或账号的 `users.can_create_workspace = 1`，且未被禁用），不满足返回 403 `WORKSPACE_CREATION_DENIED`；完整语义见 4.3。

Workspace 列表、详情、创建和接受邀请的响应包含 `description` 字符串，新工作区默认为空。
`PATCH /api/workspaces/:workspaceId` 仅 owner 可调用，支持可选 `name` 和 `description`：

```json
{ "description": "记录项目文档与设计白板" }
```

只更新提供的字段，省略的字段保持不变；至少提供一个字段。名称 trim 后不能为空，介绍 trim 后最多 500 个 Unicode 字符，可传 `""` 清除。整次请求验证通过后才写入，失败不部分保存；成功返回 204 并发送既有工作区变更通知。

## 6. Members

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

接受邀请时的账号与角色语义见 4.3；接受邀请不会覆盖既有成员角色，响应 `workspace.role` 是账号在该工作区的实际角色。

### 邀请：创建 `POST /api/workspaces/:workspaceId/invites`

请求 `{ email, role }`，`role` 只接受 `editor` / `viewer`（不接收 `isAdmin` 或 `canCreateWorkspace`，站点级能力由站点策略或用户管理决定）。**调用者必须是目标工作区的 owner**，站点管理员不是该工作区 owner 时同样 403。

邮箱统一小写去空格后，按目标账号状态判定准入：

| 目标账号状态 | 判定 |
| --- | --- |
| 存在且未禁用 | **允许，且不受注册模式限制**（`closed` 模式下仍然可以邀请已有账号） |
| 存在但已被禁用 | 403 `FORBIDDEN`「该账号已被禁用，请先由站点管理员启用」 |
| 不存在（将通过邀请创建账号） | 按注册模式矩阵判定，见下 |

「不存在」这一格才受站点策略约束，按顺序返回：

| 状态 | code | 触发 |
| --- | --- | --- |
| 403 | `REGISTRATION_CLOSED` | `registrationMode === "closed"` 且目标尚无账号。**管理员在此没有豁免**：通过邀请创建新账号本身就是一种注册路径 |
| 403 | `INVITE_NEW_USER_DENIED` | 模式允许，但邀请者不是站点管理员且 `allowWorkspaceOwnerInviteNewUsers = false` |
| 500 | `INTERNAL` | 设置读取失败，失败关闭 |

被拒绝时**不写入** `workspace_invites`，也不会顺带创建任何账号。这条边界与 `GET /api/site` 一致：关闭注册不禁用已有用户、不取消已有成员身份、不关闭只读分享、不禁止创建已获授权的工作区。

### 邀请：查看 `GET /api/invites/:token`

```json
{
  "invite": { "id": "…", "workspaceId": "…", "email": "…", "role": "viewer", "inviterId": "…", "status": "pending", "expiresAt": "…", "createdAt": "…" },
  "workspaceName": "Project",
  "canCreateAccount": false
}
```

- 令牌无效一律 404；邀请已消费、已撤销或已过期返回 409 `CONFLICT`。两者都不透露该邮箱是否存在，也不泄漏持有令牌之外的详情。
- `canCreateAccount` 是**策略声明**，语义是「当前注册模式下，这位邀请者现在是否可以引入一个尚无账号的人」= `registrationMode !== "closed"` 且（邀请者是管理员 **或** `allowWorkspaceOwnerInviteNewUsers`）。
- **它不是「这个邮箱现在能否注册」的意思**：对这个 Token 所属的邮箱已有账号的情况，它仍可能为 `true`，但那个人应当走「先登录再接受」而不是注册。邀请页用它区分「注册并加入」与「当前不允许创建新账号」两种形态，**不要**用它反推账号是否存在。
- 该字段是 JSON 布尔，只会是 `true` / `false`；读取设置失败时整个请求 500，不会静默给 `false`。

### 邀请：接受 `POST /api/invites/:token/accept`

成功时的账号与角色语义见 4.3。除原有校验（邮箱不匹配 403、已消费/过期 409、已有账号未登录 403）之外，**整个接受过程在单个事务内按接受时刻的事实重新校验两件事**：

1. **邀请者身份**：邀请仍在有效期内不代表发出者的状态没变。服务端复检该邀请的发出者账号仍存在、未被禁用，且**仍是该工作区的 owner**；任一不满足返回 403 `FORBIDDEN` 并整体回滚（不得留下新账号、成员关系或会话）。
2. **新账号路径的策略**：只有当目标邮箱尚无账号、本次需要新建账号时，才再按上面「创建邀请」的同一张表判定一次。因此接受接口同样可能返回 403 `REGISTRATION_CLOSED` / `INVITE_NEW_USER_DENIED` / 配置损坏的 500。
   **已有账号路径不受注册模式限制**：带上有效会话接受邀请的人，即使站点处于 `closed` 也能加入；他的 `signup_source`、创建授权、管理员身份与密码都不会被改写。

这条「发出时允许、接受前收紧」的规则是有意的：策略在**接受那一刻**生效，不信任发出邀请时的快照。

## 6.1 Workspace activity

```text
GET /api/workspaces/{workspaceId}/activity?before={eventId}&limit=30
```

Every current Workspace member may read the newest-first activity feed. `limit` defaults to 30 and is capped at 100;
`before` is the previous page's last event ID. The response is `{ "events": [...], "nextBefore": "..." }`.
Activity summaries are server-authored and do not include document or comment contents. See [ACTIVITY.md](ACTIVITY.md).

## 7. Items

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

## 8. Markdown

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

## 9. Assets

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

## 10. Whiteboard Export

白板 PNG / SVG / JSON 优先在浏览器生成。

服务端只需 scene data API（如果需要）：

```text
GET /api/items/:itemId/whiteboard
PUT /api/items/:itemId/whiteboard
```

单人 REST 更新携带 `baseRevision`；revision 冲突返回 `409`。协作中的 scene update 走 WebSocket。

主要编辑同步仍走 WebSocket。

## 11. Realtime

```text
GET /ws
```

详见 `COLLABORATION.md`。

## 12. Health

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

## 13. Pagination

Items tree 通常整棵 Workspace 加载，不必强制 pagination。

Admin user list / future history list 再做 cursor / limit。

- 管理审计列表见 4.6：`GET /api/admin/audit-events?limit=&before={id}`，`before` 是上一页最小的
  `id`（keyset，非偏移量），返回 `nextBefore`。

### 内容版本历史

- `GET /api/items/{itemId}/versions?limit=50&before={versionId}` 返回按创建时间倒序的
  检查点及 `nextBefore`；owner / editor / viewer 可读。
- `POST /api/items/{itemId}/versions` 创建手动检查点，请求 `{label, assetIds?}`；owner / editor
  可写。Markdown 投影未追上 update head 时返回 409 `EXPORT_NOT_READY`。
- `GET /api/items/{itemId}/versions/{versionId}` 返回不可变捕获内容和附件 ID。
- `POST /api/items/{itemId}/versions/{versionId}/restore-copy` 请求 `{title}`，在原目录原子
  创建独立副本；owner / editor 可写，原 Item 不会被覆盖。
- `GET /api/workspaces/{workspaceId}/version-storage` 返回历史字节用量、限制、手动 / 自动
  数量及 `automaticPaused`，Workspace 成员可读。

历史用量按检查点 payload 字节与被检查点引用附件的唯一文件字节累计；共享附件只计一次。

自动检查点在内容投影成功持久化时创建，同 Item 15 分钟内合并；自动版每项保留 30 个、最多
90 天，历史占用达到 Workspace 1 GiB 后暂停自动创建。手动检查点永久保留。

### 只读分享

分享管理和写入只允许 owner：`GET /api/items/{itemId}/shares`、`POST /api/items/{itemId}/shares`
（请求 `{versionId, expiresAt?}`）、`POST /api/items/{itemId}/shares/{shareId}/publish`
（请求 `{versionId}`）和 `DELETE /api/items/{itemId}/shares/{shareId}`。创建时要求同一 Item 的
手动版本，返回一次性 capability token；数据库只保存 token 摘要。匿名只读接口为
`GET /api/public/shares/{token}`，其附件子路径只允许该发布版本引用的资源。到期、撤销或
Item 处于回收站时正文和附件请求统一返回 404。完整边界见 [SHARING.md](SHARING.md)。

### 文档评论

评论以 Item 为范围，不绑定段落。Workspace 成员可读取 Markdown / Whiteboard 评论；owner / editor
可创建纯文本评论（去除首尾空白后 1–4000 个 Unicode 字符）。评论作者可删除自己的评论，owner 可调停删除；
viewer 只能读取。Folder 和回收站中的 Item 不支持评论。

```text
GET    /api/items/{itemId}/comments?before={commentId}&limit=50
POST   /api/items/{itemId}/comments                 {"body":"..."}
DELETE /api/items/{itemId}/comments/{commentId}
```

列表按创建时间倒序分页，默认 50 条、最多 100 条，响应包含 `comments` 与 `nextBefore`；写请求要求 CSRF。
评论记录作者显示名称快照，用户被删除后评论正文与显示名称仍保留。

## 14. Versioning

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
