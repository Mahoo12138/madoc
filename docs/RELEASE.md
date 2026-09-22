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

## 当前产品限制

阶段 1 前 Item / 子树删除仍是永久删除，没有回收站。删除前确认目标和子项，重要内容
应先导出并完成实例备份；本地待提交草稿不是完整文档历史，也不保证包含所有已保存内容。
建议在回收站完成后再大量迁入真实资料。

本地恢复只覆盖当前浏览器留下的正文和白板草稿，清除站点数据会丢失这些副本。
整站离线启动、Markdown 带附件迁出和版本历史尚未实现。白板副本保留草稿内的
嵌入文件。升级代际协议前需让协作者保存并关闭旧编辑页，详见 `BUILD.md`。

## 本轮记录

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
