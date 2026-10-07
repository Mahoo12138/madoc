# 固定提交发布检查

## v0.1.0-alpha.4 发布准备（2026-10-07）

Alpha.3 固定源码 `5d550d861fee703eb83f3d85d5e58ab86f98571c` 的远端 [37488738110](https://github.com/Mahoo12138/madoc/actions/runs/37488738110) 前端 typecheck / build、Go test / race / vet 通过，普通 Chromium 413 / 414 通过；独立 MVP、重启与 publish 按失败门槛未执行。副本截屏回归通过，唯一失败为大纲远端标题更名用例。完整日志 `/tmp/madoc-alpha3-ci-verify-failure.log`，官方 [失败产物 11424898311](https://github.com/Mahoo12138/madoc/actions/runs/37488738110/artifacts/11424898311) 下载摘要 `72ef43234370813a3e746714b2be784b322eb0d441e715f735765e9c4ca0883b` 已验证。

轨迹显示远端 h3 点击、Home、输入“改名”后实际正文为“小节改名”，本地同步完全相同且仍有“展开 小节改名”，子项保持折叠。失败是标题起始光标的输入前提未成立，没有显示协作或折叠状态丢失。将该处改为 DOM Range 明确定位标题文本起点，通知 selectionchange，先检查远端为“改名小节”，再沿用全部本地折叠、远端独立状态与删除后隔离断言。大纲全文件 3 / 3、受影响场景重复 3 / 3 通过，无测试重试，记录在 `/tmp/madoc-alpha3-outline-validation.log` 与 `/tmp/madoc-alpha3-outline-repeat3.log`。

发布入口调整为候选分支先验收：`codex/release-v0.1.0-alpha.4` 的 push 使用事件固定 SHA，完整检查及生产候选镜像持久性检查通过后，才创建注解 tag 并上传 GHCR / Release。既有 tag 严格检查目标提交，不更新 / 覆盖；手动既有 tag 和 tag push 入口继续按固定 tag 验收。取消策略只作用于候选 verify job，进行中的 publish 不因分支更新被取消，同版本 publish 串行。GitHub API 失败必须终止，不能被当成 tag 缺失；同一次 Git ref 响应读取类型和 SHA，防止混用查询结果。

本轮 Go test（`-count=1`）/ vet、前端 typecheck / production build、最终工作流 `actionlint 1.7.12` 与 diff 检查通过，日志在 `/tmp/madoc-alpha4-{go-test,go-vet,typecheck,build,actionlint-final}.log`。标签 shell 以离线 fake gh 执行：首次审阅发现旧 matching-ref SHA 与新 ref 类型混用的竞争，修正为同一响应读取类型及 SHA；最终 GNU Bash 5.2 的 18 / 18 场景通过，覆盖新建、已有轻量 / 注解 tag、ref 移动、提交不一致、网络失败、空响应、非法 SHA 和 ref 创建竞争。未对真实 GitHub执行这些模拟写操作，记录在 `/tmp/madoc-release-tag-audit/results.json`。工作流用仓库 `GITHUB_TOKEN` 创建通过验收的 tag，其 push 不触发递归运行，见 [GitHub 官方触发说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)。

正式发行物仍须下载核对四平台校验和 / 源码 SHA / 干净状态，并运行原生 macOS arm64 与发布的 Linux arm64 镜像持久性检查；镜像 Public 后验证无 Docker 凭据的匿名访问。验证器已在干净 Alpha.3 源码的本地候选上预演，确认生产 cookie、API、资源 MIME、初始化和真实重启的检查预期正确；该预演不代表正式发行物已经通过。

## v0.1.0-alpha.3 发布准备（2026-10-06）

Alpha.2 的固定提交 `cea1adecfab147cec5b696ff5af7966643d33612` 在远端 [37227480767](https://github.com/Mahoo12138/madoc/actions/runs/37227480767) 的前端 typecheck / build、Go test / race / vet 通过；普通 Chromium 413 / 414 通过，唯一失败为副本桌面用例，后续独立 MVP、重启恢复与 publish 均按门槛未执行。完整日志为 `/tmp/madoc-alpha2-ci-failure.log`，官方 [失败产物 11313021491](https://github.com/Mahoo12138/madoc/actions/runs/37227480767/artifacts/11313021491) 下载文件 SHA256 `026e4d7b3581a38344ff6ea60007c2817db9a6e121d4986d56b96bdad6d71767` 已验证。

失败轨迹确认，名称填入后副本弹窗仍存在；约 135 ms 的 fullPage 截图期间画面短暂切到手机布局，桌面侧栏及其弹窗卸载，回到桌面后操作组件 IDs 全部换新。之后定位“创建副本”耗尽 60 秒总预算，没有发出复制请求。该截图高度由 720 扩为 762，正文和标题保持；独立原用例无重试复现 3 / 3 通过。这不是保存 ACK 或复制 API 的失败，不通过增加 timeout、重试或减弱内容断言掩盖。将此处改为视口截图，保留弹窗和名称检查及原保存阻塞、复制次数、独立内容 / ID 断言。

独立诊断在原 fullPage 步骤的第 4、5 轮捕获瞬时 `innerWidth=1 / innerHeight=1`，两条媒体查询变为 true，随后弹窗 DOM 移除，再恢复 1280×720；没有 Escape、关闭点击或复制提交。调查按指令停止，主动中断及未执行轮次不计为失败。仅在临时夹具改用视口截图后 3 / 3 通过，逐事件确认没有 resize、media-change 或 1×1 视口；证据在 `/tmp/madoc-duplicate-repro/viewport-verification.json`。

仓库修正后的副本专项最终 5 / 5 通过，包含截图后弹窗与名称仍保留的新断言；追加断言前的桌面重复 3 / 3 通过，均无测试重试。Go test（`-count=1`）/ vet、前端 typecheck / build 与 diff 检查通过，日志为 `/tmp/madoc-alpha3-go-test.log`、`/tmp/madoc-alpha3-go-vet.log`、`/tmp/madoc-alpha3-typecheck.log`、`/tmp/madoc-alpha3-build.log`、`/tmp/madoc-alpha2-duplicate-ui-final.log`。原桌面重复的首次 grep 锚点未匹配任何用例，调整标题匹配后才执行；首次专项启动受 Go 默认缓存写权限阻止，授权后使用临时缓存完成。

保留已推送 Alpha.2 tag，不覆盖候选；新目标为 `v0.1.0-alpha.3`。修改测试夹具与发布记录，不改变正文协议、权限和保存逻辑。完整远端门槛及下载 / 匿名镜像验证仍待执行。

## v0.1.0-alpha.2 发布准备（2026-10-05）

首个候选 `v0.1.0-alpha.1` 的远端普通 Chromium 411 / 414 通过，两个错误提示用例暴露真实登录状态挂载竞争，分享用例在活动房间关闭尚未完成时 PUT 替换正文被安全保护拒绝。保留原 tag 与所有失败记录；新目标 `v0.1.0-alpha.2` 包含 `retryOnMount: false` 修复、受控慢懒加载 / 请求次数回归、合法顺序的分享夹具及遗漏品牌文案修正。

修正后账号 / 管理 11 项、分享 4 项回归，以及 Go test / vet、前端 typecheck / build 通过。分享源正文额外确认仍包含远程图片与危险链接；首次新增断言因私有编辑器会转义目标括号而失败，按实际规范化源码校正，未减弱公开渲染断言。沙箱首次禁止本地端口绑定的失败也保留，授权后服务使用独立临时数据库。日志分别在 `/tmp/madoc-alpha-session-fix-tests-authorized.log`、`/tmp/madoc-alpha-share-fixture-final-tests.log`，初次附加断言轨迹在 `/tmp/madoc-alpha-share-fixture-initial-results/`。

发行仍待新 tag 的完整远端 Go / race / vet、前端构建、414 项普通 Chromium、独立 MVP、6 项真实重启 / 备份恢复及生产镜像持久卷检查。控制器将产物放在仓库外，下载后须对四平台归档验证 SHA256、二进制源码提交、`vcs.modified=false`，并检查最终镜像 manifest、OCI 来源与摘要。

## v0.1.0-alpha.1 发布准备（2026-10-05）

首轮固定提交 `20685fa4e943a4d0abe2d7d23fc9b9ac83ec532e`：锁文件安装、Go test / race（`-count=1`）/ vet、前端 typecheck / production build 通过；普通 Chromium 全套 412 / 414 通过，后续首次安装、重启恢复和固定提交 Docker 检查按门槛停止，未运行。

两项失败均在 `personal-navigation.spec.ts` 的桌面收藏操作：恢复 API 返回 204，收藏 / 最近访问 GET 正常返回；另一用例的键盘取消收藏与未删除断言也已通过。隐藏按钮默认 `opacity: 0; pointer-events: none`，测试直接 click / hover 时被父行命中检查拦截。修正为先进入父行悬停，再验证 `opacity: 1` / `pointer-events: auto` 并保留原业务操作与断言；不强制点击、不增加重试、不改产品样式。

首次失败日志与 Go 检查记录保存在 `/tmp/madoc-alpha-release-checks/`；两项轨迹及截图保留在 `/tmp/madoc-alpha-release-first-test-results/`。候选镜像的准备性构建与原生产持久卷冒烟此前已通过，但不代替新固定提交的最终检查。Browser / CUA 初始化反复 30 秒超时，浏览器验收使用仓库已有 Playwright 流程。新固定提交与远端发行物验证待完成。

第二轮固定提交 `a54b5d8d2f315af1679d63133ae7bba4a1ae3521`：Go test / race / vet、前端 typecheck / build、414 项普通 Chromium 与独立首次安装 / 邀请 / 协作 / 导出全部通过，无重试。6 项真实重启测试中 5 项通过，备份恢复用例等待旧白板状态文案 `Saved` 而失败；当前项目工具栏已统一为「已保存」。同步该用例首次建图及恢复后导出的两处文案断言，保持备份、独立目录、附件、历史、session、回收站与导出等价校验。固定提交 Docker 检查按失败门槛尚未运行。日志保存在 `/tmp/madoc-alpha-release-final-checks/`，首次重启失败轨迹在 `/tmp/madoc-alpha-release-restart-first-test-results/`。

同步状态断言后，6 项真实重启 / 独立目录备份恢复全部通过，无重试，日志在 `/tmp/madoc-alpha-restart-final.log`。此调整仅更新两处测试文案，没有改变受测产品代码。最终 tag 的完整门槛由发布工作流重新执行，成功后才上传镜像并创建预发布。

Alpha.1 完整远端运行 [37225613180](https://github.com/Mahoo12138/madoc/actions/runs/37225613180) 在固定源码 `432df65c561bda15feb5b788a5fcdc6e2b9ccec1` 上前端 typecheck / build、Go test / race / vet 通过；普通 Chromium 411 / 414 通过，无重试，约 13.8 分钟。后续独立 MVP、重启与发布按失败门槛未执行。完整日志 `/tmp/madoc-alpha-ci-full-failure.log`；官方失败产物 [11312173258](https://github.com/Mahoo12138/madoc/actions/runs/37225613180/artifacts/11312173258) 下载为 `/tmp/madoc-alpha1-ci-failure.zip`，SHA256 `8dd7138bed3b29af30ee7790feda12b08f1745b3347afbad02be214237c9a454` 已核对。

两份直达页面轨迹在无 UI click 时出现 session 503 → 200，相隔约 20 / 34 ms；独立隔离复现通过控制懒加载 chunk 重现，设置 `retryOnMount: false` 后 4 个候选场景均只在手动重试时请求并恢复。公开分享失败轨迹只有 PUT Markdown 的 409，没有版本 / 分享创建或公开页请求；对应 API 明确拒绝活动协作房间被整体替换。修正按原设计保留安全保护和全部渲染断言，不重试 / 强制覆盖来绕过冲突。

最终 tag `v0.1.0-alpha.1` 固定源码为 `432df65c561bda15feb5b788a5fcdc6e2b9ccec1`，该提交本地 Docker 构建与生产新卷 / 重建容器持久性冒烟通过。首次 main / tag 原子推送没有生成 Actions 运行，原因未确认；发布控制器随后独立提交，仍检出既有 tag 验收，发布仅使用验收输出的源码 SHA。

首次远端运行 [37224537436](https://github.com/Mahoo12138/madoc/actions/runs/37224537436) 的锁文件安装及 Go 内部各包测试通过，根包在全新 checkout 下因 `go:embed all:web/dist` 没有构建目录而失败。race / vet、浏览器及发布 job 未执行；失败日志保留在 `/tmp/madoc-alpha-ci-first-verify.log`。此前本地构建目录掩盖了这个顺序错误，控制器改为先执行前端 typecheck / build，再执行 Go 与浏览器检查，不重写已推送 tag，不以重跑结果覆盖此失败记录。

第二次远端运行 [37224813149](https://github.com/Mahoo12138/madoc/actions/runs/37224813149) 的前端 typecheck / build 与 Go test / race / vet 通过。发行物预检发现仓库内未忽略的 `dist/` 会使后续归档二进制带 `vcs.modified=true`，因此在旧运行仍验收时更新控制器并取消该运行；未上传镜像或创建 Release。浏览器取消前 dot 报告有 320 个完成结果，其中 3 项失败，没有终局失败详情，不构成全套通过。完整日志保留在 `/tmp/madoc-alpha-ci-cancelled-verify.log`。新控制器在 `$RUNNER_TEMP` 下打包，每次交叉编译前断言 checkout 干净，并重新执行固定 tag 的全部门槛。

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
pnpm --dir web typecheck
pnpm --dir web build
go test -count=1 ./...
go test -race -count=1 ./...
go vet ./...
pnpm --dir web exec playwright test --grep-invert 'first run, invite, collaborative Markdown, whiteboard and export'
pnpm --dir web exec playwright test mvp.spec.ts
pnpm --dir web exec playwright test --config playwright.restart.config.ts
git diff --exit-code HEAD
```

按顺序执行并在任一步失败时停止。首次安装用例要求空数据库，故必须单独启动；
Go 根包通过 `go:embed` 嵌入 `web/dist`，干净 checkout 必须先完成前端构建，不能依赖本机遗留的构建目录。
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
