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

## 演进计划：阶段 0（已验收）

按 `madoc_功能设计与开发阶段计划_2026-09-23.md` 从可靠保存开始；原 `PLAN.md` 保留架构迁移历史。可选公开分享和评论不自动进入实施范围。

- 第一部分：Markdown 保存状态改用 `clientUpdateId` 集合；部分、重复、未知 ACK、缓存 ACK 和重连初始化均不会提前清除待确认修改。说明见 `docs/RELIABILITY.md`。
- 第二部分：新增独立 Markdown update receipt，确保压缩和服务重启后相同更新 ID 不重复追加；增量迁移回填现存日志，保留正文。浏览器 outbox 尚未接入。
- 第三部分：Markdown 内容代际在重置时递增，旧正文 / 缓存 / 快照写入在事务内拒绝；重连遇到替换时停止编辑，提供本地正文副本下载。升级要求关闭旧编辑页再升级。
- 第四部分：IndexedDB outbox、稳定 ID 重试、网络恢复后的刷新 / 关闭 / 切换恢复、双标签合并、账号隔离、本地失败救援及重试已接入。
- 第五部分：个人设置提供独立本地恢复列表、只读 Markdown 预览和下载；旧代际记录可校验后标记处理，正文仍保留，当前代际禁止误处理。
- 第六部分：Markdown 导出等待本地 ACK 并校验服务器缓存最低水位；滞后缓存拒绝下载，支持超时重试和显式本地副本，viewer 导出保持零写入。
- 第七部分：已有房间连接的正文、瞬时消息与成员列表重新检查读权限及会话；撤权后停止广播并保留 Markdown 本地救援。成员降级 / 移除后的写入拒绝已补充回归。
- 第八部分：独立进程回归覆盖正常停服 / 强制终止、未发送 / ACK 丢失、停服期间编辑与重启重试；增加真实维护命令向独立目录恢复的验收入口。
- 第九部分：白板持久化按实际正文变化去重，工具 / 选区 / 指针及相同场景重渲染不再循环写入；远端场景不能提前确认本地修改，并通过 Excalidraw 元素合并保留本地内容，切换 Item 隔离编辑器实例。
- 第十部分：WebSocket 正文初始化、持久化和广播入队按单实例顺序执行，消除 join 与更新间的窗口及广播乱序，覆盖 Markdown / Whiteboard。
- 第十一部分：白板请求 ID 关联 ACK、完整场景版本确认、稳定 ID 重试与 join 后重发；明确拒绝保存时停止发送并提供只读本地 JSON 救援。
- 第十二部分：完成独立白板 IndexedDB 草稿存储层与事务回归；按标签页保留完整场景，准确 ACK 清理保留并发新草稿，账号 / Item 隔离。尚未接入编辑器。
- 第十三部分：白板编辑器接入先本地事务后发送、刷新与多标签关闭恢复、准确 ACK 清理、存储失败重试、离开保护和只读救援；拆分 UI、协作会话和草稿协调模块。
- 第十四部分：个人设置加入独立白板恢复列表，原 Item 删除或不可访问时仍可逐份下载完整本地场景和嵌入图片；读取失败重试、账号隔离与下载后保留草稿。
- 第十五部分：完成首次固定基线全量回归与发布检查文档、Docker 持久卷冒烟脚本；根据失败轨迹修正白板导出等价字段比较和图片源码拖选坐标。
- 第十六部分：第二轮固定基线回归定位 Outline 用例的程序化选区通知遗漏，补充 selectionchange 后连续十轮通过；保持产品撤销配置不变。
- 第十七部分：固定提交 `9c908d7` 完整门槛通过，阶段 0 完成。
- 阶段 1 已完成固定提交验收，阶段 2 随后开始；阶段 0 验收记录继续绑定原固定提交。

## 演进计划：阶段 1（已验收）

- 第一部分：增量 migration 0007、活动子树删除批次、同工作区恢复 API；保留早先独立删除的子项、正文 / 白板 / receipt 与附件关联。内容权限和活动状态纳入同一事务；原父目录失效要求显式目标，失败全部回滚。普通 Item 删除已改为软删除。
- 第二部分：owner 彻底删除与批次条目查看 API；完整名称确认、CSRF、跨批次子树保护、异常活动子项拒绝和失败回滚。清除选中批次的正文 / receipt，保留附件 metadata 与文件。
- 第三部分：桌面 / 移动端回收站界面，批次详情、原位恢复、显式位置选择和 owner 完整名称确认彻底删除；失败保留输入并允许重试，恢复后刷新目录。
- 第四部分：服务端 Workspace watch / unwatch、提交后 metadata 失效通知、投递时会话 / 成员复查和删除后内容房间清理。重订阅主动失效，断线恢复以 REST 为准，不引入持久事件日志。
- 第五部分：Workspace 与编辑器共用单条连接，metadata 失效自动刷新目录 / 权限 / 回收站，断线重订阅补读。删除 / 撤权时保留当前编辑器为只读救援，降级不重建会话、不丢未提交文本；错误按 Item 隔离。
- 第六部分：当前 Workspace 搜索 core / REST，标题 / 路径 / Markdown 缓存正文、中文短词、字面符号及 Markdown 标点转义归一化；同事务权限隔离、结果限制、正文缓存水位和独立滞后提示。无数据迁移或新服务，详见 `docs/SEARCH.md`。
- 第七部分：桌面 / 移动端快速打开与 Ctrl/Cmd+K 搜索，类型 / 路径 / 正文片段、缓存水位提示、重试、IME 与过期请求隔离、目录变化后的结果刷新；文件夹结果展开内容树。修复同级弹窗 key 冲突及切换时延迟协作事务访问已销毁编辑器。
- 第八部分：migration 0008 与个人收藏 / 最近访问 core、REST；按用户和 Item 隔离，viewer 可管理自己状态，访问时间独立，软删除隐藏 / 恢复重现 / 彻底删除级联，写入鉴权与个人状态修改同事务。
- 第九部分：桌面 / 移动端「我的」导航、文件树收藏星标、个人路径与最近访问时间；编辑器成功准备后记录访问，失败提示重试，目录删除 / 恢复刷新入口。查询按账号隔离，viewer 可使用自己的收藏。
- 第十部分：固定提交 `db903af` 完整功能门槛通过，阶段 1 验收完成。不启用自动清理；性能基准未建立，不能据此宣称容量上限。下一步进入阶段 2。

## 演进计划：阶段 2（进行中）

- 第一部分：文档 / 白板稳定 ID 链接复制，桌面 / 手机 / viewer 共用操作菜单；剪贴板拒绝时手动复制。改名 / 移动保持原地址，删除提示失效、恢复重新可用。提取 ItemActions，保留文件树已有操作；修复不可访问工作区的 REST 重试与隐藏搜索面板重挂载循环。无数据迁移或公开分享能力。
- 第二部分：单项复制 core / REST，原目录下独立 UUID；Yjs 快照 / 增量与水位重新映射，白板完整场景，缓存滞后拒绝、权限与失败回滚。仅复制已保存内容，UI 保存协调尚待接入。
- 第三部分：桌面 / 手机复制弹窗、默认副本名、失败重试和成功后打开；当前 Markdown 复用 ACK / 导出投影确认，白板等待场景 ACK，超时不创建副本；网络不确定结果不自动重试，viewer 不显示入口。
- 第四部分：新建文档提供空白 / 技术设计 / 会议纪要与预览；非空模板由浏览器生成完整 Yjs 快照，服务端原子创建 Item 和正文；双标签不重复初始化，失败保留选择，手机成功关闭抽屉。无 schema 迁移。
- 第五部分：当前编辑器只读源码窗口、显式刷新、复制 / 手动复制及下载所示文本；本地未同步提示，viewer 无正文写入，手机全屏。不改变服务器水位确认导出。
- 已接入文内查找 / 替换：字面且区分大小写，跨相邻格式文本匹配；viewer 可查找但不能写入；全部替换作为一个 Yjs 撤销单元并实时协作同步。细节见 `docs/CONTENT_REUSE.md`。
- 阅读 / 打印：沿用 Milkdown / Crepe 呈现，大纲保留；owner / editor 可切换编辑，viewer 默认只读；浏览器打印样式隔离 Workspace 界面并处理分页。细节见 `docs/CONTENT_REUSE.md`。
- 单篇 Markdown 可移植 ZIP：沿用服务器确认的 Markdown 水位，manifest 记录代际 / 序号 / 时间；同源 Madoc 图片打包为附件并改写相对图片目标，外部和相对图片保留原地址并列入 manifest；缺失附件时不产出不完整包。细节见 `docs/CONTENT_REUSE.md`。
- 单篇 `.md` / `.markdown` 导入预览：读取原文并允许修改新文档名称；基于活动 schema 生成初始协作快照，原子创建独立 Item，默认不覆盖当前内容。纯 Markdown 导入不携带附件。
- `.excalidraw` 白板导入预览：校验 version 2 结构，展示元素 / 嵌入文件数量并允许修改新白板名称；同一事务新建 Item 与初始 scene，保留嵌入文件，不覆盖原白板；viewer 不显示入口，超出 2 MiB 或结构不支持时不创建。
- 单项固定内容捕获：新增只读 capture API，在一个事务中返回 Item 元数据及 Markdown 的 Yjs snapshot / updates / generation / cacheSeq / headSeq，或白板 scene / revision；Markdown 导出复用同一捕获路径。按需返回，不落永久历史，不承诺目录 / Workspace 原子快照。
- 文件夹可移植 ZIP：保留嵌套路径并导出 Markdown / Excalidraw 文件；以每个 Item 的捕获水位写入 manifest，映射包内稳定链接，按 UUID 去重打包 Madoc 图片，列出未打包的外部图片和包外 Item 链接；缺失附件或内容投影滞后时拒绝生成。
- 权限中文化：界面以“所有者 / 编辑者 / 查看者”显示 Workspace 角色，并在邀请表单说明各角色能力；邀请状态使用中文标签，API 中的 role / status 枚举保持原值。
- 文件夹 / Workspace 单 ZIP、完整包集和单篇 Markdown 附件 ZIP 导入均已接入：支持目标目录、根名称冲突提示、内容与附件映射、确认提交和原请求重试；整组成功后才显示。阶段 2 固定提交整体验收已通过；持久历史检查点在阶段 3 继续实施。设计见 `docs/CONTENT_REUSE.md`。
- 阶段 2 固定提交 `7583b76f8045a5e632edad66e6fb86a654eaa745` 完成 Go / race / vet、前端构建、314 项普通浏览器、首次安装、6 项真实重启 / 备份恢复和 Docker 持久卷验收；详细记录见 `docs/RELEASE.md`。阶段 3 已开始，历史检查点和资产保留尚未实现。

## 当前验证

- 阶段 3 第一部分（提交 `108a987`）：migration 0010 持久版本模型和手动创建 / 分页 / 读取 API 已实现；覆盖 Markdown 保存投影滞后拒绝、Yjs compaction 后历史不变、白板场景固定、viewer / outsider 读权限与 viewer 写拒绝、附件引用时拒删。`go test ./...`、`go test -race ./...`、`go vet ./...`、前端 typecheck/build 均通过。
- 阶段 3 第二部分（已完成，提交待记录）：自动版本接入 Markdown 投影提交与白板场景持久化；同条目 15 分钟合并，自动版最多 30 个且保留 90 天；历史容量包含版本内容与唯一引用附件，达到 Workspace 1 GiB 时暂停自动建版但不阻断编辑。回归覆盖滚动检查点替换、容量暂停时保留旧版本、过期和数量清理、附件计入容量及自动引用。手动版永久保留。
- 阶段 3 第三部分（已完成，提交待记录）：Markdown / 白板版本面板支持手动命名、分页时间线、Markdown 逐行差异 / 正文预览、白板 SVG 预览；可以从任一历史版事务性恢复为同目录新副本，保留附件引用，原 Item 不变。Migration 0011 记录副本活动附件引用，历史清理后共享附件仍受保护。2 项真实 Playwright 往返、核心权限与事务测试及全量 Go/race/vet、前端 typecheck/build 通过。容量诊断和历史备份恢复演练仍待完成。

- 阶段 2 确认导入界面：桌面 / 手机提供目标目录、新根名称、同名 / 目标失效检查与显式确认。准备可取消，提交期间锁定输入；结果不确定时保留原 FormData 重试，后续拒绝不误判此前未提交。成功刷新目录，角色降级保留提示并禁用写入；离开保护明确重试信息仅保存在当前弹窗内存。
  - 27 项导入专项 / 回归通过，覆盖响应丢失后拒绝再重试、取消零请求、名称竞争、目标删除、提交中撤权、无效成功响应和查看者无入口。
  - 另 2 项真实导出往返通过：嵌套目录、重名文档、白板、共享图片，以及 52 MiB 分包整组导入、新链接和附件 SHA-256 一致。往返测试发现并修正导出相对链接未编码空格、括号、# 和 % 导致导入后丢失链接的问题。
  - 新增单篇 Markdown ZIP 往返验证：真实导出 ZIP 导入为新 Item，附件重新映射且字节一致，外部图片引用保留。专项 4 项通过；阶段 2 尚待固定提交整体验收。

- 阶段 2 导入计划与引用映射：浏览器从已校验包集生成固定请求 / Item / 附件 UUID、目录树、附件 SHA-256 和 multipart 请求；转换后的正文 / 快照 / 白板 / 附件统一检查 512 MiB 与 5000 项上限，准备可取消。活动 Markdown schema 中改写图片、链接和引用定义，保留代码示例，编译不请求原始图片；白板包内相对链接同样映射。17 项 Playwright 通过，包含真实 ZIP 经准备函数和原子 API 导入、重复提交、附件字节、打开编辑与刷新，以及模板 / 单篇导入回归。Go test ./...、go vet ./...、前端 typecheck / build 通过；保留既有大 chunk 警告。目标选择、冲突预览与确认提交界面尚未接入，阶段 2 仍未验收。

- 阶段 2 附件协调与原子导入 API：`POST /workspaces/{workspaceId}/imports` 以 multipart 接收计划与附件，验证真实类型 / 大小 / SHA-256，写入本次独立目录并刷盘后才提交数据库；响应丢失 / 并发重试沿用回执，失败清理先查数据库引用。启动恢复只清理已识别且未被引用的导入目录，保留未知数据 / 符号链接 / 损坏 journal。存储专项覆盖后续附件失败、取消、上传期间撤权、旧文件保护、数据库不可用时保留和恢复；Go test ./...、go vet ./...、asset / core race、前端 typecheck / build、13 项导入相关 Playwright 通过。另 1 项独立进程 E2E 验证上传中 SIGKILL 后清理、已提交内容重启保留、独立目录备份恢复及回执重放，附件字节一致。保留既有 build 大 chunk 警告。前端目标冲突预览、引用改写与确认提交尚未接入，用户界面仍为只读预览。

- 原子导入数据库基础补充验证：独立 CLI 备份恢复 E2E 通过。首轮数据恢复完成后，旧白板导出选择器同时匹配导入 / 导出两项而失败；改为精确匹配导出菜单，并联合等待下载后重跑通过。

- 阶段 2 原子导入数据库基础：新增 core 批量导入与 schema 9 成功回执，在同一事务创建完整新树、初始 Markdown / 白板状态、附件元数据和请求摘要；拒绝已有 ID / 根名称冲突及无效父级，检查当前写权限与账号状态。回执绑定用户、Workspace 与完整请求，同请求并发只提交一次，删除后重放不重建内容。逐表故障注入 / 回滚后重试、混合树 / 无效输入 / 容量边界、跨工作区 / 撤权 / 禁用、新连接重放、schema 8 升级保留及备份回执恢复测试通过；Go test ./...、go vet ./...、core / db / maintenance race、前端 typecheck / build、9 项导入界面回归通过。文件存储协调、HTTP 和前端原子提交尚未接入，不能将数据库基础视为整组导入已完成。设计及后续文件一致性约束见 `docs/CONTENT_IMPORT.md`。

- 阶段 2 包集选择与只读预览：桌面 / 手机“新建内容 → 预览导入包”接入单 ZIP 与完整包集读取，显示根目录、数量、解压大小和分页路径列表；取消 / 关闭中止读取，重新选择不保留旧结果，viewer 无入口。已确认整组压缩 256 MiB、解压 512 MiB、5000 项（含清单），顺序读取累计扣减额度；已确认后续写入采用整组原子成功。32 项 Playwright 通过，包含累计限额边界 / 取消 / 孤立内容分包拒绝、52 MiB 真实导出包读取、桌面与 390px 手机零写入预览、单篇 Markdown / 白板导入回归；截图已检查，无页面 / 控制台错误。Go test ./...、go vet ./...、前端 typecheck / production build 和 diff 检查通过，保留既有大 chunk 警告。目标冲突预览、附件与链接映射、整组原子写入及单篇 Markdown ZIP 格式接入仍待完成。

- Workspace 角色在成员列表、邀请列表和空间列表中显示为“所有者 / 编辑者 / 查看者”，请求仍使用稳定的 `owner / editor / viewer` 值；专项浏览器验证通过。
- 阶段 2 第八部分：单篇 Markdown 可移植 ZIP；9 项导出 / 阅读视图 E2E 通过，新增用例验证 ZIP 内附件字节、相对图片路径、manifest 实际水位、外链清单、代码围栏与行内代码不改写，以及附件缺失时拒绝生成不完整包。Go test ./...、go vet ./...、前端 typecheck / production build 通过；build 保留既有大 chunk 警告。首轮 E2E 曾使用旧 dist 并超时；重建后发现并修正代码围栏 URL 改写，再以干净构建重跑通过。
- 阶段 2 第九部分：单篇 Markdown 导入预览与安全新建；3 项导入 E2E 覆盖原文保持不变、脚注 / 加粗格式保真、文件名生成新标题、服务失败保留预览和名称后重试，以及超过 2 MiB 请求上限时不读取 / 创建。3 项现有模板 E2E 验证共享编译器未改变模板行为。Go test ./...、go vet ./...、前端 typecheck / production build 和 diff 空白检查通过，保留既有大 chunk 警告。初轮原文断言未容忍序列化末尾换行，调整为比较去尾换行后的正文后通过。
- 阶段 2 第十部分：`.excalidraw` 导入预览按 version 2 校验场景并展示元素 / 嵌入文件数量；新白板 Item 与 scene 原子创建，保留内嵌图片且不修改源白板。2 项新 E2E 与 8 项白板恢复回归通过；core 单测覆盖权限、父目录及事务回滚。Go test ./...、go vet ./...、前端 typecheck / production build、diff 空白检查通过，保留既有大 chunk 警告。
- 阶段 2 第十一部分：单项固定内容捕获在 SQLite 事务中返回元数据与版本水位，Markdown / 白板分别保留完整 editor state；Markdown 导出复用捕获。core 与 1 项 REST E2E 验证水位、compaction 后返回值稳定、白板 revision / scene、viewer 权限及 no-store。Go test ./...、go vet ./...、前端 typecheck / production build、diff 空白检查通过；build 保留既有大 chunk 警告。
- 阶段 2 第十二部分：文件夹 ZIP 保留嵌套目录，逐项捕获并记录 generation / seq 或 revision，输出 `.md` / Excalidraw version 2 `.excalidraw`，改写包内图片与 Item 链接并去重附件。1 项浏览器 E2E 覆盖重名消歧、实际图片字节、白板导出再导入、围栏代码保真及附件缺失时拒绝不完整包。Go test ./...、go vet ./...、前端 typecheck / production build、diff 空白检查通过；build 保留既有大 chunk 警告。
- 阶段 2 权限界面中文化：角色名称和能力说明、邀请状态均显示中文，后端枚举不变；角色标签 E2E、Go test ./...、go vet ./...、前端 typecheck / production build 通过，build 保留既有大 chunk 警告。
- 阶段 2 第十三部分：Workspace ZIP 沿用逐 Item 固定捕获和文件夹包的附件 / 稳定链接映射，根目录以 Workspace 名称命名，manifest 标注逐项捕获而非整体原子快照。2 项浏览器 E2E 覆盖文件夹导出回归、顶层 Markdown / 白板和 Workspace 根目录路径。Go test ./...、go vet ./...、前端 typecheck / production build、diff 空白检查通过；build 保留既有大 chunk 警告。
- 阶段 2 分包导出：根据附件总原始大小自适应输出：不超过 50 MiB 保留单 ZIP，超过后输出内容 ZIP、按附件体量划分的附件 ZIP 和 `.package-set.json`；Markdown 相对附件路径和内容间 Item 链接在共同解压目录下有效。13 项 Playwright 覆盖小附件单 ZIP、52 MiB 导出触发包集、阈值记录、附件分包体量与字节哈希、跨内容链接、缺失附件零下载、manifest 检查器和流式 reader；拆分策略用例覆盖边界 / 确定顺序 / 单个超阈值附件。Go test ./...、go vet ./...、前端 typecheck / production build、diff 空白检查通过；build 保留既有大 chunk 警告。包集导入仍未接入；导入须选择完整包集。
- 阶段 2 包集完整性校验：新增只读整组检查器，核对分包批次 / 编号 / 角色、根目录、Item 和附件清单、附件归属 / 路径 / 类型 / 大小及跨包路径冲突，输出内容和附件映射。19 项 Playwright 通过，覆盖异常包集及真实 52 MiB 导出包逆序选择、正文链接和附件字节哈希核对；Go test ./...、go vet ./...、前端 typecheck / production build 通过，保留既有大 chunk 警告。尚未接入包集选择、导入预览与写入，整组资源限额仍须由导入流程统一控制。
- 阶段 2 第十四部分（进行中）：实现流式 ZIP 读取和 manifest / 文件树审阅，限制字段由调用方显式传入；覆盖压缩 / 解压大小、条目数、路径穿越、重复路径、文件目录冲突、不完整归档、取消、缺失内容、未登记文件及无效白板 / 附件元数据。文件夹和 Workspace 实际导出均通过新审阅器验证。产品限额和整组原子失败语义已确认，只读预览已接入，写入仍待实现。
- 阶段 2 第五部分（基于 `b078aca`）：9 项源码 / 导出 E2E 通过，覆盖桌面 / 手机只读、复制与下载一致、远端刷新、剪贴板拒绝回退、未同步提示及 viewer 零正文写入；检查桌面与 390px 截图。MVP 首次运行在 Workspace 导航时 Chromium 页面崩溃，无应用异常；立即独立重跑通过。Go test / vet、前端 typecheck / production build 通过，保留既有大 chunk 提示。
- 阶段 2 第六部分：3 项文内查找 / 替换 E2E 覆盖精确大小写与中文文本、远端新增匹配后的结果刷新、跨加粗边界、替换单项 / 全部、双标签同步、单步撤销和 viewer 零正文写入；23 项源码 / 导出 / 编辑器回归及独立 MVP 流程通过。Go test / vet、前端 typecheck / production build 和 diff 空白检查通过。首轮使用旧静态 bundle，撤销后对远程光标标签的断言也过严；重建前端并调整选择器后通过，生产构建保留既有大 chunk 提示。
- 阶段 2 第七部分：2 项阅读 / 打印 E2E 验证原 Milkdown 呈现、大纲导航、编辑回切、viewer 默认只读及 print media 内容隔离；同跑 14 项源码 / 导出 / Outline 回归和 1 项权限中文标签验证通过，另行隔离运行的 MVP 首次启动测试通过。打印截图确认只显示文档标题和正文。Go test / vet、前端 typecheck / production build 通过，保留既有大 chunk 提示。MVP 与整组测试共享已初始化数据时不满足其首次启动前提，故单独运行。

- 阶段 2 第四部分（基于 `48cfa48`）：初始快照 core 单元测试及 Go test / vet / core race 通过；3 项模板 E2E 覆盖两种模板、双标签协作 / 刷新、手机创建失败保留与重试；5 项复制回归和独立 MVP 通过。前端 typecheck / production build 通过。

- 阶段 2 第三部分（基于 `493c5da`）：5 项复制界面测试覆盖桌面 / 手机延迟 ACK、白板场景确认、失败重试和 8 秒保存超时不创建；2 项复制 API、3 项稳定链接 / viewer、8 项 Markdown outbox 和 8 项白板恢复回归通过。追加截图时漏传 testInfo 导致两项测试失败，修正后通过并检查桌面 / 390px 弹窗截图。独立 MVP、Go test / vet、前端 typecheck / build 通过。

- 阶段 2 第二部分（基于 `8bd5a04`）：2 项 core 复制测试覆盖增量 / 压缩快照、独立水位、权限、空名 / 文件夹拒绝、缓存滞后和事务回滚；2 项真实 HTTP / 编辑器用例验证 Yjs 副本独立编辑、白板嵌入资源及阻断缓存后的失败重试。首轮 E2E 误读取 REST 未暴露的 headSeq，修正为实际响应与导出水位验证后通过。回收站 API、独立 MVP、Go test / vet / core race、前端 typecheck / build 通过。

- 阶段 2 第一部分（基于 `f94e739`）：初测暴露直接打开已撤权链接的加载 / 重挂载请求循环；取消明确权限错误重试、关闭查询挂载重试并使用 REST 拒绝状态后，3 项链接与 4 项实时权限回归通过。此前 5 项 Outline 和 3 项个人导航回归通过。独立 MVP、Go test / vet、前端 typecheck / build 通过。

- 阶段 1 固定提交 `db903af54289f5d7f3e3cc6cc2c5db20ad4df981`：Go test / race（`-count=1`）/ vet、前端 typecheck / build、235 项普通浏览器、独立 MVP、5 项真实重启 / 备份恢复、Docker 构建与持久卷冒烟全部通过。执行前后受控文件无改动；验收映射与边界见 `docs/RELEASE.md`。

- 阶段 1 第九部分（基于 `00cf64c`）：个人导航 3 项桌面 / 手机 / 失败重试测试通过；首轮两项测试改为点击 Mantine 可见标签后通过。个人 API、搜索与实时目录 10 项、编辑与 outbox 19 项、独立 MVP 和 CLI 备份恢复各 1 项通过；手机截图检查通过。Go test / vet、前端 typecheck / production build 通过。

- 阶段 1 第八部分（基于 `6f4708f`）：新增 3 项 core 测试和 schema 7 升级保留测试；修正两处旧迁移数量断言后 Go test / vet、core / db race 通过。5 项 HTTP 回归覆盖 CSRF、viewer 自有状态、账号隔离、删除恢复 / 撤权及既有搜索 / 回收站；真实 CLI 备份恢复新增收藏与访问时间保留验证并通过。独立 MVP 核心流程、前端 typecheck / build 通过。导航界面尚未接入。

- 阶段 1 第七部分（基于 `164aa58`）：首轮测试暴露组合框语义、同级弹窗 key 冲突和 Milkdown 延迟事务销毁顺序问题，修复后 7 项搜索 / 回收站专项通过；新增文件夹定位后 18 项搜索 / outbox / 权限 / 实时回归通过。桌面与 390px 截图已检查；独立 MVP 核心流程、Go test / vet、前端 typecheck / build 通过。

- 阶段 1 第六部分（基于 `54e3ccc`）：新增 3 项 core 搜索测试及转义归一化测试，覆盖中文 1–2 字、混合标识符、字面符号、路径、限制、viewer / 非成员 / 跨工作区、删除恢复与撤权、缓存滞后、compaction 和代际重置。HTTP 初测发现编辑器转义的下划线导致漏检，增加归一化并保留源码匹配后专项通过；4 项目录实时回归、独立 MVP 核心流程通过。Go test / vet、core / db race、前端 typecheck / build 通过。搜索 UI 尚待接入，未宣称大语料性能达标。

- 阶段 1 第五部分（基于 `d05c08a`）：25 项保存 / 权限 / 实时 E2E 通过，覆盖 Markdown 与白板 outbox、ACK 丢失、存储失败、关闭 / 切换 / 账号隔离、断线恢复。最终 4 项目录专项验证单连接、改名 / 移动 / 删除 / 恢复、空目录客户端刷新、断线补读、降级保留未发送文本、删除白板后本地下载；另有桌面 / 移动回收站复核及独立 MVP 核心流程通过。Go test / vet、realtime race、前端 typecheck / production build 通过。

- 阶段 1 第四部分（基于 `57bcf83`）：新增 3 项 Go 测试（含 Markdown / Whiteboard 子用例），覆盖 watch / unwatch、跨 Workspace 隔离、非法订阅、删除退房、撤权和会话失效。真实 HTTP / WebSocket 验证新建 / 改名 / 移动 / 删除 / 恢复 / 彻底删除提交后通知、失败不广播、重订阅与 Workspace 删除。4 项专项 E2E、独立 MVP 核心流程、Go test / vet、realtime race、前端 typecheck / build 通过。此部分仅完成通知服务端，前端 metadata 刷新仍待接入。

- 阶段 1 第三部分（基于 `011f7f7`）：6 项回收站 E2E 通过；补充成员 UI 断言后 5 项专项复核通过，覆盖 editor 恢复 / 禁止彻底删除、viewer 隐藏入口、原目录失效后的显式恢复、错误名称禁用、删除失败重试、批次隔离。桌面 / 390px 截图已检查；独立 MVP 核心流程、Go test / race / vet、前端 typecheck / build 通过。目录事件尚待接入。

- 阶段 1 第二部分（基于 `0b23002`）：新增 3 项 core 回归，覆盖 owner / 确认 / Workspace 边界、独立嵌套批次保护、原父目录丢失时显式恢复、清除失败回滚、异常活动子项拒绝、正文 / receipt 清理和附件关联保留。4 项回收站 HTTP E2E 通过，验证缺少 CSRF / 错误名称 / editor / viewer 拒绝及图片文件仍可读取；独立 MVP 核心流程、Go test / race / vet、前端 typecheck / production build 通过。本部分为服务端能力，界面和目录通知仍待接入。

- 阶段 1 第一部分（基于 `737b234`）：新增 4 项 core 生命周期测试与 1 项旧 schema 迁移测试，覆盖活动子树、早期批次隔离、正文 / 白板 / receipt / 资产关联保留、恢复位置、权限 / 工作区隔离、事务失败回滚及 Workspace 删除。Go test / race / vet、前端 typecheck / production build 通过；最后共享权限检查整理后 Go test / vet 与 core / realtime / asset race 复核通过。10 项 HTTP / 本地恢复 / 撤权 E2E、独立 MVP 核心流程通过；真实 CLI 备份恢复增加删除批次保留及恢复原文验证并通过。此记录仅证明服务与 API 基础，阶段 1 尚未完成。

- 阶段 0 最终验收（固定提交 `9c908d7845c645180c5194a06d3aae18e2f840fb`）：Go test / race（`-count=1`）/ vet、前端 typecheck / production build、214 项普通浏览器全套、独立首次安装 / MVP 核心流程、5 项真实进程重启 / 备份恢复及 Docker 新卷 / 容器重建持久性验证全部通过。测试执行前后受控工作树无改动，无测试重试。环境、镜像 ID 和前两轮失败记录见 `docs/RELEASE.md`。本记录后的文档提交仅归档验收，不改变受测产品代码。

- 阶段 0 第十六部分（基线 `9b1cccc`）：Go test / race（`-count=1`）/ vet、前端检查 / 构建及 Docker 持久卷验证通过。普通完整回归 213 通过、1 失败；Outline 的手动 DOM 选区未向编辑器同步通知，添加 selectionchange 后原删除 / 撤销用例连续十轮通过。调查性产品改动已撤回，新的完整门槛待执行。

- 阶段 0 第十五部分（基线 `3309a30`）：Go test / race（`-count=1`）/ vet、前端 typecheck / production build、Docker 构建及新卷初始化 / 容器重建持久性 / 登录 / secret `0600` 通过。普通全套首次 212 通过、2 失败，分别为 Excalidraw 空绑定归一化差异和多行图片源码的拖选坐标；原用例独立五轮全通过，保留首次失败记录。测试调整后三个场景五轮共 15 次通过，独立 MVP 及 5 项真实 SIGTERM / SIGKILL / 备份恢复通过。操作与失败分析见 `docs/RELEASE.md`；尚未宣告完整门槛通过。

- 阶段 0 第十四部分（基于 `53303d5`）：16 项 Markdown / 白板恢复 E2E 通过；新增 4 项覆盖桌面 / 390px 下已删除白板的多份草稿下载、文件完整保留元素与嵌入图片、下载不请求原 Item 且不清除草稿、同浏览器账号隔离及读取失败重试。两种尺寸截图已检查。Go test / race / vet、前端 typecheck / production build、独立 MVP 核心 E2E 通过。固定提交发布回归尚待执行。

- 阶段 0 第十三部分（基于 `5ca3de6`）：18 项白板状态 / 真实浏览器 / IndexedDB 回归通过，覆盖丢发送 / 丢 ACK 刷新原 ID 恢复、双标签关闭合并、切换 Item、读写失败重试、旧服务器版本与 viewer 只读救援；390px 存储失败提示截图已检查。Go test / race / vet、前端 typecheck / production build、独立备份恢复及 MVP 核心 E2E 通过。备份测试补上初始化完成检查后，恢复前后服务端场景和导出元素均保持一致。此部分依赖可打开原 Item；删除或失去读取权限时的独立白板救援入口仍待完成。

- 阶段 0 第十二部分（基于 `ca415f2`）：2 项真实 IndexedDB 事务测试通过，覆盖刷新后恢复存储记录、标签页槽隔离、账号隔离、迟到 ACK 不删新草稿、调用时场景复制，以及写入 / 清理事务中止保留原副本。Go test / race / vet、前端 typecheck / production build、独立 MVP 核心 E2E 通过。此记录仅证明存储层，编辑器接入仍待完成。

- 阶段 0 第十一部分（基于 `f50ae3c`）：修改前复现丢失 ACK 后重连仍无法恢复 Saved。8 项白板状态 / 浏览器测试通过，覆盖请求 ID 匹配、重复 / 未知 / 部分 ACK、完整场景新版确认、丢 ACK 重连原 ID 重试、离线绘图合并、join 先于重发、拒绝后停止写入与本地副本；390px 救援提示截图已检查。后端 ACK ID 回显测试、Go test / race / vet、前端 typecheck / production build、独立备份恢复和 MVP 核心 E2E 通过。新增后端用例后 realtime test / race 与 vet 复核通过。

- 阶段 0 第十部分（基于 `95ad949`）：并发 join / 16 路写入测试在修改前首轮复现 init 水位 4 后收到 seq 1；串行化后 Markdown 40 轮、白板 20 轮验证初始化在前、版本递增、完整内容及全部 ACK，Markdown 专项另连续运行 3 次通过。Go test / race / vet、前端 typecheck / production build、18 项保存 / outbox / 代际 / 白板专项及独立 MVP 核心 E2E 通过。

- 阶段 0 第九部分（基于 `ea4a56d`）：复现空闲白板 1.5 秒内 revision 从 2 增到 6，以及远端旧场景覆盖本地元素 / 提前显示 Saved；修复后 3 项专项覆盖空闲与临时状态零持续写入、真实绘图保存刷新、双标签部分 ACK、远端合并、导出一致性和 Item 切换隔离。Go test / race / vet、前端 typecheck / production build、独立目录备份恢复和 MVP 核心 E2E 通过。白板断线待提交恢复仍需单独复核，不沿用 Markdown outbox 的完成结论。

- 阶段 0 第八部分（基于 `f51bead`）：5 项真实进程 / 备份恢复 E2E 通过，覆盖 SIGTERM / SIGKILL、发送前中断、ACK 丢失原序号重试、停服编辑、重启刷新以及独立目录的 Markdown / 白板 / 附件 / secret / 会话恢复。Go test / race / vet、前端 typecheck / production build、独立 MVP 核心 E2E 通过。测试过程中补正白板工具点击与附件响应读取，并明确恢复目标需先初始化数据库；空白板持续 Saving 的观察仍待单独定位。

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
