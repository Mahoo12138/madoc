---
name: madoc
description: 轻量、自部署、多人协同的 Markdown Workspace——安静、专注、内容优先。
colors:
  letter-blue: "#3869ad"
  letter-blue-deep: "#305b98"
  letter-blue-wash: "#f0f5fc"
  cool-gray-paper: "#f7f8fa"
  cool-gray-hover: "#f0f2f5"
  cool-gray-border: "#e5e8ed"
  cool-gray-dimmed: "#626d7d"
  cool-gray-ink: "#252e3b"
  surface-white: "#ffffff"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.3
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.4
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  reader:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  mono:
    fontFamily: "\"SFMono-Regular\", Consolas, \"Liberation Mono\", monospace"
    fontSize: "0.875em"
rounded:
  xs: "4px"
  sm: "6px"
  row: "7px"
  md: "8px"
  block: "10px"
spacing:
  xs: "10px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.letter-blue}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.letter-blue-deep}"
    textColor: "{colors.surface-white}"
  tree-row:
    backgroundColor: "transparent"
    textColor: "#505a69"
    rounded: "{rounded.row}"
    height: "32px"
  tree-row-active:
    backgroundColor: "{colors.letter-blue-wash}"
    textColor: "{colors.letter-blue-deep}"
  workspace-card:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cool-gray-ink}"
    rounded: "{rounded.md}"
    padding: "20px"
  input-field:
    backgroundColor: "{colors.surface-white}"
    textColor: "{colors.cool-gray-ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px"
    height: "40px"
---

# Design System: madoc

## Overview

**Creative North Star: "案头 The Quiet Desk"**

madoc 的界面是一张整洁的书桌：文档在灯下，工具退后。所有视觉决策服务于一个目标——让内容本身成为主角。侧栏、菜单、按钮都是桌面边缘的文具，存在但不喧哗；用户坐下、打开文档、开始写字，中间不该有任何视觉噪音插队。

实现这一点的手段是克制：全系统只有一个系统中文字体栈，层级完全由字重与尺寸表达；只有信纸蓝一种强调色，且只出现在行动与状态指示上；静态界面零阴影，层次靠纸面灰与白底的色调分层和 1px 细边框。组件手感**轻盈透气**——小圆角、细边框、快速的 150ms 微反馈，没有厚重的装饰。

明确拒绝的方向（已与产品确认）：复杂后台式的管理界面、仪表盘式的高信息密度堆叠、营销式的视觉噪音（大面积彩色背景、渐变、装饰性插画）。madoc 是工具，不是展板。

**Key Characteristics:**
- 内容即界面：编辑器正文占据视觉中心，chrome 退到边缘
- 单一字族、单一强调色、零静态阴影
- 冷灰纸面 + 白色内容面的色调分层
- 小圆角（默认 6px）、1px 细边框、150ms 微反馈
- 桌面优先、触屏可达（44px 命中区）

## Colors

色板性格：冷调、低饱和——一张冷灰纸面上只点一盏信纸蓝的灯。

### Primary
- **信纸蓝 Letter Blue** (#3869ad): 唯一的行动色。主按钮、焦点环、光标（caret）、链接态激活、选中指示。它是"信纸上印刷的蓝"，稳重而不刺眼。
- **信纸蓝·深 Letter Blue Deep** (#305b98): 主按钮 hover、树行激活文字。只用于状态加深，不做独立用色。
- **信纸蓝·洗 Letter Blue Wash** (#f0f5fc): 激活导航底色、编辑器选中区、空状态图标底。大面积的蓝只允许以这种极浅的"水洗"形式出现。

### Neutral
- **冷灰·纸 Cool Gray Paper** (#f7f8fa): 应用底色、侧栏底色。是"桌面"本身。
- **冷灰·悬停 Cool Gray Hover** (#f0f2f5): 树行/菜单项/图标的 hover 底色。最轻的交互反馈。
- **冷灰·边 Cool Gray Border** (#e5e8ed): 全部 1px 分隔线与边框。界面几乎不用更深的边框。
- **冷灰·暗 Cool Gray Dimmed** (#626d7d): 次级文字——元信息、占位符、角色说明。
- **冷灰·墨 Cool Gray Ink** (#252e3b): 正文文字。不是纯黑，保持纸面阅读的柔和。
- **白 Surface White** (#ffffff): 内容区、卡片、弹层底色。内容与桌面靠"白 vs 纸灰"区分，而非阴影。

### Named Rules
**The One Voice Rule（一种声音规则）.** 信纸蓝在任何屏幕上只服务于行动与状态：按钮、焦点、激活、光标。它的稀有就是它的力量——正文、标题、装饰元素永不使用蓝色。

**The Paper Rule（纸面规则）.** 层级靠"纸灰 → 白"的色调分层表达，不靠阴影。侧栏是纸（gray-0），内容是白纸（white），浮层才是唯一允许投影的场景。

## Typography

**Display/Body Font:** 系统中文字体栈（-apple-system → Segoe UI → PingFang SC → Hiragino Sans GB → Microsoft YaHei）
**Mono Font:** SFMono-Regular / Consolas / Liberation Mono

**Character:** 零加载、零惊喜的原生阅读体验。中英文混排是默认场景，字体栈让每个平台拿出自己最好的中文 UI 字体。层级完全靠字重（400/600/650）与尺寸倍数表达。

### Hierarchy
- **Display** (600, 34px, 1.3; 移动端 28px): 文档大标题。无边框输入形态，是正文的一部分，不是页面 chrome。
- **Headline** (600, 30px, 1.4; 移动端 24px): 页面级标题（工作区列表、管理页）。
- **Title** (600, 16px, 1.5): 卡片标题、条目名称。
- **Body** (400, 14px, 1.5): 全部 UI 文字——侧栏、菜单、按钮、表单。
- **Reader** (400, 16px, 1.75): 编辑器正文。行高 1.75 是长文阅读的核心承诺。编辑器内标题按正文倍数缩放：h1 2× / h2 1.5× / h3 1.25× / h4 1.125× / h5 1× / h6 0.875×。
- **Label** (600, 12px, 1.4): 侧栏分组标题等结构性标签。中文场景不使用大写变换，靠字重区分。
- **品牌字标** (650, 21px): 侧栏与列表页顶部的 "madoc" 字标，650 是它独有的字重。

### Named Rules
**The One Family Rule（单一字族规则）.** 全系统只有一个字体栈。不引入展示字体、不引入第二字族；表达个性靠留白、层级与克制，不靠新字体。

**The Tabular Rule（等宽数字规则）.** 计数、日期、字数等数字信息使用 `font-variant-numeric: tabular-nums`，防止列表因数字宽度抖动。

## Layout

空间模型是"桌面三段式"：300px 固定侧栏 + 弹性内容区（+ 306px 大纲栏），用 CSS Grid 实现；移动端退化为单列，侧栏让位给顶部导航。

**布局契约（2026-10 统一）**：页面框架尺寸只有一个来源——`web/src/styles/layout.css.ts` 与 `--madoc-*` CSS 变量，禁止在各页面重新硬编码。

- **统一页面头**：所有页面共享 58px（`--madoc-header-height`）sticky 页头，底部 1px 冷灰边；水平 padding 与所在面的内容 gutter 对齐——工作台页头 24px（移动 16px，对齐编辑器栏 gutter），设置页与列表页 40px（移动 20px）。视口高度计算一律写 `calc(100dvh - var(--madoc-header-height))`。
- **两种内容容器**：`content` 760px（`--madoc-content-width`，阅读与表单栏：编辑器、管理页、账户页，居中，padding 44/40/72，移动 28/20/72）；`grid` 1120px（`--madoc-grid-width`，工作区列表等网格页）。不存在第三种内容宽度。
- **正文栏**：编辑器在 content 契约内为书写留出 120px 底部空间；编辑器内标题按正文倍数缩放。
- **统一导航行**：侧栏树行、设置导航、大纲行共用一种尺寸语言——36px 高（触屏 44px）、7px 圆角、14px/500，激活态统一为信纸蓝·洗底 + 信纸蓝·深文字 + 600 字重，用 `aria-current="page"` 或 `data-active` 表达。
- **断点**：1180px（紧凑，隐藏大纲栏）、1023px（卡片两列）、760px（移动，侧栏隐藏、单列；白板工具栏等所有移动适配都归并到这一档）。账户页 360px 是唯一的极端窄屏微调（micro）。断点是布局契约，`workspaceMedia` 常量是 JS 侧唯一来源，CSS 与条件挂载共用。
- **间距节奏**：使用 Mantine 间距刻度（10/12/16/20/32），侧栏内边距 16px/14px，卡片内部 20px。不发明刻度外的值。
- **触屏**：`touchControls`（≤760px 或粗指针）下所有可点目标至少 44×44px；桌面保持 36px 的紧凑密度。密度随输入精度变化，不随屏幕大小一刀切。

## Elevation & Depth

本系统**默认扁平**。深度由三样东西表达：纸灰与白的色调分层、1px 冷灰边框、以及 hover 时才出现的轻微浮起。静态界面上一律没有阴影。

### Shadow Vocabulary
- **浮层** (`0 4px 16px color-mix(in srgb, #252e3b 8%, transparent)`): 菜单、Popover 等浮层。8% 浓度的墨色，让浮层轻轻离开纸面。
- **悬停浮起** (`0 8px 24px color-mix(in srgb, #252e3b 8%, transparent)` + `translateY(-2px)`): 工作区卡片 hover。阴影与位移同时出现，是"拿起一张卡片"的物理暗示；`:active` 时 `translateY(1px)` 放下。
- **编辑器浮具** (`0 8px 24px rgba(15, 23, 42, 0.12)` / `0 12px 32px rgba(15, 23, 42, 0.14)`): 编辑器内浮动工具栏与 slash 菜单，浓度略高于全局浮层，因为它们悬浮在纯白正文之上。

### Named Rules
**The Flat-by-Default Rule（扁平默认规则）.** 静态表面零阴影。阴影只允许作为状态响应（hover、浮层）出现——任何"为了让卡片更立体"的常驻阴影都是违规。

## Shapes

形态语言是"温和的圆角"：默认 6px（`defaultRadius: sm`），随元素尺度微调的圆角阶梯——快捷键与小标签 4–5px，按钮与输入 6px，树行与列表项 7px，卡片与弹窗 8px，代码块 10px。圆角随容器增大而增大，但全系统最大不超过 10px；不使用全圆角（pill）容器，圆形只属于头像与状态点。

边框一律 1px 冷灰（#e5e8ed），不使用 2px 以上的描边，不使用深色边框。焦点不用边框加深表达，用 2px 信纸蓝外描边（outline）表达。

## Components

### Buttons
- **Shape:** 温和圆角（6px），默认尺寸 sm（32px 高），触屏最小 44px。
- **Primary:** 信纸蓝底（#3869ad）白字，字重 600；hover 加深为信纸蓝·深（#305b98）。
- **Subtle / Ghost:** 图标按钮默认 subtle 灰（dimmed 文字，hover 纸灰底 #f0f2f5）。工具性动作永远是 subtle，primary 一屏至多一个。
- **Focus:** 2px 信纸蓝 outline，offset 2px；键盘可达性是全组件的硬约束。

### Tree Rows（侧栏条目）
- **Style:** 36px 高（触屏 44px），7px 圆角，14px 文字，灰蓝文字（#505a69）。设置页导航、大纲行共用同一尺寸语言。
- **States:** hover 纸灰底（#f0f2f5）；激活 = 信纸蓝·洗底 + 信纸蓝·深文字 + 600 字重，不用竖条或左侧色块。
- **行内操作:** 图标默认隐藏，hover/focus-within 浮现（120ms 透明度过渡），触屏常驻。隐藏只藏视觉，不破坏键盘焦点顺序。

### Cards / Containers
- **Corner Style:** 8px 圆角。
- **Background:** 白卡片置于纸灰页面之上，或纸灰卡片置于白页面之上——层级靠色相对比，不靠阴影与边框堆叠。
- **Shadow Strategy:** 静态无阴影（见 The Flat-by-Default Rule）；可点卡片 hover 时浮起（见 Elevation）。
- **Internal Padding:** 20px（移动端 16px）。

### Inputs / Fields
- **Style:** 白底、1px 冷灰边框、6px 圆角；侧栏搜索 40px 高。
- **Focus:** 边框转信纸蓝；全局 `:focus-visible` 为 2px 信纸蓝 outline。
- **常驻容器规则:** 设置/管理页默认展示当前值，文本编辑收进弹层（Modal/Drawer），弹层内提供保存与取消——这是产品级契约，不只是样式。

### Menus / Popovers / Modals
- **Style:** 白底、1px 冷灰边框、6px 圆角 + 浮层阴影。
- **Modal:** 居中、8px 圆角；危险操作要求显式确认（如输入完整名称），确认表单允许直接展示输入框。

### Markdown 编辑器（Signature Component）
编辑器是 madoc 的第一公民。Crepe/Milkdown 的全部主题变量映射到 Mantine CSS variables（`--crepe-color-primary` → `--mantine-primary-color-filled` 等），保证编辑器与外壳永远同色。光标是信纸蓝；选区是信纸蓝·洗；协同光标是 2px 彩色竖线 + 10px 白字深色标签。文档标题是无边框的 Display 级输入，聚焦时仅以浅蓝下划线暗示可编辑。

## Do's and Don'ts

### Do:
- **Do** 消费 Mantine CSS variables（`var(--mantine-color-gray-1)` 等）作为唯一 token 来源；新样式进 Vanilla Extract，通用组件用 Mantine。
- **Do** 让信纸蓝保持稀有：一屏一个 primary 行动，其余用 subtle。
- **Do** 用"纸灰 vs 白"的色调分层表达层级，而不是边框与阴影堆叠。
- **Do** 数字信息使用 tabular-nums；触屏目标 ≥44px；所有过渡 150ms ease 并尊重 `prefers-reduced-motion`。
- **Do** 编辑器、白板等第三方核心的主题变量映射回同一套 Mantine tokens。

### Don't:
- **Don't** 创建第二套平行 token（`madocBlue500` 之类）——这是项目级禁令。
- **Don't** 给静态表面加常驻阴影，或给容器使用超过 10px 的圆角。
- **Don't** 用蓝色铺大面积背景、做渐变、写正文或标题文字。
- **Don't** 引入新的字体族、展示字体或图标字体。
- **Don't** 把页面堆成仪表盘：信息密度服务于"坐下来写字"，不服务于"一眼看全"。
