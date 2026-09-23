# 固定提交发布检查

发布结论绑定完整 Git commit，不沿用之前提交的 STATUS 记录。改动正文协议、存储、
权限或编辑器后须重新验证。阶段 0 的行为设计见 `RELIABILITY.md` 和 `WHITEBOARD.md`。

## 重复执行

在目标提交的干净 checkout 中执行；本机需 Go、pnpm、已安装的 Chromium，
以及空闲的 `127.0.0.1:3100`。测试使用独立临时数据库，不指向真实数据目录。

```sh
git rev-parse HEAD
git diff --exit-code HEAD
pnpm install --frozen-lockfile
pnpm --dir web exec playwright install chromium
go test -count=1 ./...
go test -race -count=1 ./...
go vet ./...
pnpm --dir web typecheck
pnpm --dir web build
pnpm --dir web exec playwright test --grep-invert 'first run, invite, collaborative Markdown, whiteboard and export'
pnpm --dir web exec playwright test mvp.spec.ts
pnpm --dir web exec playwright test --config playwright.restart.config.ts
git diff --exit-code HEAD
```

按顺序执行并在任一步失败时停止。首次安装用例要求空数据库，故必须单独启动；
重启套件自行管理真实二进制和进程，不可与普通浏览器套件并行。不要通过复用真实
服务或已有数据库使测试通过。保存命令输出、失败 trace 与完整提交号；重跑通过也要
记录最初失败及原因，不能只保留最后的绿色结果。

Docker 在同一提交上重新构建，并使用新测试数据卷检查初始化、`/healthz`、
`server.secret` 权限 `0600`，移除并重建容器后检查登录和原 Workspace 保留。
仓库提供 Python 3 标准库脚本完成此检查，只清理本次创建的测试容器和数据卷：

```sh
docker build -t madoc-release:candidate .
python3 scripts/docker-smoke.py madoc-release:candidate
```

脚本直连容器 HTTP 端口并显式回传 Secure cookie；不因此关闭生产 cookie 安全标记。
真实浏览器部署应由 HTTPS 反向代理接入，此脚本不代替 TLS 配置验证。维护 CLI 的备份 / 独立目录恢复由重启套件验证；
实际部署仍按 `BUILD.md` 的停服、备份、升级和恢复步骤执行。

## 阶段 0 验收映射

| 条件 | 直接验证 |
| --- | --- |
| 部分 / 重复 / 未知 ACK 不提前确认 | Markdown save-state、Whiteboard save-state 和单元场景 |
| 待提交内容跨刷新 / 切换 / 重开恢复 | Markdown outbox、recovery；Whiteboard recovery、account-recovery、storage |
| 存储失败与权限冲突不静默丢失 | 两种编辑器的失败重试和只读下载；独立账号恢复入口 |
| 已确认内容和未确认内容经真实重启仍完整 | restart-tests 的 SIGTERM / SIGKILL、丢发送 / 丢 ACK 场景 |
| `.md` 导出满足选定水位 | markdown-export、core markdown_export 测试 |
| 撤权连接、viewer、跨工作区隔离 | realtime access、core / account / auth、permission-revocation |
| 升级增量迁移不重写正文 | db 回填 / 重复迁移、core generation / receipts |
| 新安装和独立目录恢复 | 独立 mvp.spec、backup-restore.spec、maintenance 测试 |
| 编辑体验未回退 | 普通浏览器全套回归，含公式、脚注、图片、Outline、偏好和窄屏 |

## 当前产品限制（截至阶段 4）

阶段 1 已接入 Item / 子树回收站、恢复和名称确认彻底删除，详见 `CONTENT_LIFECYCLE.md`。
删除前仍应确认目标和子项；实例备份需要独立保留。本地待提交草稿不是完整文档历史，也不保证
包含所有已保存内容。

本地恢复覆盖当前浏览器保留的正文和白板草稿；清除站点数据会删除这些本地副本。整站离线启动和
历史版本原位覆盖式恢复尚未实现。阶段 3 已提供 Markdown / 白板版本历史及恢复为新副本；阶段 4
提供单项只读分享与固定发布，但不提供公开目录或完整发布站点。白板本地草稿副本保留草稿中的
嵌入文件。升级代际协议前需让协作者保存并关闭旧编辑页，详见 `BUILD.md`。

## 阶段 3 验收

固定实现提交：`c5e74dd`（`feat: report content version storage usage`）。

- `go test ./...`、`go test -race ./...`、`go vet ./...`、前端 typecheck / production build 通过。
- 2 项 Chromium 历史 E2E 通过：Markdown 手动检查点、历史正文查看与恢复副本；白板 SVG 预览和旧场景恢复。恢复后源文档内容保持不变。
- 1 项真实二进制 CLI 备份 / 独立目录恢复 E2E 通过：保存 Markdown 手动版与附件、白板自动版和历史用量；恢复后检查点 / 附件字节 / 删除保护 / 用量统计一致。
- 核心专项覆盖 compaction 后历史不变、projection 滞后拒绝、viewer 写拒绝、手动永久保留、自动版 15 分钟合并 / 30 条 / 90 天、1 GiB 暂停、共享附件唯一计量、事务性副本恢复和恢复失败回滚。

历史容量按保存的版本 payload 和至少被一条历史记录引用的附件唯一字节计算。1 GiB 自动建版暂停
为软限制：现有手动版本永久保留，因此用户创建手动版本后 Workspace 历史可超过该值。

## 首轮记录

基线：`3309a30eb32e65e299d9052d6d939758e19379cb`。

- Go test / race（均 `-count=1`）/ vet、前端 typecheck / production build 通过。
- 普通浏览器全套首次运行：212 通过、2 失败。两项原用例独立连续五轮均通过；
  保留首次失败，不以重跑绿色覆盖失败记录。
- 白板失败只有 `boundElements: null` 与 `[]` 的差异，已从安装的 Excalidraw 0.18.1
  `restoreElementWithProperties` 确认其恢复时的归一化；导出比较仅统一该字段，
  其余字段及服务端备份前后比较仍严格相等。
- 图片源码拖选在两行 textarea 的中线取坐标时未形成选区；调整为等待布局稳定并
  选择第一行，保留真实鼠标拖动、选区长度和禁止拖起图片的断言。
- 同基线 Docker 镜像构建与持久卷冒烟通过。最初脚本未回传 Secure cookie 而收到
  401，改为显式传递测试 cookie 后通过；未修改服务端安全配置。

调整后三个相关场景连续五轮（15 次）通过；独立首次安装和 5 项真实重启 / 备份恢复通过。

本次增加测试和发布操作文档，尚不构成阶段 0 通过结论。后续需以包含测试调整的
固定提交重新执行完整门槛。

## 第二轮基线检查

基线：`9b1cccc97726930dfc2c7329d00347b697f65945`。Go test / race（均 `-count=1`）/
vet、前端 typecheck / production build、Docker 构建及持久卷冒烟通过。
普通回归 213 通过、1 失败：Outline 测试通过 DOM API 设置选区，未同步触发
selectionchange，后续按键可能使用编辑器旧选区。添加该标准事件通知后，原用例
连续 10 次通过，删除与撤销断言保持不变。调查期间的撤销配置试验已全部撤回，
本轮最终未改变产品代码。尚需在测试修正提交上完成完整门槛。

## 阶段 0 通过记录

验收提交：`9c908d7845c645180c5194a06d3aae18e2f840fb`，2026-09-23（UTC+8）。
执行前后受版本控制的工作树均无改动，所有步骤在该固定提交上完成。

| 检查 | 结果 |
| --- | --- |
| Go test（`-count=1`） | 通过 |
| Go race（`-count=1`）及 vet | 通过 |
| 前端 typecheck / production build | 通过 |
| 普通浏览器全套 | 214 项通过，无重试，约 3.6 分钟 |
| 独立首次安装 / MVP 核心流程 | 1 项通过 |
| 真实进程 SIGTERM / SIGKILL 与独立目录备份恢复 | 5 项通过 |
| Docker 构建及独立数据卷冒烟 | 通过 |

主机环境：Darwin arm64、Go 1.27.0、Node 22.14.0、pnpm 10.6.3、Playwright 1.55.0 / Chromium。
Docker 镜像 ID：`sha256:458d7ab570cc4ffde74cecebe60f2137cdb00b6f984439c794640364557532e7`。
Docker 构建使用仓库 Dockerfile 的 Go / Node 基础镜像，与主机工具版本独立。

本记录验证阶段 0 的既定支持范围，可推进阶段 1。先前两轮失败仍保留在上文，
不以此次通过删除调查记录。回收站、完整迁出与历史功能继续按 `ROADMAP.md` 推进。


## 阶段 1 通过记录

验收提交：`db903af54289f5d7f3e3cc6cc2c5db20ad4df981`，2026-09-23（UTC+8）。
执行前后受版本控制的工作树无改动。独立临时数据目录验证，无测试重试。

| 检查 | 结果 |
| --- | --- |
| Go test / race（均 `-count=1`）及 vet | 通过 |
| 前端 typecheck / production build | 通过，保留既有 bundle 大小提示 |
| 普通浏览器全套 | 235 项通过，约 4 分钟 |
| 独立首次安装 / MVP 核心流程 | 1 项通过 |
| 真实进程 SIGTERM / SIGKILL 与独立目录备份恢复 | 5 项通过 |
| Docker 构建及独立数据卷冒烟 | 通过 |

Docker 镜像：`sha256:9a7a4bd4391bdb93ee6dfb092c22cee4a84849f7d3828563cf2bc62468e6995d`。
主机环境与阶段 0 记录一致。备份恢复同时严格校验收藏和原始访问时间，校验完成后
才重新打开编辑器，避免实际访问更新记录干扰备份比较。

| 阶段 1 条件 | 直接证据 |
| --- | --- |
| 删除父目录后完整恢复本次子树，不误恢复早期批次 | core trash 测试与 trash-api E2E，校验 Markdown、白板、receipt、层级 |
| 原位置失效要求明确选择，失败原子回滚 | core trash rollback / destination、桌面与手机 trash-ui |
| 图片不丢，彻底删除保护独立批次 | trash-api 上传后恢复逐字节比对；trash-purge API / core |
| 搜索工作区与权限隔离 | core search permission、HTTP search / 未登录拒绝 |
| 中文短词、改名、移动、删除及恢复检索 | core search literal / lifecycle，search-api / search-ui |
| 旧页面撤权、降级、删除后停止写入并保留救援 | realtime access、permission-revocation、workspace-live、outbox / recovery |
| 收藏与最近访问私有且随生命周期更新 | core personal、personal-items-api、桌面 / 手机 personal-navigation |
| 迁移不破坏原数据 | schema 6 到 7、schema 7 到 8 保留测试及重复迁移 |

本记录证明阶段 1 既定功能范围通过，可进入阶段 2。没有自动清理回收站或附件；
Workspace 删除仍要求独立名称确认。大语料、长文、数百图形和五人并发的 p50/p95
性能基准尚未建立，本次不是容量或性能支持上限的验收。完整带附件迁出与历史恢复
继续按后续阶段推进。

## 阶段 2 通过记录

验收提交：`7583b76f8045a5e632edad66e6fb86a654eaa745`，2026-09-23（UTC+8）。
在该固定提交上从干净的受版本控制工作树执行；首次安装、浏览器、重启套件使用独立临时数据目录。

| 检查 | 结果 |
| --- | --- |
| Go test / race（均 `-count=1`）及 vet | 通过 |
| 前端 typecheck / production build | 通过；保留既有大 chunk 提示 |
| 普通 Chromium 浏览器回归 | 314 项通过，无重试 |
| 独立首次安装 / MVP 核心流程 | 1 项通过 |
| 真实进程 SIGTERM / SIGKILL、导入中断与备份恢复 | 6 项通过 |
| Docker 构建与独立持久卷冒烟 | 通过 |

Docker 镜像：`sha256:c4bd35e32fe27ffd68d39b318d91645db0f7a7c4eceb08265c13e6784d2d77e0`。
主机环境：Darwin arm64 26.6.2、Go 1.27.0、Node 22.14.0、pnpm 10.6.3、Playwright 1.55.0 / Chromium。
Docker 冒烟验证首次初始化、`/healthz`、`server.secret` 权限与稳定性、重建容器后登录及 Workspace 保留。

两轮验收调查修正了白板导出菜单的 Playwright 精确匹配，以及脚注用例在服务端投影包含第二段正文前就刷新导致的时序问题；相关专项随后通过，最终固定提交上的全套浏览器检查为 314/314。此前首次安装和普通浏览器首次执行中的失败记录保留在测试产物 / 提交历史中，不以旧提交结果替代本记录。

本记录证明阶段 2 完成其既定功能与固定提交发布门槛，可以开始阶段 3。阶段 3 的历史检查点容量 / 保留策略和资产生命周期须按产品数据安全边界单独实现与验证。
