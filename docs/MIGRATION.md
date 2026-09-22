# MVP Architecture Reset & Migration

## 1. 迁移性质

这是 MVP 阶段内部的一次架构重置，不是正式版本升级。

旧原型路线的核心假设：

> AFFiNE frontend + BlockSuite + AFFiNE-compatible backend.

新的 MVP 路线：

> madoc frontend + Milkdown + Excalidraw + madoc-native backend.

因此必须主动删除 compatibility，而不是让新旧模型长期共存。

## 2. KEEP / DELETE / REWRITE

### KEEP

可以直接或小幅整理后继续使用：

```text
.air.toml
.gitignore
Dockerfile              # 结构保留，内容需更新
dev.sh                  # 结构保留，proxy 需更新
main.go                 # 启动框架保留，route 重写

internal/auth/
  password.go
  service.go            # session、setup、sign-in
  http.go               # auth middleware 与 CSRF

internal/db/db.go

web/
  Vite
  React
  TanStack Router
  TanStack Query
  Vanilla Extract
```

### DELETE

MVP 不保留：

```text
internal/graphql/

web/packages/common/doc/
web/packages/frontend/editor/
```

以及所有：

```text
@blocksuite/*
AFFiNE-specific GraphQL
AFFiNE serverConfig
AFFiNE realtime:request
AFFiNE realtime:subscribe
AFFiNE quota/license/payment/git/calendar stubs
space:* compatibility
userspace compatibility
```

删除 `/graphql` route。

删除 `/socket.io` route。

### REWRITE

```text
internal/db/schema.sql
internal/db/repo.go
internal/sync/           -> internal/realtime/
main.go routes
go.mod

web/src/api/
web/src/routes/workspace.*
workspace UI
editor UI
```

`web/src/routes/setup.tsx` / `sign-in.tsx` 可以保留视觉和结构参考，但 API contract 改成 madoc MVP。

## 3. go.mod

预期移除：

```text
github.com/zishang520/socket.io/v2
```

以及由它带来的 Engine.IO / WebTransport 依赖。

预期增加：

```text
github.com/coder/websocket
```

是否保留 `gorilla/securecookie` 由 auth 重构决定。

`modernc.org/sqlite`、chi、crypto 保留。

## 4. Frontend package

预期移除：

```text
@blocksuite/icons
@madoc/doc
@madoc/editor
```

增加：

```text
@milkdown/crepe
@milkdown/plugin-collab
yjs
y-protocols
y-prosemirror
@excalidraw/excalidraw
```

注意：若 Crepe 已间接包含某些 Milkdown 包，也应只依赖代码直接 import 的 package，不依赖隐式 hoist。

## 5. Legacy Database

现有 15 表不要在第一次 MVP migration 中 DROP。

建议：

### Step A

创建 canonical MVP 表，旧表原样保留。

### Step B

新代码只使用 MVP 表。

### Step C

提供检测：

若发现 legacy tables：

```text
Legacy madoc development data detected.
The MVP runtime does not automatically convert AFFiNE/BlockSuite documents.
Back up the database before removing legacy data.
```

### Step D

如果确认仓库只是开发环境，可以提供显式：

```text
madoc maintenance legacy-clean
```

或单独 SQL / migration，而不是启动时静默 DROP。

## 6. User / Workspace Migration

可迁移的简单 metadata：

- users；
- workspace；
- membership；
- invites。

但字段 semantics 不同：

- session 在旧原型中是 AFFiNE-style multi-user container；
- role 在旧原型中是 numeric AFFiNE role；
- MVP role 是 owner/editor/viewer。

如果项目尚无需要保留的真实数据，代码可以只保留 migration utility 设计而不投入大量时间做完整转换。

## 7. Document Migration

不能假设：

```text
legacy Yjs blob == Markdown
```

BlockSuite 文档 model 与 Milkdown ProseMirror model 不同。

若必须迁移真实文档，需要 legacy exporter：

```text
legacy BlockSuite data
       ↓
old frontend / BlockSuite runtime
       ↓
export Markdown
       ↓
MVP Markdown importer
```

不要让 新的 Go server 解析 BlockSuite Yjs。

## 8. Whiteboard Migration

AFFiNE Edgeless ≠ Excalidraw scene。

不提供自动转换属于合理边界。

如果未来有真实需求，再做独立 importer。

## 9. Git History

不要删 Git 历史。

建议在 reset 前：

```sh
git tag pre-mvp-affine-port
```

这样旧实现仍可审阅和提取代码。

## 10. 推荐迁移 commit 顺序

```text
docs: define MVP architecture

chore: tag and preserve pre-reset baseline

refactor: remove affine graphql compatibility

refactor: remove blocksuite frontend packages

feat: add MVP database schema and migrations

feat: add workspace and item rest api

refactor: replace socket.io with native websocket

feat: rebuild workspace shell

feat: add milkdown editor

feat: add markdown collaboration

feat: add excalidraw

feat: add whiteboard collaboration

chore: finalize MVP build and deployment
```

每一步保持仓库可构建，除非某个 commit 明确是短生命周期的 mechanical removal，并紧接修复 commit。

## 11. 阶段 1 的 Item 回收站增量迁移

`0007_item_trash.sql` 在 canonical schema 上新增删除批次表和可空的 Item 批次引用。
既有 Item 保持活动状态，正文、白板、更新 / receipt 和附件不重写、不删除。
普通删除 API 改为软删除；恢复 API、权限和并发边界见 `CONTENT_LIFECYCLE.md`。
升级前按 `BUILD.md` 停服备份。不要把旧二进制接回已启用回收站的数据库：旧版不会
过滤删除标记，且旧删除逻辑仍执行物理级联；需要回退时使用升级前的完整备份。

## 12. 个人导航增量迁移

`0008_personal_items.sql` 仅新增按用户和 Item 隔离的收藏 / 最近访问表及索引。
不重写 Item、正文、白板或删除批次；反复启动不清除个人状态。权限和生命周期见
`PERSONAL_NAVIGATION.md`。升级前停服备份，回退使用升级前完整备份。
