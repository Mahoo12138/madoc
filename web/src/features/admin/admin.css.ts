import { globalStyle, keyframes, style } from '@vanilla-extract/css';
import { touchControls } from '@/styles/interaction.css';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';

// The Admin Shell reuses `workspace-shell.css` for the frame (shell / sidebar /
// brandRow / sidebarBottom / footerAction / main) and only adds what the site
// settings page needs. Every value comes from the shared scale: 10/12/16/20/32
// spacing, 30/24/16/14/12 type, Mantine CSS variables for colour.

export const pageMain = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  overflow: 'hidden',
  background: 'var(--mantine-color-body)',
});
export const sidebar = style({ gap: 14 });
export const dialogContent = style({});

globalStyle(
  `${pageMain} .mantine-Button-root, ${pageMain} .mantine-Switch-root`,
  { '@media': { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${pageMain} .mantine-ActionIcon-root`, {
  '@media': { [touchControls]: { minWidth: 44, minHeight: 44 } },
});
globalStyle(
  `${dialogContent} .mantine-Button-root, ${dialogContent} .mantine-Modal-close`,
  { '@media': { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${dialogContent} .mantine-ActionIcon-root`, {
  '@media': { [touchControls]: { minWidth: 44, minHeight: 44 } },
});

export const pageHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 'var(--madoc-header-height)',
  flexShrink: 0,
  padding: '0 var(--madoc-gutter-page)',
  borderBottom: '1px solid var(--mantine-color-gray-2)',
  background: 'var(--mantine-color-body)',
  '@media': {
    [workspaceMedia.mobile]: {
      padding: '0 var(--madoc-gutter-page-mobile)',
      gap: 8,
    },
  },
});
export const headerIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flex: 1,
  minWidth: 0,
});
export const pageTitle = style({
  margin: 0,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: 'var(--mantine-color-text)',
  fontSize: 30,
  fontWeight: 600,
  lineHeight: 1.4,
  '@media': { [workspaceMedia.mobile]: { fontSize: 24 } },
});
export const headerSeparator = style({
  color: 'var(--mantine-color-gray-5)',
  paddingInline: 4,
});
export const mobileNavigationToggle = style({
  display: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  '@media': {
    [workspaceMedia.mobile]: {
      display: 'inline-flex',
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const desktopBack = style({
  flexShrink: 0,
  '@media': { [workspaceMedia.mobile]: { display: 'none' } },
});
export const mobileBack = style({
  display: 'none',
  marginLeft: 'auto',
  '@media': {
    [workspaceMedia.mobile]: {
      display: 'inline-flex',
      minWidth: 44,
      minHeight: 44,
    },
  },
});

export const content = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  padding: '44px 40px 72px',
  '@media': { [workspaceMedia.mobile]: { padding: '28px 20px 72px' } },
});
export const pane = style({
  width: '100%',
  maxWidth: 'var(--madoc-content-width)',
  margin: '0 auto',
});
export const lead = style({
  margin: '12px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.7,
  maxWidth: '65ch',
  textWrap: 'balance',
});

export const section = style({ marginTop: 32 });
export const sectionRule = style({
  marginTop: 32,
  paddingTop: 20,
  borderTop: '1px solid var(--mantine-color-gray-2)',
});
export const sectionTitle = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});

export const actionRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 20,
  marginTop: 20,
  '@media': {
    [workspaceMedia.mobile]: { flexDirection: 'column', gap: 16 },
  },
});
export const actionText = style({ minWidth: 0, flex: 1 });
export const rowTitle = style({
  margin: '0 0 8px',
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const rowValue = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  lineHeight: 1.5,
});
export const description = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.7,
  maxWidth: '65ch',
  textWrap: 'balance',
});
export const pendingNote = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  maxWidth: '65ch',
  textWrap: 'balance',
});
export const upgradeNote = style({
  margin: '16px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  maxWidth: '65ch',
  textWrap: 'balance',
});
export const control = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
});
// 枚举控件（注册模式）：Mantine 的类名是哈希值，触屏命中区只能靠 classNames 传入。
export const modeControl = style({
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const modeLabel = style({
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const statusText = style({
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
});
export const rowAlert = style({ marginTop: 16 });
export const alertText = style({ margin: 0 });
export const alertActions = style({
  display: 'flex',
  gap: 10,
  marginTop: 12,
  flexWrap: 'wrap',
});

export const readOnlyRow = style({
  marginTop: 20,
  paddingTop: 20,
  borderTop: '1px solid var(--mantine-color-gray-2)',
});
export const readOnlyRowFirst = style({ marginTop: 16, paddingTop: 0, borderTop: 0 });
export const readOnlyHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap',
});
export const readOnlyTitle = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const emptySection = style({ marginTop: 20 });

export const conflictGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 16,
  '@media': { [workspaceMedia.mobile]: { gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 } },
});
export const conflictColumn = style({
  minWidth: 0,
  padding: 16,
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-sm)',
  background: 'var(--mantine-color-gray-0)',
});
export const conflictValue = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const formActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 10,
  marginTop: 20,
  flexWrap: 'wrap',
});

export const sidebarHeading = style({
  padding: '12px 10px 2px',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
});
export const navigation = style({
  display: 'flex',
  flex: 1,
  minHeight: 0,
  flexDirection: 'column',
  gap: 10,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});
export const navButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  minHeight: 40,
  padding: '0 12px',
  border: 0,
  borderRadius: 'var(--mantine-radius-sm)',
  background: 'transparent',
  color: 'var(--mantine-color-gray-7)',
  font: 'inherit',
  fontSize: 14,
  fontWeight: 500,
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 150ms ease, color 150ms ease',
  selectors: {
    '&:hover': { background: 'var(--mantine-color-gray-1)' },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: -2,
    },
  },
  '@media': {
    [touchControls]: { minHeight: 44 },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
export const navButtonActive = style({
  color: 'var(--mantine-color-blue-7)',
  background: 'var(--mantine-color-blue-0)',
  fontWeight: 600,
  selectors: { '&:hover': { background: 'var(--mantine-color-blue-1)' } },
});
export const mobileDrawerBody = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: 'calc(100dvh - 66px)',
  gap: 16,
});
export const mobileNavigationFooter = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  marginTop: 'auto',
  paddingTop: 12,
  borderTop: '1px solid var(--mantine-color-gray-2)',
});

export const standalone = style({
  minHeight: '100dvh',
  padding: '32px 20px',
  boxSizing: 'border-box',
});
export const standaloneStack = style({
  width: 'min(100%, 420px)',
  margin: '0 auto',
});

// ── 用户管理 ────────────────────────────────────────────────────────────────
// 同一套刻度：10/12/16/20/32 间距，16/14/12 字号，Mantine CSS 变量取色。

export const pageLead = style({
  margin: '12px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.7,
  maxWidth: '65ch',
  textWrap: 'balance',
});

export const filterBar = style({
  display: 'flex',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  gap: 12,
  marginTop: 20,
});
export const searchField = style({
  flex: '1 1 240px',
  minWidth: 0,
  maxWidth: 320,
});
export const filterGroup = style({ minWidth: 0 });
export const filterLabel = style({
  display: 'block',
  marginBottom: 10,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
});
// 枚举筛选：Mantine 的类名是哈希值，触屏命中区只能靠 classNames 传入。
export const filterControl = style({
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const filterOption = style({
  '@media': { [touchControls]: { minHeight: 44 } },
});

export const listStatus = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '12px 0 0',
  minHeight: 32,
});
export const listCount = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
});

export const tableWrap = style({
  marginTop: 12,
  overflowX: 'auto',
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-sm)',
  background: 'var(--mantine-color-body)',
});
export const table = style({ minWidth: 720 });
export const identityCell = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minWidth: 0,
});
export const identityText = style({ minWidth: 0 });
export const identityName = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const identityEmail = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
/** 状态一律以文字承载，颜色只是辅助（DESIGN.md：不能只靠颜色）。 */
export const cellText = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
});
export const cellNote = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
});
export const cellDate = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
});
export const selfMark = style({ color: 'var(--mantine-color-dimmed)' });

// 窄屏（≤760px）信息行：表格让位给一栏一值，避免横向滚动。
export const infoList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginTop: 12,
});
export const infoCard = style({
  padding: 16,
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-sm)',
  background: 'var(--mantine-color-body)',
});
export const infoHead = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
});
export const infoGrid = style({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: '10px 16px',
  marginTop: 12,
});
export const infoLabel = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  whiteSpace: 'nowrap',
});
export const infoValue = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  lineHeight: 1.5,
});
export const infoActions = style({ display: 'flex', marginTop: 16 });

export const pagination = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 20,
});
export const paginationText = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
});
export const paginationActions = style({ display: 'flex', gap: 10 });

export const loadState = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  justifyContent: 'center',
  padding: '32px 0',
});

// ── 详情抽屉 ────────────────────────────────────────────────────────────────
export const drawerBody = style({});
globalStyle(
  `${drawerBody} .mantine-Button-root, ${drawerBody} .mantine-Switch-root`,
  { '@media': { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${drawerBody} .mantine-ActionIcon-root`, {
  '@media': { [touchControls]: { minWidth: 44, minHeight: 44 } },
});

export const drawerIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minWidth: 0,
});
export const drawerName = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const drawerEmail = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const drawerSectionTitle = style({
  margin: '20px 0 0',
  color: 'var(--mantine-color-text)',
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const drawerRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 20,
  marginTop: 16,
  paddingTop: 16,
  borderTop: '1px solid var(--mantine-color-gray-2)',
  '@media': { [workspaceMedia.mobile]: { flexDirection: 'column', gap: 12 } },
});
export const drawerRowText = style({ minWidth: 0, flex: 1 });
export const drawerRowTitle = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const drawerRowValue = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  lineHeight: 1.5,
});
export const drawerRowNote = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  maxWidth: '52ch',
  textWrap: 'balance',
});
export const drawerRowControl = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexShrink: 0,
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
});
export const drawerMeta = style({
  margin: '20px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  fontVariantNumeric: 'tabular-nums',
});
export const drawerDangerZone = style({
  marginTop: 20,
  paddingTop: 20,
  borderTop: '1px solid var(--mantine-color-gray-2)',
});
export const drawerDangerTitle = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const drawerDangerNote = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  maxWidth: '52ch',
  textWrap: 'balance',
});
export const drawerDangerAction = style({ marginTop: 12 });
export const drawerError = style({ marginTop: 16 });

// ── 操作记录 ────────────────────────────────────────────────────────────────
// 沿用工作区活动记录的时间轴语言：日期横线分组 + 竖脊把同一天串起来 + 逐条
// 事件标记。刻度与 `workspace-management.css.ts` 保持一致（14/12 字号，
// 10/12/16 间距，Mantine CSS 变量取色，静态零阴影，150ms 过渡）。
const auditMarkerSize = 22;
const auditRailWidth = 68;
const auditRailWidthMobile = 52;
// 竖脊起止于首个/末个标记的圆心。
const auditSpineInset = 12 + auditMarkerSize / 2;

const auditEnter = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const auditFilterInput = style({
  '@media': { [touchControls]: { minHeight: 44 } },
});

export const auditDayGroup = style({ margin: 0 });
export const auditDayDivider = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  margin: '32px 0 12px',
});
export const auditDayLabel = style({
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
});
export const auditDayRule = style({
  flex: 1,
  height: 1,
  background: 'var(--mantine-color-gray-2)',
});
export const auditDayCount = style({
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
});

export const auditList = style({
  position: 'relative',
  display: 'grid',
  // 这是一条时间轴：列表语义只用于让读屏软件按条播报，视觉由竖脊承担。
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '::before': {
    content: '""',
    position: 'absolute',
    top: auditSpineInset,
    bottom: auditSpineInset,
    left: auditRailWidth / 2,
    width: 1,
    background: 'var(--mantine-color-gray-2)',
  },
  // 一天只有一条记录时，露在标记上方/下方的线头没有意义。
  selectors: {
    '&:has(> :only-child)::before': { display: 'none' },
  },
  '@media': {
    [workspaceMedia.mobile]: {
      '::before': { left: auditRailWidthMobile / 2 },
    },
  },
});

export const auditRow = style({
  display: 'grid',
  gridTemplateColumns: `${auditRailWidth}px minmax(0, 1fr)`,
  gap: 16,
  padding: '12px 12px 12px 0',
  borderRadius: 6,
  animation: `${auditEnter} 200ms ease both`,
  animationDelay: 'calc(var(--madoc-audit-index, 0) * 35ms)',
  transition: 'background-color 150ms ease',
  ':hover': { background: 'var(--mantine-color-gray-0)' },
  '@media': {
    [workspaceMedia.mobile]: {
      gridTemplateColumns: `${auditRailWidthMobile}px minmax(0, 1fr)`,
      gap: 12,
    },
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const auditRail = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
});
export const auditMarker = style({
  display: 'grid',
  placeItems: 'center',
  width: auditMarkerSize,
  height: auditMarkerSize,
  flexShrink: 0,
  borderRadius: '50%',
  background: 'var(--mantine-color-white)',
  border: '1px solid var(--mantine-color-gray-3)',
  color: 'var(--mantine-color-dimmed)',
});
export const auditTime = style({
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
  fontVariantNumeric: 'tabular-nums',
});
export const auditMeta = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
});
/** 动作中文名是每行的主识别内容，字号与用户列表的身份名一致。 */
export const auditSummary = style({
  margin: 0,
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.5,
});
export const auditActor = style({
  margin: '2px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
});
export const auditTargetNote = style({
  display: 'block',
  marginTop: 10,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.4,
});
// 展开入口：文字按钮而不是图标方块，触屏命中区由 minHeight 保证。
export const auditToggle = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  marginTop: 10,
  padding: 0,
  border: 0,
  background: 'transparent',
  color: 'var(--mantine-color-blue-7)',
  font: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.4,
  cursor: 'pointer',
  transition: 'color 150ms ease',
  selectors: {
    '&:hover': { color: 'var(--mantine-color-blue-9)' },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: 2,
    },
  },
  '@media': {
    [touchControls]: { minHeight: 44 },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
export const auditChanges = style({
  margin: '12px 0 0',
  padding: 0,
  listStyle: 'none',
  display: 'grid',
  gap: 10,
});
export const auditChangeRow = style({
  margin: 0,
  paddingLeft: 12,
  borderLeft: '2px solid var(--mantine-color-gray-2)',
  color: 'var(--mantine-color-text)',
  fontSize: 14,
  lineHeight: 1.6,
});
