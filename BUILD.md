# madoc MVP Build & Development

## Prerequisites

- Go 1.25+
- Node.js 20+
- corepack
- pnpm
- 可选：air

## Development

推荐保留两个进程：

```text
Browser :8080
  ├─ Vite frontend
  └─ /api + /ws proxy
          ↓
      Go :3000
```

建议命令：

```sh
./dev.sh
```

后端：

```sh
MADOC_DEV=true MADOC_ADDR=:3000 air
```

前端：

```sh
cd web
pnpm install
pnpm dev
```

MVP Vite proxy 只需要：

- `/api`
- `/ws`
- `/info` 或 `/healthz`

删除：

- `/graphql`
- `/socket.io`

## Production Build

```sh
cd web
pnpm install --frozen-lockfile
pnpm build
cd ..

CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o madoc .
```

Go 使用 `go:embed` 嵌入 `web/dist`。

## Runtime Data

建议统一使用：

```text
$MADOC_DATA/
├── madoc.db
├── assets/
│   └── <workspace-id>/
└── server.secret
```

默认：

```text
./data/
```

推荐环境变量：

| Variable | Default | Description |
|---|---|---|
| `MADOC_DATA` | `./data` | 数据目录 |
| `MADOC_DB` | `$MADOC_DATA/madoc.db` | 可选覆盖 DB |
| `MADOC_ADDR` | `:3000` | Listen address |
| `MADOC_DEV` | unset | Development mode |
| `MADOC_MAX_UPLOAD_MB` | `20` | 单文件上传限制 |

首次启动会生成 `$MADOC_DATA/server.secret`，权限为 `0600`。该文件与数据库、Asset 一起构成可恢复备份，不能单独丢弃。

## SQLite

启动必须设置：

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

写入事务保持短小。

不要把大文件内容塞入 SQLite。Asset 文件写本地文件系统，SQLite 只保存 metadata。

## Docker

目标仍然是一个容器：

```sh
docker build -t madoc .
docker run -d \
  --name madoc \
  -p 3000:3000 \
  -v madoc-data:/data \
  -e MADOC_DATA=/data \
  madoc
```

不需要 PostgreSQL、Redis、MinIO。

## Backup

最低可接受备份包含：

- SQLite consistent backup；
- `assets/`；
- server secret/config。

不要仅复制处于活跃 WAL 写入状态的 `.db` 主文件并认为备份完整。

停止 madoc 进程后执行：

```sh
madoc maintenance backup
```

命令会先执行 WAL checkpoint，再将 `madoc.db`、`assets/` 和 `server.secret` 复制到 `$MADOC_DATA/backups/backup-*`，并对备份数据库执行 `PRAGMA quick_check`。该目录位于 Docker 数据卷内；请再把需要长期保留的备份复制到卷外存储。

恢复前同样先停止 madoc：

```sh
madoc maintenance restore /path/to/backup-directory --confirm
```

恢复命令会先把当前数据库、Asset 和 server secret 保存到 `$MADOC_DATA/backups/pre-restore-*`；恢复失败时自动回滚，因此旧数据仍可找回。恢复完成后启动服务并检查 `/healthz`、登录、文档图片与白板。

恢复到另一台机器或独立空目录时，先使用目标 `MADOC_DATA` 启动一次 madoc，待健康检查
通过后停止服务，以创建目标数据库、assets 和 secret；无需创建管理员。然后在相同目标
环境变量下执行上述 restore 命令。当前 restore 不直接接受尚无数据库的空目录。

自动定时备份可以在 MVP 之后实现。

## 独立进程重启验证

先构建嵌入前端，再单独运行重启测试（不要与普通 E2E 同时运行）：

```sh
pnpm --dir web build
pnpm --dir web exec playwright test --config playwright.restart.config.ts
```

测试要求本机 `127.0.0.1:3100` 空闲；每例自行构建二进制、创建临时数据目录并管理进程，
不会终止占用端口的外部进程。正常停服与 SIGKILL 分别覆盖发送前失败、ACK 丢失、
停服期间编辑和重启后刷新恢复；另验证维护命令备份并恢复到独立目录。测试结束清理
自身临时数据，失败轨迹位于 `web/test-results/`。

### Markdown 保存可靠性协议升级

包含 migration 0006 的版本要求 Markdown WebSocket 写入携带内容代际编号。
升级前请让协作者确认已保存并关闭编辑页，再按本文停服、备份、升级步骤操作。
服务与内嵌前端应一起升级，完成后重新打开页面；不要继续使用旧标签页写入。
旧标签页缺少编号的写入会被拒绝。迁移仅新增字段，不重写已有正文。
