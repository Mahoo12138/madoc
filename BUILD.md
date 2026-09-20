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
└── backups/
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

生产环境中的 secret（session / CSRF）不得硬编码在 `main.go`。若未配置，应在首次启动时生成并持久化到 data directory 或 server config table。

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

MVP 可以提供：

1. 停服备份；
2. SQLite online backup / `VACUUM INTO` 路线；
3. assets directory archive。

自动定时备份可以在 MVP 之后实现。
