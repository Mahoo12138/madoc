import { globalStyle, keyframes, style } from "@vanilla-extract/css";
import { touchControls } from "@/styles/interaction.css";
import { workspaceMedia } from "./workspace-layout";

export const pageMain = style({
  display: "flex",
  flexDirection: "column",
  height: "100dvh",
  overflow: "hidden",
});
export const sidebar = style({ gap: 14 });
export const dialogContent = style({});

globalStyle(
  `${pageMain} .mantine-Button-root, ${pageMain} .mantine-Tabs-tab, ${pageMain} .mantine-Select-input, ${pageMain} .mantine-TextInput-input`,
  { "@media": { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${pageMain} .mantine-ActionIcon-root`, {
  "@media": { [touchControls]: { minWidth: 44, minHeight: 44 } },
});
globalStyle(
  `${dialogContent} .mantine-Button-root, ${dialogContent} .mantine-Select-input, ${dialogContent} .mantine-TextInput-input, ${dialogContent} .mantine-Modal-close`,
  { "@media": { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${dialogContent} .mantine-ActionIcon-root`, {
  "@media": { [touchControls]: { minWidth: 44, minHeight: 44 } },
});

export const pageHeader = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: "var(--madoc-header-height)",
  flexShrink: 0,
  padding: "0 var(--madoc-gutter-page)",
  borderBottom: "1px solid var(--mantine-color-gray-2)",
  background: "var(--mantine-color-body)",
  "@media": {
    [workspaceMedia.mobile]: {
      padding: "0 var(--madoc-gutter-page-mobile)",
      gap: 8,
    },
  },
});
export const headerIdentity = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
});
export const headerTitle = style({
  margin: 0,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--mantine-color-text)",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.35,
});
export const headerSeparator = style({
  color: "var(--mantine-color-gray-5)",
  paddingInline: 4,
});
export const headerWorkspace = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--mantine-color-dimmed)",
  fontSize: 13,
  "@media": { [workspaceMedia.mobile]: { display: "none" } },
});
export const desktopBack = style({
  "@media": { [workspaceMedia.mobile]: { display: "none" } },
});
export const mobileNavigationToggle = style({
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  "@media": {
    [workspaceMedia.mobile]: {
      display: "inline-flex",
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const mobileBack = style({
  display: "none",
  "@media": {
    [workspaceMedia.mobile]: {
      display: "inline-flex",
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const sidebarHeading = style({
  padding: "12px 10px 2px",
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  fontWeight: 600,
});
export const navigation = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
  flexDirection: "column",
  gap: 4,
  overflowY: "auto",
  overscrollBehavior: "contain",
});

export const navButton = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  minHeight: 40,
  padding: "0 12px",
  border: 0,
  borderRadius: "var(--mantine-radius-sm)",
  background: "transparent",
  color: "var(--mantine-color-gray-7)",
  font: "inherit",
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
  fontWeight: 500,
  transition: "background-color 140ms ease, color 140ms ease",
  selectors: {
    "&:hover:not(:disabled)": { background: "var(--mantine-color-gray-1)" },
    "&:focus-visible": {
      outline: "2px solid var(--mantine-primary-color-filled)",
      outlineOffset: -2,
    },
    "&:disabled": { cursor: "not-allowed", opacity: 0.55 },
  },
  "@media": {
    [touchControls]: { minHeight: 44 },
    "(prefers-reduced-motion: reduce)": { transition: "none" },
  },
});

export const navButtonActive = style({
  color: "var(--mantine-color-blue-7)",
  background: "var(--mantine-color-blue-0)",
  fontWeight: 600,
  selectors: {
    "&:hover:not(:disabled)": { background: "var(--mantine-color-blue-1)" },
  },
});

export const mobileDrawerBody = style({
  display: "flex",
  flexDirection: "column",
  minHeight: "calc(100dvh - 66px)",
  gap: 16,
});
export const mobileNavigationFooter = style({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: "auto",
  paddingTop: 12,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});

export const content = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "44px 40px 72px",
  "@media": {
    [workspaceMedia.mobile]: {
      padding: "28px 20px 72px",
    },
  },
});

export const pane = style({ maxWidth: "var(--madoc-content-width)", margin: "0 auto" });
export const pageHeading = style({
  margin: 0,
  color: "var(--mantine-color-text)",
  fontSize: 22,
  fontWeight: 650,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
});
export const lead = style({
  margin: "8px 0 0",
  color: "var(--mantine-color-dimmed)",
  fontSize: 14,
  lineHeight: 1.7,
  maxWidth: "65ch",
});
export const section = style({ marginTop: 32 });
export const sectionHeading = style({
  margin: "0 0 8px",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.4,
});
export const sectionRule = style({
  marginTop: 30,
  paddingTop: 24,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});
export const dangerRule = style({
  marginTop: 44,
  paddingTop: 24,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});
export const actionRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  "@media": {
    [workspaceMedia.mobile]: {
      alignItems: "flex-start",
      flexDirection: "column",
      gap: 16,
    },
  },
});
export const actionText = style({ minWidth: 0 });
// Destructive confirmation repeats the workspace name inside a TextInput
// description; keep it wrapping instead of letting one long token widen the row.
export const confirmTarget = style({
  display: "block",
  overflowWrap: "anywhere",
  fontVariantNumeric: "tabular-nums",
});
export const workspaceDescription = style({
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
});
export const formActions = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 16,
  flexWrap: "wrap",
});

export const list = style({
  display: "grid",
  gap: 12,
  marginTop: 24,
});
export const listCard = style({
  minWidth: 0,
  padding: 16,
  borderRadius: "var(--mantine-radius-md)",
  background: "var(--mantine-color-gray-0)",
});
export const memberRow = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 16,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)", gap: 12 },
  },
});
export const memberIdentity = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
});
export const memberMeta = style({ minWidth: 0, overflowWrap: "anywhere" });
export const memberAvatar = style({ flexShrink: 0 });
export const memberActions = style({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
});
// 邀请面板 = 工作区的「邀请台」：一张白纸压在页面上（1px 冷灰边、零阴影），
// 页头是 20/650 的标题加这一屏唯一的主行动——信纸蓝只在这里出现一次，
// 所以它必须是实的，而不是一个灰描边按钮。纸面下方用 1px 细线按行记下
// 待处理邀请；空状态退成纸面上的一句低调说明，空白不该比行动更响。
const inviteEnter = keyframes({
  from: { opacity: 0, transform: "translateY(6px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

export const inviteDesk = style({
  display: "grid",
  marginTop: 8,
  padding: 32,
  border: "1px solid var(--mantine-color-gray-2)",
  borderRadius: "var(--mantine-radius-md)",
  background: "var(--mantine-color-white)",
  animation: `${inviteEnter} 240ms ease-out both`,
  "@media": {
    [workspaceMedia.mobile]: { padding: 20 },
    "(prefers-reduced-motion: reduce)": { animation: "none" },
  },
});
export const inviteDeskHead = style({
  display: "flex",
  // 按钮与标题顶对齐：它是这个标题的行动，而不是整块文字的居中装饰。
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 20,
  "@media": {
    [workspaceMedia.mobile]: {
      alignItems: "stretch",
      flexDirection: "column",
      gap: 16,
    },
  },
});
export const inviteHeadline = style({
  margin: 0,
  color: "var(--mantine-color-text)",
  fontSize: 20,
  fontWeight: 650,
  lineHeight: 1.4,
  textWrap: "balance",
});
// 标题与说明的 8px 耦合沿用 `lead` 之于 `pageHeading` 的既有节拍。
export const inviteLead = style({
  margin: "8px 0 0",
  maxWidth: "44ch",
  color: "var(--mantine-color-dimmed)",
  fontSize: 14,
  lineHeight: 1.7,
  textWrap: "balance",
});
export const invitePrimary = style({
  flexShrink: 0,
  "@media": { [workspaceMedia.mobile]: { width: "100%" } },
});
// 链接是行动的产物，落进纸面上的一方纸灰：白纸 → 纸灰 → 白色输入框，
// 三层全靠色调分层，不用阴影。它在生成的瞬间淡入，是「信写好了」的一刻。
export const inviteResult = style({
  marginTop: 20,
  padding: 16,
  borderRadius: "var(--mantine-radius-sm)",
  background: "var(--mantine-color-gray-0)",
  animation: `${inviteEnter} 240ms ease-out both`,
  "@media": {
    "(prefers-reduced-motion: reduce)": { animation: "none" },
  },
});
export const inviteLedgerHead = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "32px 0 4px",
});
export const inviteLedgerLabel = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: "nowrap",
});
export const inviteLedgerRule = style({
  flex: 1,
  height: 1,
  background: "var(--mantine-color-gray-2)",
});
export const inviteLedgerCount = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
export const inviteLedger = style({ display: "grid" });
// Paper 自带白底与圆角；在纸面里它退成一行记录，只剩 1px 细线分隔。
export const inviteRow = style({
  minWidth: 0,
  padding: "16px 0",
  borderRadius: 0,
  background: "transparent",
  selectors: {
    "&:not(:first-child)": {
      borderTop: "1px solid var(--mantine-color-gray-2)",
    },
  },
});
// EmptyState 的 inline 变体为侧栏导航行预留了 8px 内缩；纸面里它要跟上方
// 的标题行、下方的记录行对齐，所以在这一处把这 8px 抵消掉。
export const inviteEmpty = style({ margin: "4px -8px 0" });
// 这一屏的空状态没有卡片也没有色块，只剩一枚灰色小标记加一句话：它要读起来
// 像写在纸面上的备注，而不是一块占位的砖。标题比说明深一档，层级仍立得住。
export const inviteEmptyTitle = style({
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "var(--mantine-color-gray-7)",
});

export const inviteFields = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 145px",
  gap: 12,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});
export const inviteLink = style({
  display: "flex",
  gap: 8,
  minWidth: 0,
});
export const statusLine = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});

// 活动记录 = 日志时间轴。事件不再是并列的灰卡片，而是一条纸面上的
// 竖脊 + 事件标记：日期靠横线分组，竖脊把同一天串起来，标记图标让人
// 一眼看出这类操作做了什么。只有最新一条用信纸蓝（状态指示），
// 其余保持冷灰——信纸蓝仍然稀有。
const activityEnter = keyframes({
  from: { opacity: 0, transform: "translateY(4px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});
// 只播两次：入场时轻轻点一下「这是最新一条」，之后归于安静。
const newestPulse = keyframes({
  "0%": { transform: "scale(1)", opacity: 0.5 },
  "70%": { transform: "scale(1.75)", opacity: 0 },
  "100%": { transform: "scale(1.75)", opacity: 0 },
});

const MARKER_SIZE = 22;
const RAIL_WIDTH = 68;
const RAIL_WIDTH_MOBILE = 52;
// 竖脊起止于首个/末个标记的圆心。
const SPINE_INSET = 12 + MARKER_SIZE / 2;

export const dayGroup = style({ margin: 0 });
export const dayDivider = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  margin: "28px 0 12px",
});
export const dayLabel = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
export const dayRule = style({
  flex: 1,
  height: 1,
  background: "var(--mantine-color-gray-2)",
});
export const dayCount = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

export const activityMarker = style({
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: MARKER_SIZE,
  height: MARKER_SIZE,
  flexShrink: 0,
  borderRadius: "50%",
  background: "var(--mantine-color-white)",
  border: "1px solid var(--mantine-color-gray-3)",
  color: "var(--mantine-color-dimmed)",
});
export const activityMarkerNewest = style({
  background: "var(--mantine-color-blue-0)",
  borderColor: "var(--mantine-color-blue-2)",
  color: "var(--mantine-color-blue-7)",
  "::after": {
    content: '""',
    position: "absolute",
    inset: -1,
    borderRadius: "50%",
    border: "1px solid var(--mantine-color-blue-4)",
    animation: `${newestPulse} 1.4s ease-out 2`,
  },
  "@media": {
    "(prefers-reduced-motion: reduce)": { "::after": { animation: "none" } },
  },
});

export const activityList = style({
  position: "relative",
  display: "grid",
  "::before": {
    content: '""',
    position: "absolute",
    top: SPINE_INSET,
    bottom: SPINE_INSET,
    left: RAIL_WIDTH / 2,
    width: 1,
    background: "var(--mantine-color-gray-2)",
  },
  // 一天只有一条记录时，露在标记上方/下方的线头没有意义。
  selectors: {
    "&:has(> :only-child)::before": { display: "none" },
  },
  "@media": {
    [workspaceMedia.mobile]: { "::before": { left: RAIL_WIDTH_MOBILE / 2 } },
  },
});

export const activityRow = style({
  display: "grid",
  gridTemplateColumns: `${RAIL_WIDTH}px minmax(0, 1fr)`,
  gap: 16,
  padding: "12px 12px 12px 0",
  borderRadius: 6,
  animation: `${activityEnter} 200ms ease both`,
  // 逐条入场，最多叠 8 步，避免长列表拖到最后一屏才出现。
  animationDelay: "calc(var(--madoc-activity-index, 0) * 35ms)",
  transition: "background-color 150ms ease",
  // 阅读辅助：让视线在长行上不跑偏；行本身不可点，光标保持默认。
  ":hover": { background: "var(--mantine-color-gray-0)" },
  "@media": {
    [workspaceMedia.mobile]: {
      gridTemplateColumns: `${RAIL_WIDTH_MOBILE}px minmax(0, 1fr)`,
      gap: 12,
    },
    "(prefers-reduced-motion: reduce)": { animation: "none" },
  },
});
export const activityRail = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
});
export const activityMeta = style({ minWidth: 0, overflowWrap: "anywhere" });
export const activityItemTitle = style({ color: "var(--mantine-color-gray-7)" });
export const activityTime = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: "tabular-nums",
});
