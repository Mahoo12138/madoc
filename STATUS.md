# madoc MVP Status

更新时间：2026-09-23

## 当前结论

项目仍处于 MVP 阶段。本轮工作是内部架构重构，不是正式版本升级，也不引入公开 API 版本号。

madoc 已从 AFFiNE-compatible 原型切换为 madoc-native 协同 Markdown Workspace：Go 单二进制、SQLite、本地 Asset、REST、原生 WebSocket、Milkdown/Crepe 和 Excalidraw。

## 已完成

- [x] 为基线提交 `4657ab6` 创建 `pre-mvp-affine-port` tag
- [x] 删除 GraphQL、Socket.IO、`space:*` / `realtime:*` compatibility
- [x] 删除 BlockSuite、`@madoc/doc`、`@madoc/editor`
- [x] 建立事务化 `schema_migrations` 与 canonical MVP schema
- [x] 启动时拒绝 legacy schema，不自动删除旧表
- [x] 提供显式 `maintenance legacy-clean --confirm`
- [x] 建立 User、Session、Workspace、Membership、Invite、Item、Asset 数据模块
- [x] 建立统一 `/api` REST error envelope、session 与 CSRF
- [x] 建立 owner/editor/viewer 权限、最后 owner 与 Workspace 隔离
- [x] 建立 folder/markdown/whiteboard Item tree 与安全移动
- [x] 使用 `github.com/coder/websocket` 建立 multiplex realtime hub
- [x] 建立 Mantine + Vanilla Extract Workspace Shell
- [x] 统一个人中心：姓名、账号头像、密码修改与会话撤销
- [x] 账号级 Markdown 七项偏好、离线缓存、跨标签同步与旧偏好迁移
- [x] 补齐 Workspace 设置：owner 重命名、名称确认删除、失败重试及桌面 / 移动端入口
- [x] 接入 Milkdown/Crepe、Yjs、Markdown cache、ACK、重连与 compaction
- [x] 接入 `.md` 导入/导出和私有图片上传
- [x] 接入 Excalidraw scene persistence、revision CAS、element reconciliation 与导出
- [x] 接入 Whiteboard room、presence、remote pointer 与 durable scene update
- [x] 自托管 Excalidraw 字体与静态资源
- [x] 建立 `/healthz`、安全 header、Origin 校验、消息大小限制与 graceful shutdown
- [x] 建立一致性备份、验证与可回滚恢复命令
- [x] 更新 Vite proxy、Docker、`go:embed` 与数据目录说明

## 演进计划：阶段 0

按 `madoc_功能设计与开发阶段计划_2026-09-23.md` 从可靠保存开始；原 `PLAN.md` 保留架构迁移历史。可选公开分享和评论不自动进入实施范围。

- 第一部分：Markdown 保存状态改用 `clientUpdateId` 集合；部分、重复、未知 ACK、缓存 ACK 和重连初始化均不会提前清除待确认修改。说明见 `docs/RELIABILITY.md`。
- 第二部分：新增独立 Markdown update receipt，确保压缩和服务重启后相同更新 ID 不重复追加；增量迁移回填现存日志，保留正文。浏览器 outbox 尚未接入。
- 第三部分：Markdown 内容代际在重置时递增，旧正文 / 缓存 / 快照写入在事务内拒绝；重连遇到替换时停止编辑，提供本地正文副本下载。升级要求关闭旧编辑页再升级。
- 第四部分：IndexedDB outbox、稳定 ID 重试、网络恢复后的刷新 / 关闭 / 切换恢复、双标签合并、账号隔离、本地失败救援及重试已接入。
- 第五部分：个人设置提供独立本地恢复列表、只读 Markdown 预览和下载；旧代际记录可校验后标记处理，正文仍保留，当前代际禁止误处理。
- 第六部分：Markdown 导出等待本地 ACK 并校验服务器缓存最低水位；滞后缓存拒绝下载，支持超时重试和显式本地副本，viewer 导出保持零写入。
- 第七部分：已有房间连接的正文、瞬时消息与成员列表重新检查读权限及会话；撤权后停止广播并保留 Markdown 本地救援。成员降级 / 移除后的写入拒绝已补充回归。
- 后续：重启失败路径复核与固定提交发布回归。阶段 0 尚未完成，不进入阶段 1。

## 当前验证

- 阶段 0 第七部分（基于 `0296621`）：18 项服务端权限场景及 6 项撤权 / 导出浏览器回归通过，覆盖 Markdown / Whiteboard 旧连接、成员移除、viewer 降级、会话过期、账号禁用、文档删除、瞬时消息与成员列表；真实双页面确认撤权后无新正文且未提交内容可下载。Go test / race / vet、前端 typecheck / production build、独立目录 MVP 核心 E2E 通过；新增写入拒绝用例后重新运行 Go test、realtime race 与 vet 通过。

- 阶段 0 第六部分（基于 `76cfd73`）：24 项导出 / 保存 / outbox / 代际 / 恢复专项通过，新增缓存滞后、部分 ACK、非法水位、旧代际、超时重试、viewer 零写入与登录失效测试。390px 离线导出提示截图检查通过；Go test / race / vet、前端 typecheck / production build、独立目录 MVP 核心 E2E 通过。

- 阶段 0 第五部分（基于 `9d3f9c6`）：25 项账号 / 保存 / outbox / 代际 / 恢复专项通过，新增覆盖已删除 Item 无原文档请求的重建下载、脚注 / 转义 / 粗体保留、当前代际拒绝处理、旧记录标记后保留副本及账号列表隔离。桌面 / 390px 截图检查通过；Go test / race / vet、前端 typecheck / production build、独立目录 MVP 核心 E2E 通过。

- 阶段 0 第四部分（基于 `f676855`）：15 项保存状态 / 代际 / outbox 专项通过，覆盖发送前失败、丢失 ACK 的原 ID 重放、断线本地保存、刷新、切换文档、双标签关闭恢复、账号隔离、配额失败与恢复事务中途失败回滚、本地日志压缩后恢复。390px 本地保存与失败救援截图已检查；Go test / race / vet、前端 typecheck / production build、独立目录 MVP 核心 E2E 通过。服务端仍不可访问或 Item 已删除时的独立本地救援入口尚待完成，不声称整站离线可用。

- 阶段 0 第三部分（基于 `adacae4`）：旧代际的正文 / 缓存 / 快照拒绝、新代际正常写入与递增测试通过；6 项浏览器 / 状态专项回归通过，包含断线期间重置、桌面与 390px 的只读提示及本地副本下载，窄屏截图已检查。Go test / race / vet、前端 typecheck / build、独立目录 MVP 核心 E2E 通过。

- 阶段 0 第二部分（基于 `e1ceb80`）：压缩 / 重启后的稳定 ACK、权限和 Item 隔离、失败回滚、正文重置事务及旧日志迁移回填测试通过。Go test / race / vet、前端 typecheck / production build、独立目录 MVP 核心 E2E 通过；补充重置回滚用例后 core 测试复核通过。维护测试的 migration 数量断言已随新迁移更新。

- 阶段 0 第一部分（基于 `10aafc1`）：3 项保存状态单元 / 浏览器回归通过，覆盖部分与重复 ACK、缓存 ACK、重连和刷新；MVP 核心 E2E 在独立临时数据目录通过。Go test / race / vet、前端 typecheck / production build、diff 空白检查通过。首次合并执行时核心用例因共享测试库已初始化而失败，单独重跑通过；首次安装用例需单独运行。

- 个人设置反馈修复：账号菜单收拢为“设置 / 退出登录”，桌面侧栏与手机栏目统一包含个人资料、Markdown 偏好、账号安全、快捷键。实际开发页面的偏好请求曾返回 404，定位为仍运行旧 Go 后端；检查期间后端重启后，8080 代理下的已登录偏好读取恢复 200。新增服务缺少接口和登录失效的明确错误提示，并验证 404 期间待同步字段在服务恢复后可重试、刷新保留。13 项账号 / 偏好 E2E、Go test / vet、前端 typecheck / build、桌面 / 390px 检查通过。

- 个人中心第二阶段：七项 Markdown 偏好通过统一账号层、CSS variables 与编辑器快捷按钮接入；提供预览、自动保存、重试及确认恢复默认。增量 migration 0004 保存完整偏好与 revision，按字段合并；浏览器按用户 / 字段缓存待同步修改，支持跨标签即时同步、其他设备聚焦刷新、断网恢复和一次性旧偏好迁移。11 项账号 / 偏好 E2E、58 项 MVP 核心与编辑器回归通过；包含已连接 WebSocket 撤销、头像访问隔离 / 备份恢复、导出与撤销历史保持。Go test / race / vet、前端 typecheck / build 通过；1440px / 390px 视觉审阅后修正个人设置说明文字对比度，5 项相关 E2E 复核通过。文档见 `docs/ACCOUNT.md`。

- 个人中心第一阶段：统一账号菜单、桌面 / 手机个人设置、姓名与头像维护、未保存提示、密码修改及其他会话 / WebSocket 撤销已完成；资料更新保留编辑器实例与撤销历史。Go test / vet、前端 typecheck / build、4 项账号 E2E、1280px / 390px 视觉检查及头像备份恢复测试通过。第一阶段门槛通过后继续第二阶段。

- 脚注：补齐按首次引用编号、重复引用、带 `[^标识]:` 的多段落定义区、原位引用源码编辑、定义重命名联动、跳转与返回；未完成引用在保存刷新后保留并可补定义，转义 / 实体 / 代码示例不误识别，viewer 仅阅读与跳转。新增 12 项回归，137 项编辑器完整回归通过；最后收紧输入识别并简化行内解析后，12 项专项复核通过。Go test / vet、前端 typecheck / build 和桌面 / 390px 截图检查通过

- 块级公式呈现：按 Typora 参考改为灰底源码、`$$` 边界、独立白底实时预览与 `Math ✓` 完成按钮，移除行号 / 语言菜单 / PREVIEW 标签；点击或方向键进入编辑、离开后收起，空公式保持入口，展开状态不影响其他协作者。新增 7 项回归，覆盖桌面 / 390px、编号、保存刷新、同步撤销、错误恢复、只读与语言切换；125 项编辑器回归、Go test / vet、前端 typecheck / build 和截图检查通过，既有代码块指定行高亮保持正常

- 超长行内代码：渲染态按容器宽度换行，源码编辑时裁剪隐藏字宽测量区域，消除连续长字符造成的横向溢出；新增 6 项桌面 / 390px 回归，覆盖段落、引用、列表、编辑、窗口缩放、保存导出与刷新。118 项编辑器回归、Go test / vet、前端 typecheck / build 及桌面 / 窄屏截图检查通过

- Workspace 设置：启用桌面菜单与手机顶部入口，重命名同步刷新 Shell / 列表，删除要求完整名称确认，失败保留输入，提交期间阻止重复请求；editor / viewer 无入口且 REST 拒绝越权。新增 2 项 Go 权限 / 隔离测试和 7 项设置 E2E，MVP 核心流程、Go test / vet、前端 typecheck / build 通过；Chromium 1280×720 与 390×844 截图、正常流程控制台及手机关闭后的焦点恢复检查通过。浏览器测试使用独立临时数据目录，不操作现有工作数据

- 代码块行高亮：取消默认当前行背景与行号强调；支持围栏元数据 `{2,3}`、`{2-4,6}` 指定行高亮，按一基行号计算并忽略无效 / 越界范围；保留切换语言、内容编辑、双窗口同步、导出再导入与块级公式行为。新增 13 项解析 / 编辑回归，112 项编辑器测试、Go test / vet、前端 typecheck / build 和指定行截图检查通过

- Outline 层级折叠增强：独立分支箭头、全部展开 / 折叠、嵌套状态保留与折叠父分支当前章节提示；桌面 / 手机共享本地会话状态，远端更新通过 Yjs 相对位置保持折叠标题对应关系。10 项 Outline 单元 / E2E（含远端重命名、删除不误折叠其他分支及 viewer 无内容写入）、11 项 writing 编辑器回归、Go test / vet、前端 typecheck / build 通过，桌面与 390px 截图及独立审阅通过

- 转义文本局部源码编辑：按最新交互要求，仅展开光标所在字符前的反斜杠，使用灰色区分前缀与正文；相邻转义符独立编辑，中间文字和另一端不展开。11 项局部显示 / 光标 / 颜色 / 修改 / 同步 / 撤销回归通过，99 项编辑器 E2E、Go test / vet、前端 typecheck / build 与截图检查通过

- 文档 Outline：左侧「文件 / Outline」切换保留目录折叠状态，实时展示 H1–H6、点击定位及章节高亮；切换文档隔离大纲，白板回到文件导航，移动端关闭抽屉后定位，viewer 只读。6 项 Outline 单元 / E2E、MVP 核心流程与 11 项 writing 编辑回归、Go test / vet、前端 typecheck / build 通过；桌面 / 390px 截图与独立审阅通过，补齐小字对比度和手机 viewer 标题焦点验证

- 不对称星号输入回归：顺序输入 `**测试文字* 测试文字`，在闭合星号后输入空格时解析为多余字面星号 + 斜体 + 普通尾文；保留空格，正常粗体与转义不受影响，结果与 Markdown 导入解析一致。新增 10 项专项用例，合计 42 项输入 / 转义 / 行内编辑 E2E 通过；覆盖刷新、双窗口同步、导出再导入和撤销 / 重做。Go test / vet、前端 typecheck / build 通过

- Markdown 转义回归：保留反斜杠转义标点的字面语义，修复编辑时误转换、转义括号内 URL 自动链接、导出再导入及多行引用位置归一化；新增 21 项测试覆盖导入、逐字输入、编辑、双反斜杠、删除、刷新、导出再导入、协作与撤销，以及普通 Markdown / 代码不受影响。78 项编辑器 E2E、Go test / vet、前端 typecheck / build、截图检查通过

- 图片错误呈现：移除红色 Markdown 语法说明；语法不完整或图片加载失败时在源码前显示无法渲染图标，修正后自动消失。7 项相关 E2E、Go test / vet、前端 typecheck / build 通过

- 图片源码选区回归：阻止源码区域（包括已有选区）触发祖先图片节点的原生拖拽，图片预览本身仍可拖动；独立 / 行内图片真实鼠标拖选和图片拖拽、5 项 Markdown 保真回归通过，Go test / vet、前端 typecheck / build 通过

- Markdown 保真与图片编辑：硬换行标记、16px 引用缩进，完整 / 折叠 / 快捷引用定义保留及实时更新，图片上方源码编辑、替代文本 / 地址 / 标题保留、失败图片仅展示源码、地址修复后恢复预览；52 项相关 E2E 通过，最终图片样式调整后 5 项专项重跑通过。双窗口同步、撤销、viewer 只读及桌面 / 390px 视觉检查通过；Go test / vet、前端 typecheck / build 通过

- 连续分割线光标回归：块间插入位置聚焦时临时空出一行并显示主题蓝色竖光标，避免默认黑色横光标及双光标；支持方向键移动、点击与失焦收起，未输入时导出不变，输入后下方分割线不跳动。2 项专项 E2E 与 8 项行内定位回归、桌面 / 390px 截图、Go test / vet、前端 typecheck / build 通过

- `go test ./...`：通过
- `go test -race ./...`：通过
- `go vet ./...`：通过
- `pnpm --dir web typecheck`：通过
- `pnpm --dir web build`：通过
- Playwright 首次启动、邀请注册、双窗口 Markdown、双窗口 Whiteboard 与导出：通过
- 行内编辑专项回归：定界符逐字符移动、先建空定界符再填内容、原位公式、嵌套格式、即时同步、撤销 / 重做、IME 组合事件、viewer 只读与清空保存通过
- 行内呈现专项回归：两侧边界选区与鼠标点击、展开态样式、真实字形宽度、公式实时预览，以及桌面 / 390px 窄屏截图与控制台检查通过
- 行内点击定位回归：修复右侧空白落在分隔符内及展开后跳到开头的共用问题；粗体、斜体、组合格式、代码、链接、加粗链接、公式在未展开 / 已展开状态均定位到完整源码末尾，普通尾文不误触发。45 项行内编辑 E2E、Go test / vet、前端 typecheck / build 通过
- 链接原位编辑回归：鼠标 / 键盘 / 两侧边界触发、标题与嵌套格式、查询参数和相对路径、退出渲染、撤销、刷新保存、双窗口即时同步与 viewer 只读通过；桌面 / 390px 窄屏截图及控制台检查通过
- 代码块工具回归：框外语言选择、框内覆盖式复制、语言切换与刷新保留、剪贴板内容、空代码块输入、激活行号无黑底且跟随光标、桌面 / 窄屏布局通过
- 浏览器深链接刷新、Markdown 单次初始化、桌面和移动端 Workspace Shell：通过
- Docker image、`/healthz`、数据卷、secret `0600`：通过
- SQLite、Asset、server secret 备份及恢复回滚：通过

## 发布门槛

- [x] `go test ./...`
- [x] `go test -race ./...`
- [x] `go vet ./...`
- [x] 前端 typecheck 与 production build
- [x] Docker image 与持久卷 smoke test
- [x] 备份 / 恢复端到端 smoke test
- [x] 双窗口 Markdown / Whiteboard 协作回归
- [x] Playwright 核心流程自动化
- [x] 修复 Workspace 新建文档标题逐字输入时读取已失效事件 currentTarget 的问题，并加入 E2E 回归覆盖
- [x] 修复 Markdown 标题 / 段落键盘输入回归断言，并将协同光标与远程选区改为 madoc 自定义样式
- [x] 修复 Markdown h1-h6 字号阶梯，避免 h3-h6 继续使用 Milkdown 默认字号
- [x] 对齐 Typora 风格的 Mark 编辑态标记、代码块语言栏悬停行为和双反引号行内代码输入
- [x] 对齐 MarkText 风格的 Markdown 输入体验：成对补全与选区包裹、专注模式、打字机模式、文档统计和快捷键提示
- [x] 修复加粗、斜体、行内代码和公式的原位源码编辑，以及先建空分隔符再输入内容时不渲染的问题
- [x] 补齐原位公式的下方渲染预览，修复边界未展开、展开后字体样式丢失及右侧额外留白
- [x] 将代码块语言入口移到框外右下方、复制按钮覆盖在框内右上角，移除占位工具栏；激活行号使用无底色的轻量强调，并压缩代码块下方的外部预留间距

- [x] 将既有链接接入光标触发的原位 Markdown 源码编辑，移除悬停预览浮层，保留工具栏新建链接入口

## 明确不进入当前 MVP

AI、Calendar、Database/Kanban、Git、WebDAV、公开发布、插件系统以及 AFFiNE/BlockSuite 内容转换器均不在当前范围。
