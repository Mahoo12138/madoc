# 站点管理设置（增量 PRD）

| 项 | 内容 |
| --- | --- |
| 文档类型 | 增量 PRD（简版，不含竞品/市场分析） |
| 对应阶段 | 设计文档阶段 5.1「设置切片」 |
| 代码基线 | `d407f98` |
| 设计依据 | `madoc_站点管理与受控注册_设计与开发方案.md` §4 / §7.2 / §9 / §10 / §12 / §13 |
| 交付形态 | Go 单二进制 + SQLite + React(TS/Vite) + TanStack Router/Query + Mantine + Vanilla Extract |
| 编写人 | 许清楚（产品） |

## 0. 原始需求复述

1. 按设计文档梳理站点设置包含的配置项、字段类型、默认值与校验规则；
2. 实现对应的数据请求/接口调用逻辑，处理好异常与错误提示；
3. 实现站点管理设置页面，包含配置的展示、编辑、保存（或重置）等交互，覆盖加载中、提交成功/失败等状态；
4. 复用项目已有的组件、样式规范、路由与状态管理方式，保持代码风格一致，不引入与项目无关的新依赖。

---

## 1. 核心裁决（本 PRD 的结论，架构师可直接据此设计）

| # | 议题 | 裁决 | 理由 |
| --- | --- | --- | --- |
| A | 交付边界 | **「设置切片 + 最小生效链路」**。除存储/API/页面外，**必须**同时交付：`users.can_create_workspace` + `signup_source` 迁移、`CreateWorkspace` 能力检查、`AcceptInvite` 新账号写入来源与初始授权、`SetupAdmin` 写入 `setup`。**不含** `/admin/users` 用户管理页与 `admin_revision` | 设计文档 §13 阶段 5.1 退出条件是「关闭受邀默认创建授权后，新受邀账号无法创建工作区」。只做页面会让开关成为假开关；只做存储不做生效点同样不可验收。用户管理页是独立的大切片，混入会拖垮本次交付 |
| B | 页面暴露哪些配置项 | **只把 `inviteDefaultCanCreateWorkspace` 做成可编辑控件；其余 3 项以「尚未接入」只读行展示**（文字值 + `Badge`「未接入」+ 12px 说明）。由 API 响应中的 `implemented` 映射驱动，**前端不硬编码** | §7.2「尚未接入的设置不得展示为已生效功能」+ §13「不显示可点击但无法生效的选项」。同时满足用户「完整梳理配置项」的诉求——4 项全在页面上，只是 3 项不可操作。未来接入只需后端把 `implemented` 置 true |
| C | `registrationMode = open` | **服务端预埋校验**（`open` → 422 `REGISTRATION_NOT_READY`），**前端不显示 `open` 选项**，也不显示可点的 Select | 预埋成本是一个 `if`，可防止未来误开；§9.7 明确定义了该错误码，§13 阶段 5.2 要求「接口启用请求必须拒绝」 |
| D | `/admin` 落点 | **不做 `/admin` 独立页。** `/admin` 路由渲染 `<Navigate to="/admin/settings" replace />`；`/admin/settings` 直接承载完整 Admin Shell（品牌 + 侧栏 + 主区）。侧栏本次只放「站点设置」一项 + 底部「返回工作区」+ `AccountMenu` | 只有一个可用子页面时做带导航的壳会产生死链（点了「用户管理」落到空白）。侧栏结构先立起来，下一包加「用户管理」只需加一个 nav 项 |
| E | 无权限访问 | **需要 `ADMIN_REQUIRED` 错误码穿透到前端**（P0）。403 + `ADMIN_REQUIRED` → `EmptyState`（page 级）无权限态；401 `UNAUTHORIZED` → `Navigate to /sign-in`。**不**以 `session.user.isAdmin` 作为页面渲染依据 | §10.1「不依靠隐藏菜单作为安全措施」。客户端 `isAdmin` 是快照，可能是旧的（§4.4）。`isAdmin` 只用于**是否显示入口** |
| F | 「重置」语义 | **「重置」= 放弃本页未保存草稿、回到服务端最近一次已确认的值。不做「恢复出厂默认值」。** 因本页是「开关直接保存」模式，常态下无草稿，故**不设常驻「重置」按钮**；仅在保存失败或 409 冲突时提供「使用服务端当前值」。文案禁用「恢复默认」 | §4.3：默认授权是创建时快照，不追溯历史账号；且默认值有「新安装/升级」两套，页面无法安全判断应恢复到哪一套。「恢复默认值」会误导管理员以为会重算已有账号 |
| G | 审计 | 本次**只写不读**：`site.settings_changed` 写入 `admin_audit_events`（与设置保存同事务）。**不**交付审计查看页 | §13「审计写入从 5.1 开始，不能等本阶段才开始留痕」；查看页属于 5.4 |

---

## 2. 产品目标

1. **让「谁能创建工作区」成为可管理、可撤销的站点级事实**，而不是任何登录用户的默认能力。
2. **提供一处可信的站点设置读写通道**：类型化存储、白名单校验、版本化并发控制、损坏即失败关闭。
3. **杜绝假开关**：页面上每一项要么真实生效，要么被明确标注为尚未接入且不可操作。
4. **升级不伤害既有实例**：旧账号保留原有创建能力、来源标记 `legacy`；管理员可看到「已按旧版本行为保留」并主动收紧。
5. **沿用既有工程与设计规范**：不新增依赖、不新建主题、不发明刻度外的样式值。

---

## 3. 用户故事（管理员视角）

| # | 用户故事 |
| --- | --- |
| US-1 | 作为站点管理员，我希望在「站点管理 › 站点设置」看到受邀新账号的默认创建授权，并在一次点击后保存成功，因为我不想为每个新受邀者事后逐个收回权限。 |
| US-2 | 作为站点管理员，当我关闭「受邀新账号默认可创建工作区」后，我希望**之后**通过邀请注册的账号确实无法创建工作区，因为我想让受邀者先只做协作者。 |
| US-3 | 作为刚升级旧实例的管理员，我希望页面明确告诉我「当前保留的是旧版本行为（受邀新账号默认可创建工作区）」，因为我不希望升级悄悄收紧或悄悄放开权限。 |
| US-4 | 作为站点管理员，我希望看到其余 3 项设置的名称、当前值与「未接入」标注，因为我想知道产品未来会管什么，而不是被一个看似能点但无效的开关欺骗。 |
| US-5 | 作为站点管理员，当另一位管理员同时修改了设置时，我希望看到冲突提示和双方取值的对比，并由我决定采用哪一个，因为我不想被静默覆盖或自动重试。 |
| US-6 | 作为普通用户（无管理员身份），当我直接访问 `/admin/settings` 时，我希望看到明确的「没有站点管理权限」说明并能返回工作区，而不是空白页或半截管理界面。 |

---

## 4. 配置项清单表

### 4.1 站点设置（`server_config` 单键 `site_settings`，JSON）

存储位置：现有 `server_config` 表，键 `site_settings`，值为下列完整 JSON。**不新增表，不引入通用 Feature Flag 系统。**

| API 字段（camelCase） | 类型 | 新安装默认 | 升级默认 | 校验规则 | 本次接入？ |
| --- | --- | --- | --- | --- | --- |
| `schemaVersion` | int | `1` | `1` | 必须 == 1；否则视为结构不兼容 → 敏感操作失败关闭 | 是（元字段） |
| `revision` | int | `0` | `0` | >= 0；仅成功变更后 +1；无实际变化不递增 | 是（并发控制） |
| `registrationMode` | enum `closed \| invite_only \| open` | `invite_only` | `invite_only` | 必须是三者之一；`open` → **422 `REGISTRATION_NOT_READY`** | **否**（存储 + 校验，不参与判定；页面只读） |
| `allowWorkspaceOwnerInviteNewUsers` | boolean | `false` | `true` | 必须是严格 JSON 布尔；字符串/数字/null → 400 | **否**（页面只读） |
| `inviteDefaultCanCreateWorkspace` | boolean | `false` | `true` | 必须是严格 JSON 布尔 | **是**（`AcceptInvite` 创建账号时写入 `users.can_create_workspace`） |
| `publicSignupDefaultCanCreateWorkspace` | boolean | `false` | `false` | 必须是严格 JSON 布尔 | **否**（页面只读） |
| `implemented`（响应专用，不入库） | object | 见下 | 见下 | 服务端按当前已接入能力生成，客户端只读 | 是 |

`implemented` 响应示例（服务端事实来源）：

```json
{ "registrationMode": false, "allowWorkspaceOwnerInviteNewUsers": false, "inviteDefaultCanCreateWorkspace": true, "publicSignupDefaultCanCreateWorkspace": false }
```

存储示例（新安装）：

```json
{ "schemaVersion": 1, "revision": 0, "registrationMode": "invite_only", "allowWorkspaceOwnerInviteNewUsers": false, "inviteDefaultCanCreateWorkspace": false, "publicSignupDefaultCanCreateWorkspace": false }
```

**新安装 vs 升级判定**：在该迁移文件中完成——`SELECT count(*) FROM users` 为 0 用新安装值，否则用升级值。**设置一旦持久化，后续启动不再按用户数切换。**

**损坏处理**：`site_settings` 缺失、JSON 非法、`schemaVersion != 1`、关键字段缺失或类型不符 → 依赖该策略的敏感操作（创建工作区、邀请创建账号）**失败关闭**（拒绝），并写可诊断错误日志；**不退回「允许所有人」**。

### 4.2 用户表增量字段（迁移新增）

| 字段（snake_case） | API 字段 | 类型 | 迁移默认 | 新建账号写入规则 | 本次接入？ |
| --- | --- | --- | --- | --- | --- |
| `can_create_workspace` | `canCreateWorkspace` | INTEGER NOT NULL DEFAULT 0，CHECK IN (0,1) | 迁移内 `UPDATE users SET can_create_workspace = 1`（旧账号保留旧能力） | 由创建路径显式写入，不依赖列默认值 | 是 |
| `signup_source` | `signupSource` | TEXT NOT NULL DEFAULT `'legacy'`，CHECK IN (`setup`,`workspace_invite`,`public_signup`,`admin_created`,`legacy`) | 旧账号自动为 `legacy` | `SetupAdmin` → `setup`；`AcceptInvite` 新账号 → `workspace_invite`；客户端**不可提交**来源 | 是 |
| `admin_revision` | `revision` | INTEGER NOT NULL DEFAULT 0 | — | 用户管理并发控制 | **否**（属用户管理包） |

**创建能力判定**（服务端执行时读取，不是缓存快照）：

```text
CanCreateWorkspace(user):
    if user 不存在 or user.disabled: return false
    return user.is_admin or user.can_create_workspace
```

**不追溯**：修改 `inviteDefaultCanCreateWorkspace` 只影响之后创建的账号，不批量改写已有用户；已有账号再次接受邀请只增加成员关系，不重写 `signup_source` / `can_create_workspace` / `is_admin` / 密码。

---

## 5. 接口需求表

### 5.1 `GET /api/admin/settings`

| 项 | 内容 |
| --- | --- |
| 中间件 | `a.auth.Require` + 管理员校验（403 `ADMIN_REQUIRED`） |
| 请求 | 无参数 |
| 响应 200 | 见下方 DTO；`Cache-Control: no-store` |
| 错误码 | 401 `UNAUTHORIZED`；403 `ADMIN_REQUIRED`；500 `INTERNAL` |
| 行为 | 首次访问时若 `site_settings` 不存在，按 4.1 默认值**惰性初始化并持久化**（写入同一事务），返回 `revision = 0`。非管理员请求**不触发初始化** |

```json
{
  "schemaVersion": 1,
  "revision": 3,
  "registrationMode": "invite_only",
  "allowWorkspaceOwnerInviteNewUsers": false,
  "inviteDefaultCanCreateWorkspace": false,
  "publicSignupDefaultCanCreateWorkspace": false,
  "implemented": {
    "registrationMode": false,
    "allowWorkspaceOwnerInviteNewUsers": false,
    "inviteDefaultCanCreateWorkspace": true,
    "publicSignupDefaultCanCreateWorkspace": false
  },
  "upgradedInstance": true,
  "updatedAt": "2026-10-09T00:00:00Z"
}
```

- `upgradedInstance`：本次初始化时实例已有账号（用于页面展示「已按旧版本行为保留」提示）。
- `updatedAt`：`server_config.updated_at`。

### 5.2 `PATCH /api/admin/settings`

| 项 | 内容 |
| --- | --- |
| 中间件 | `a.auth.Require` + 管理员校验 + `a.csrfRequired(...)` |
| 请求体 | `{ "expectedRevision": 2, "changes": { "inviteDefaultCanCreateWorkspace": false } }` |
| 响应 200 | 完整设置 DTO（与 GET 同构，含新 `revision`） |
| 解码 | 复用 `decode()`（`DisallowUnknownFields()` + 2MB 上限） |
| 错误码 | 400 `INVALID_REQUEST`；401 `UNAUTHORIZED`；403 `ADMIN_REQUIRED`；409 `REVISION_CONFLICT`；422 `REGISTRATION_NOT_READY`；500 `INTERNAL` |

**请求校验规则（按顺序）**

| 规则 | 失败响应 |
| --- | --- |
| `expectedRevision` 必须存在且为整数 | 400 `INVALID_REQUEST` |
| `changes` 必须存在且至少 1 个字段 | 400 `INVALID_REQUEST` |
| `changes` 只允许 §4.1 的 4 个业务字段（**不接受** `schemaVersion` / `revision` / `implemented`） | 400 `INVALID_REQUEST` |
| 布尔字段必须是严格 JSON 布尔（`null`、字符串、`0/1` 均拒绝） | 400 `INVALID_REQUEST` |
| `registrationMode` 必须是 `closed` / `invite_only` / `open` | 400 `INVALID_REQUEST` |
| `registrationMode == "open"` | **422 `REGISTRATION_NOT_READY`** |
| `expectedRevision != 当前 revision` | 409 `REVISION_CONFLICT` |
| 事务内操作者不再是启用中的管理员 | 403 `ADMIN_REQUIRED` |

**事务边界**（`SetMaxOpenConns(1)`，持有 `*sql.Tx` 时不得再走全局 `*sql.DB`）：

```
BEGIN
  1. 重新校验操作者 session + 未禁用 + is_admin
  2. 读取 site_settings（当前事务内）并校验结构
  3. 校验 expectedRevision
  4. 应用白名单 changes
  5. 校验 open 未就绪
  6. revision + 1，写回 server_config（含 updated_at）
  7. 写 admin_audit_events（action = site.settings_changed，changes_json 仅白名单前后值）
COMMIT
```

- 无实际变化（changes 与当前值完全一致）→ 原样返回，**不递增 revision**，不写审计。
- 审计写入失败 → 整体回滚。

### 5.3 生效点接口（本次必须接入，非新增路由）

| 现有接口 | 本次变更 |
| --- | --- |
| `POST /api/workspaces` | `core.CreateWorkspace` 事务内读取 `is_admin` / `disabled` / `can_create_workspace`，不满足 → 403 `WORKSPACE_CREATION_DENIED` |
| `POST /api/invites/{token}/accept` | 新账号分支：`signup_source = 'workspace_invite'`，`can_create_workspace` 取**接受时**的 `inviteDefaultCanCreateWorkspace`；已有账号分支不改动任何账号字段 |
| `POST /api/setup/admin` | `signup_source = 'setup'`，`can_create_workspace = true` |

### 5.4 前端 API client 增量

`web/src/api/client.ts` 的 `api` 对象新增两项（沿用 `request()`，自动带 CSRF header、抛 `APIError{code,message,status}`）：

```ts
siteSettings: () => request<SiteSettings>('/admin/settings'),
updateSiteSettings: (expectedRevision: number, changes: SiteSettingsChanges) =>
  request<SiteSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify({ expectedRevision, changes }) }),
```

`web/src/api/types.ts` 新增：

```ts
export type RegistrationMode = 'closed' | 'invite_only' | 'open';
export type SiteSettingKey = 'registrationMode' | 'allowWorkspaceOwnerInviteNewUsers' | 'inviteDefaultCanCreateWorkspace' | 'publicSignupDefaultCanCreateWorkspace';
export interface SiteSettings {
  schemaVersion: number;
  revision: number;
  registrationMode: RegistrationMode;
  allowWorkspaceOwnerInviteNewUsers: boolean;
  inviteDefaultCanCreateWorkspace: boolean;
  publicSignupDefaultCanCreateWorkspace: boolean;
  implemented: Record<SiteSettingKey, boolean>;
  upgradedInstance: boolean;
  updatedAt: string;
}
```

`web/src/api/hooks.ts` 新增 `keys.siteSettings = ['siteSettings']` 与 `useSiteSettings()`（`useQuery`，`retry: false` 对 401/403）、`useUpdateSiteSettings()`（`useMutation`，`onSuccess` 用响应直接 `setQueryData` 覆盖，避免二次请求）。

---

## 6. 需求池

### P0（必须）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| P0-1 | 迁移 `0017_site_settings_and_user_capabilities.sql` | 新增 `users.can_create_workspace` / `users.signup_source`（含 CHECK）；按「是否已有账号」写入两套 `site_settings` 默认；迁移在 `db.applyMigrations` 的既有事务中执行，不手工改库 |
| P0-2 | `internal/site` 类型化设置服务 | 支持在**调用方事务内**读写设置（接受 `DBTX` 接口，不直接用全局 `*sql.DB`）；读取时校验 `schemaVersion` / 字段白名单 / 类型；结构损坏返回明确错误，调用方失败关闭 |
| P0-3 | `GET /api/admin/settings` | 管理员返回完整 DTO；非管理员 403 `ADMIN_REQUIRED` 且**不触发初始化**；未登录 401 `UNAUTHORIZED`；响应带 `Cache-Control: no-store` |
| P0-4 | `PATCH /api/admin/settings` | 通过全部 §5.2 校验规则；`revision` 正确递增；无变化时不变；审计与设置写入同事务；并发两请求只一个成功、另一个 409 |
| P0-5 | 管理员路由中间件 | 新增 `a.adminRequired(...)`（登录 + `is_admin` + 未禁用），返回 403 `ADMIN_REQUIRED`（沿用 `writeError(w, status, code, message)` 结构） |
| P0-6 | `CreateWorkspace` 接入能力检查 | 事务内判定；无能力 → 403 `WORKSPACE_CREATION_DENIED`；管理员即使 `can_create_workspace=false` 仍可创建；禁用账号一律拒绝 |
| P0-7 | `AcceptInvite` 写入来源与初始授权 | 新账号 `signup_source='workspace_invite'` 且 `can_create_workspace` 取**接受时**的设置值；已有账号的来源/授权/密码/管理员身份均不被覆盖 |
| P0-8 | `SetupAdmin` 写入 `signup_source='setup'`、`can_create_workspace=true` | 首个管理员创建后字段正确 |
| P0-9 | `/admin/settings` 页面 + `/admin` 重定向 | 路由注册在 `web/src/app/router.tsx`，用 `lazyRouteComponent` 懒加载；`/admin` → `<Navigate to="/admin/settings" replace />` |
| P0-10 | 页面全部状态 | 加载中 / 加载失败 / 无权限 403 / 401 / 保存中 / 保存成功 / 保存失败 / 409 冲突，八种状态均有明确表现（见 §7） |
| P0-11 | 无新依赖、无新主题 | 不新增 npm/go 依赖；样式全部进 `*.css.ts`；字号只用 34/30/16/14/12，间距只用 10/12/16/20/32 |
| P0-12 | 单元测试（Go） | 覆盖：默认值新装/升级两套；`open` 被 422 拒绝；revision 冲突；布尔类型严格校验；损坏配置失败关闭；无权限不初始化；`SetMaxOpenConns(1)` 下事务内读设置不死锁（FAIL-03） |

### P1（应该）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| P1-1 | `admin_audit_events` 表 + `site.settings_changed` 写入 | 与设置保存同事务；`changes_json` 只含白名单前后值；不含密码/Cookie/令牌/任意请求体 |
| P1-2 | 管理员入口 | `AccountMenu` 在 `user.isAdmin` 时增加「站点管理」项（图标 `ShieldCheck`），点击进 `/admin/settings`；非管理员不显示 |
| P1-3 | `User` DTO 追加 `capabilities` | `/api/auth/session` 与 `/api/me` 返回 `{ canManageSite, canCreateWorkspace }`（服务端计算结果），保留既有字段与结构，不做破坏性包装 |
| P1-4 | 新建工作区入口按能力显示 | 无能力时列表页/空态不提供可执行创建动作，保留说明「新建权限由站点管理员管理」；直接 POST 仍被服务端拒绝 |
| P1-5 | 修复「邀请覆盖已有成员角色」 | `ON CONFLICT(workspace_id,user_id) DO UPDATE SET role=...` 改为不覆盖既有角色，响应返回实际角色；附回归用例 |
| P1-6 | 乱序响应保护 | 前端保存采用请求序号，旧响应不覆盖新状态 |
| P1-7 | 前端类型检查与构建 | `pnpm build` 通过；`go vet ./...` 通过 |

### P2（可选）

| ID | 需求 | 验收标准 |
| --- | --- | --- |
| P2-1 | 「恢复推荐默认值」操作 | 带确认弹层，明确写明「仅影响之后创建的新账号，已有账号不变」；未定稿，见 §10 Q6 |
| P2-2 | 首次管理员初始化并发原子性修复 | 初始化状态判断与首个管理员创建纳入同一事务；并发请求只产生一个结果 |
| P2-3 | 页面展示 `updatedAt` 与最近修改者 | 需要审计表沉淀后再做 |

---

## 7. 页面交互需求

### 7.1 信息架构与结构

沿用 `workspace-management.tsx` 的 Shell 结构（`web/src/features/workspaces/workspace-shell.css.ts`）+ 新建 `web/src/features/admin/admin.css.ts`：

```
站点管理 /admin/settings
├── 侧栏：品牌行 → 「站点管理」分组标题 → 导航项「站点设置」→ 底部「返回工作区」+ AccountMenu
├── 页头：H1「站点管理 / 站点设置」（30px/600；移动 24px）+ 移动端汉堡/返回
└── 主区（content 760px 容器）
    ├── 区一：新建账号的默认授权（已接入）
    └── 区二：尚未接入的设置（只读）
```

窄屏（≤760px）侧栏收进 `Drawer`，与 `workspace-settings.tsx` 的 `navigationDrawer` 模式一致。

### 7.2 区一：已接入设置（唯一可编辑项）

单行结构（`actionRow` 模式，与 `workspace-settings.tsx` 一致）：

- 左：`<h3>`「受邀新账号默认可创建工作区」+ 当前生效值（`Text size="sm"`）+ 说明 14px `c="dimmed"`：
  > 关闭后，通过工作区邀请新建的账号只能作为协作者加入，不能自己创建工作区。**仅影响之后创建的新账号；已有账号的授权不变，请在用户管理中单独调整。**
- 右：`Switch`（`checked` = 服务端已确认值，`onChange` 立即触发保存）
- 升级实例额外展示一行 12px `c="dimmed"`：
  > 此实例由旧版本升级，已保留旧行为（受邀新账号默认可创建工作区）。如需收紧，请手动关闭。

**符合 AGENTS.md**：选择器/开关直接调整并保存，不进入编辑态、不铺长表单、不设常驻「保存 / 取消」按钮。

### 7.3 区二：尚未接入的设置（只读）

三行，每行结构：`<h3>` 名称 → 当前值文字 → `Badge variant="light" color="gray"`「未接入」→ 12px `c="dimmed"` 说明。**不渲染任何可交互控件**（无 Switch、无 Select），整行 `aria-disabled` 语义由纯文本承载。

| 行 | 当前值文案 | 说明文案 |
| --- | --- | --- |
| 注册模式 | `仅邀请（invite_only）` | 尚无公开自助注册入口。该设置将在后续版本接入，当前不影响站点行为；所有新账号仍通过工作区邀请创建。 |
| 普通 owner 邀请新用户 | `允许` / `不允许` | 该设置将在后续版本接入。当前工作区 owner 邀请尚无账号的人时，不检查此项。 |
| 公开注册新账号默认创建授权 | `不允许` | 公开注册尚未提供，此设置在接入前不会生效。 |

### 7.4 状态一览

| 状态 | 触发 | 表现 |
| --- | --- | --- |
| **加载中** | query `isLoading` | 整页 `Center` + `Loader` + `Text`「正在读取站点设置…」（与 `account-settings-page.tsx` 一致），`role="status"` |
| **加载失败**（网络/500） | query `error` 非 401/403 | `Alert color="orange"`「无法读取站点设置」+「重试」按钮（`refetch`）+「返回工作区」。不重试 401/403 |
| **未登录** | `APIError.status === 401` / `code === 'UNAUTHORIZED'` | `<Navigate to="/sign-in" replace />` |
| **无权限** | `APIError.code === 'ADMIN_REQUIRED'`（403） | `EmptyState size="page" icon={ShieldAlert}`：标题「没有站点管理权限」；描述「此页面仅站点管理员可访问。」；`note`「如果你认为应该有权限，请联系站点管理员在用户管理中授予。」；`actions`「返回工作区」。**不提供「重试」**（重试改变不了结果），不展示任何设置数据 |
| **空态** | 不发生 | 设置对象服务端恒返回完整值，无空态。若 `implemented` 全为 false，区二显示 `EmptyState size="section"`「暂无可配置的站点设置」 |
| **保存中** | mutation `isPending` | Switch 保持用户新值但 `disabled`，行尾 `Loader size="xs"` + 12px「保存中…」；同时禁用该项再次切换与返回拦截（本页仅一项可编辑，无需全局禁用） |
| **保存成功** | mutation `onSuccess` | `notifications.show({ message: '站点设置已保存', color: 'blue' })`（沿用 `workspace-settings.tsx`）；用响应整体 `setQueryData`，`revision` 更新；Switch 恢复可用 |
| **保存失败**（网络/500/CSRF） | mutation `error` | 行下 `Alert color="red" role="alert"` 显示映射文案；**保留用户选择的值**并标注「尚未生效」，同时以 12px 显示「服务端当前值：允许」；提供「重试」与「使用服务端当前值」。`CSRF_INVALID` → 「会话校验已失效，请刷新页面后重试。」（沿用 `workspace-settings.tsx` 的 `errorMessage` 风格） |
| **409 冲突** | `code === 'REVISION_CONFLICT'` | **Modal**（非 Alert）：标题「站点设置已被其他管理员修改」；正文简述；两列对比「你的修改 / 服务端当前值」；按钮：「使用服务端当前值」（放弃我的修改、刷新 query）、「关闭」（回到页面由我重新修改）。**不自动重试、不自动覆盖、不把旧草稿写到新 revision** |
| **422 `REGISTRATION_NOT_READY`** | 兜底 | 前端不提供 `open` 控件，理论上不触发；仍需在 `errorMessage` 映射：「公开注册尚未就绪，暂不能启用。」 |

### 7.5 文案映射（`errorMessage` 函数，与 `workspace-settings.tsx` 同构）

```ts
if (error instanceof APIError && error.code === 'CSRF_INVALID') return '会话校验已失效，请刷新页面后重试。';
if (error instanceof APIError && error.code === 'ADMIN_REQUIRED') return '当前账号已无站点管理权限，请刷新页面确认。';
if (error instanceof APIError && error.code === 'REVISION_CONFLICT') return '另一位管理员已修改站点设置。';
if (error instanceof APIError && error.code === 'REGISTRATION_NOT_READY') return '公开注册尚未就绪，暂不能启用。';
if (error instanceof APIError && error.status === 401) return '登录状态已失效，请重新登录。';
return '操作未完成，请检查网络后重试。';
```

### 7.6 无障碍与样式约束

- 字号只用 34/30/16/14/12；间距只用 10/12/16/20/32（`DESIGN.md`）。
- 颜色只用 Mantine CSS variables / 既有 token；不新建第二套 token。
- Switch 与按钮均需键盘可达，焦点为 2px 信纸蓝 outline。
- 状态不能只靠颜色表达：「未接入」用文字 Badge，不只灰化。
- 所有过渡 150ms，尊重 `prefers-reduced-motion`。

---

## 8. 涉及文件（建议范围，供架构师确认）

**后端**

| 文件 | 变更 |
| --- | --- |
| `internal/db/migrations/0017_site_settings_and_user_capabilities.sql` | 新增 |
| `internal/site/settings.go`（拟新增包） | 类型化设置、默认值、revision、事务化读写 |
| `internal/site/policy.go` | `CanCreateWorkspace` 等能力判定 |
| `internal/site/errors.go` | 可映射为明确 API code 的业务错误 |
| `internal/api/admin.go`（拟新增） | 管理路由中间件、settings 路由与 DTO |
| `internal/api/api.go` | 在 `Routes()` 注册管理路由组 |
| `internal/core/workspaces.go` | `CreateWorkspace` 事务内能力检查 |
| `internal/core/invites.go` | `AcceptInvite` 写入来源与初始授权 |
| `internal/auth/service.go` | `SetupAdmin` 写入来源；`User` 结构按需追加 `CanCreateWorkspace` / `SignupSource` / `Capabilities` |

**前端**

| 文件 | 变更 |
| --- | --- |
| `web/src/api/types.ts` | `SiteSettings`、`RegistrationMode` 等 |
| `web/src/api/client.ts` | `siteSettings` / `updateSiteSettings` |
| `web/src/api/hooks.ts` | `keys.siteSettings`、`useSiteSettings`、`useUpdateSiteSettings` |
| `web/src/app/router.tsx` | `/admin`、`/admin/settings` |
| `web/src/features/admin/admin-settings-page.tsx`（拟新增） | 页面 |
| `web/src/features/admin/admin.css.ts`（拟新增） | 样式 |
| `web/src/features/account/account-menu.tsx` | 「站点管理」入口 |

---

## 9. 范围外清单（本次明确不做）

| 项 | 归属 |
| --- | --- |
| `/admin/users` 用户列表、详情抽屉、启停、管理员身份变更、撤销会话 | 下一包（阶段 5.1 用户管理切片） |
| `users.admin_revision` 与用户级 revision 并发控制 | 同上 |
| 「最后一个启用中管理员」保护、`SELF_DISABLE_FORBIDDEN` | 同上 |
| 注册模式 `closed / invite_only` 的**实际准入判定**、`GET /api/site`、`INVITE_NEW_USER_DENIED` | 阶段 5.2 |
| 公开注册（邮箱验证、SMTP、限流）、管理员显式建号、`account_enrollments` | 阶段 5.3，可选 |
| 审计查看页 `/admin/audit` | 阶段 5.4 |
| 站点名称、公告、上传大小等与人员准入无关的设置 | 不做 |
| 任意键值设置编辑器 / Feature Flag 系统 | 明确拒绝 |
| 用户永久删除、自动工作区接管、自定义角色、SSO/OAuth、配额计费 | 设计文档 §1.3 已排除 |
| 实时连接的用户级撤权（Hub 改造） | 阶段 5.1 用户管理切片 |
| 并发初始化原子性修复 | P2，独立切片 |

---

## 10. 待确认问题（需用户拍板）

| # | 问题 | 备选与建议 |
| --- | --- | --- |
| Q1 | **是否接受本次交付包含迁移 + 生效链路**（会改变升级用户的实际行为：旧账号保留创建能力、新受邀账号受新默认值约束），而不是只做一个「能存能读」的设置页？ | **建议：接受。** 否则开关是假开关，无法验收 |
| Q2 | **升级实例的 `inviteDefaultCanCreateWorkspace` 默认取 `true`（保留旧行为）还是 `false`（与新建一致）？** | 设计文档取 `true`。会牺牲「升级即收紧」，但保证不悄悄改变现有行为。**建议沿用 `true`**，并在页面明示「已按旧版本行为保留」，由管理员主动收紧 |
| Q3 | **是否在本次持久化一个暂不生效的 `registrationMode = 'invite_only'`？** 还是干脆不入库、等 5.2 再加字段？ | **建议：入库。** 结构一次定型、避免二次迁移；页面明确标注「未接入、当前不生效」 |
| Q4 | **是否需要 `/admin/users` 也在本次交付？** `/admin` 只有设置页时侧栏只有一项导航 | 用户原始诉求只提「站点管理设置页面」。**建议本次不做**，下一包补 |
| Q5 | **管理员入口放在哪里？** | 建议 `AccountMenu` 增加「站点管理」（`isAdmin` 时显示）。备选：`/settings` 页加入口；工作区列表页加入口 |
| Q6 | **是否需要「恢复推荐默认值」能力？** 本 PRD 已裁定不做「重置为出厂默认」 | 若确需，必须是独立确认弹层 + 明确「仅影响之后创建的新账号」，列为 P2 |
| Q7 | **是否本次就把 `capabilities` 加到 `/api/auth/session` 的 User DTO，并据此隐藏「新建工作区」入口？** | **建议做（P1）。** 否则管理员关掉开关后，旧会话仍显示创建按钮，点了才报错，体验割裂 |
| Q8 | **409 冲突后的默认选择**：要求用户显式选择（Modal 对比），还是自动刷新到服务端值并提示？ | **建议显式选择。** 设计文档要求「不自动覆盖对方修改」 |
| Q9 | **审计表是否在本次建表并写入 `site.settings_changed`？** | **建议是（P1）。** 设计文档要求 5.1 开始留痕。若希望本次更小，可降为下一包，但设置保存就不留痕 |
| Q10 | **文案语言**：继续全中文硬编码（与现有页面一致），还是引入 i18n？ | **建议继续中文硬编码**，不引入 i18n 框架（属新增依赖） |
