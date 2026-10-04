# Madoc Build & Deployment

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

使用发布的预构建镜像。以下示例将 HTTP 端口仅绑定到主机回环地址，供同一主机上的 HTTPS 反向代理转发：

```sh
docker pull ghcr.io/mahoo12138/madoc:v0.1.0-alpha.2
docker run -d \
  --name madoc \
  --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v madoc-data:/data \
  ghcr.io/mahoo12138/madoc:v0.1.0-alpha.2
```

镜像目标架构为 `linux/amd64` 和 `linux/arm64`，Docker 按主机架构选择镜像。版本标签固定为 `v0.1.0-alpha.2`；升级时显式选择目标版本，不依赖 `latest`。

生产部署必须由 HTTPS 反向代理接入。Madoc 进程提供 HTTP，生产会话和 CSRF Cookie 带 `Secure` 标记；直接通过普通 HTTP 访问容器端口不能作为生产浏览器登录方式。代理需将同一域名下的页面、`/api` 与 `/ws` 转发到 Madoc，并支持 WebSocket Upgrade。不要设置 `MADOC_DEV=true` 来绕过生产 Cookie 的安全设置。

首次通过 HTTPS 打开站点会进入「创建管理员」，填写姓名、邮箱与至少 8 个字符的密码；没有默认账号或密码。初始化完成后使用邮箱与密码登录，其他成员通过工作区邀请加入。`/healthz` 可用于检查进程是否启动。

容器中的 `MADOC_DATA` 默认为 `/data`，命名卷 `madoc-data` 保存数据库、附件和服务密钥。重建容器时继续挂载同一个卷，不能把删除容器等同于删除数据卷。只需一个 Madoc 容器，不需要 PostgreSQL、Redis、MinIO。

如需从源码构建：

```sh
docker build -t madoc .
```

将运行命令的镜像替换为本地 `madoc`，其余持久化及 HTTPS 要求相同。

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

使用上述 Docker 命名卷时，先停止服务，再用相同版本镜像运行维护命令；不能同时启动另一个服务实例访问同一数据库：

```sh
docker stop madoc
docker run --rm --network none \
  -v madoc-data:/data \
  ghcr.io/mahoo12138/madoc:v0.1.0-alpha.2 maintenance backup
docker cp madoc:/data/backups ./madoc-backups
docker start madoc
```

确认卷外备份已复制且可以读取，再进行升级或删除数据卷。

恢复前同样先停止 madoc：

```sh
madoc maintenance restore /path/to/backup-directory --confirm
```

恢复命令会先把当前数据库、Asset 和 server secret 保存到 `$MADOC_DATA/backups/pre-restore-*`；恢复失败时自动回滚，因此旧数据仍可找回。恢复完成后启动服务并检查 `/healthz`、登录、文档图片与白板。

恢复到另一台机器或独立空目录时，先使用目标 `MADOC_DATA` 启动一次 madoc，待健康检查
通过后停止服务，以创建目标数据库、assets 和 secret；无需创建管理员。然后在相同目标
环境变量下执行上述 restore 命令。当前 restore 不直接接受尚无数据库的空目录。

自动定时备份可以在 MVP 之后实现。

## 安全升级

1. 让协作者确认已保存，并关闭所有旧编辑页；下载需要保留的未同步本地副本。
2. 停止服务，使用当前版本执行备份，将数据库、附件和 `server.secret` 的完整备份复制到卷外。
3. 拉取目标版本镜像或替换二进制，继续使用原数据目录 / 数据卷。前端已嵌入二进制，服务和前端一起升级。
4. 启动服务，检查 `/healthz`、登录、原工作区、文档图片和白板；重新打开页面，不继续使用旧标签页写入。

增量迁移在启动时执行。回退不能只把旧二进制连接到已升级的数据库，应停服并恢复升级前完整备份，再使用对应旧版本。旧 AFFiNE / BlockSuite 原型数据不会自动转换，服务会拒绝 legacy schema；不要为了启动而删除原数据，处理边界见 [迁移说明](docs/MIGRATION.md)。

## Alpha 支持范围

v0.1.0-alpha.2 面向早期试用、单实例和小团队。整站离线启动、跨实例实时协同与历史原位覆盖式恢复尚未提供；性能容量上限、Safari / Firefox 及真机覆盖尚未完成验收。Item / 目录删除进入回收站，Workspace 删除仍永久；本地待提交草稿不是完整备份。详细功能及限制见 [发布说明](docs/releases/v0.1.0-alpha.2.md)。

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

## 固定提交发布回归

完整执行顺序、验收映射、Docker 持久卷冒烟与当前限制见 [发布检查](docs/RELEASE.md)。
普通 E2E、首次安装和真实进程重启必须分开运行，不复用现有工作数据。
