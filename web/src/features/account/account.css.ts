import { globalStyle, style } from '@vanilla-extract/css';
import { touchControls } from '@/styles/interaction.css';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';

export const trigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 8px',
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-text)',
  selectors: {
    '&:hover': { background: 'var(--mantine-color-gray-1)' },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: -2,
    },
  },
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const identity = style({ minWidth: 0, flex: 1, textAlign: 'left' });
export const sidebarIdentity = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  minHeight: 64,
  padding: '10px',
  borderRadius: 'var(--mantine-radius-sm)',
});
export const sidebarIdentityText = style({
  minWidth: 0,
  display: 'grid',
  gap: 2,
});
export const sidebarNavigation = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  marginTop: 12,
});
export const navigation = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});
export const navigationItem = style({
  width: '100%',
  minHeight: 40,
  paddingInline: 12,
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-gray-7)',
  background: 'transparent',
  fontSize: 14,
  fontWeight: 500,
  transition: 'background-color 140ms ease, color 140ms ease',
  selectors: {
    '&:hover:not(:disabled)': { background: 'var(--mantine-color-gray-1)' },
    '&[aria-current="page"]': {
      color: 'var(--mantine-color-blue-7)',
      background: 'var(--mantine-color-blue-0)',
      fontWeight: 600,
    },
    '&[aria-current="page"]:hover:not(:disabled)': {
      background: 'var(--mantine-color-blue-1)',
    },
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
export const pageMain = style({
  minWidth: 0,
  minHeight: '100dvh',
  background: 'var(--mantine-color-body)',
});
export const pageHeader = style({
  position: 'sticky',
  top: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 'var(--madoc-header-height)',
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
export const pageTitle = style({
  minWidth: 0,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 15,
  lineHeight: 1.4,
  fontWeight: 650,
});
export const headerSeparator = style({
  color: 'var(--mantine-color-gray-5)',
  paddingInline: 4,
});
export const mobileMenuButton = style({
  display: 'none',
  '@media': {
    [workspaceMedia.mobile]: {
      display: 'flex',
      flexShrink: 0,
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const mobileBackButton = style({
  display: 'none',
  marginLeft: 'auto',
  '@media': {
    [workspaceMedia.mobile]: {
      display: 'flex',
      flexShrink: 0,
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const pageScroll = style({
  minHeight: 'var(--madoc-frame-height)',
});
export const content = style({
  width: 'min(100%, var(--madoc-content-width))',
  minWidth: 0,
  margin: '0 auto',
  padding: '44px 40px 72px',
  '@media': { [workspaceMedia.mobile]: { padding: '28px 20px 72px' } },
});

globalStyle(`${content} .mantine-Text-root[data-size="lg"]`, {
  fontSize: 22,
  lineHeight: 1.35,
  marginBottom: 6,
});
globalStyle(
  `${pageMain} .mantine-Button-root, ${pageMain} .mantine-Select-input, ${pageMain} .mantine-TextInput-input`,
  { '@media': { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${pageMain} .mantine-ActionIcon-root`, {
  '@media': { [touchControls]: { minWidth: 44, minHeight: 44 } },
});
export const mobileDrawerContent = style({
  minHeight: 'calc(100dvh - 90px)',
  display: 'flex',
  flexDirection: 'column',
});
export const mobileDrawerBottom = style({
  marginTop: 'auto',
  paddingTop: 12,
  borderTop: '1px solid var(--mantine-color-gray-2)',
});
export const profile = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});
export const avatarRow = style({
  display: 'flex',
  gap: 20,
  alignItems: 'center',
  minWidth: 0,
  '@media': { '(max-width: 360px)': { flexWrap: 'wrap', gap: 16 } },
});
export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8,
  flexWrap: 'wrap',
});
export const profileValue = style({
  minWidth: 0,
  display: 'grid',
  gap: 4,
  overflowWrap: 'anywhere',
});
export const editButton = style({ alignSelf: 'flex-start' });
export const preferenceRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minWidth: 0,
  gap: 16,
  '@media': {
    '(max-width: 360px)': {
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: 10,
    },
  },
});
export const control = style({
  width: 150,
  flexShrink: 0,
  maxWidth: '100%',
  '@media': {
    [workspaceMedia.mobile]: { width: 145 },
    '(max-width: 360px)': { width: '100%' },
  },
});
export const preview = style({
  padding: 16,
  background: 'var(--mantine-color-gray-0)',
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-text)',
  overflow: 'hidden',
});
export const codePreview = style({
  fontFamily: 'monospace',
  fontSize: 13,
  lineHeight: 1.6,
  display: 'flex',
  gap: 16,
  fontVariantNumeric: 'tabular-nums',
  overflowX: 'auto',
});

export const switchBody = style({
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 20,
});
export const switchLabel = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
});

export const modalContent = style({
  vars: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
});

export const menuDropdown = style([
  modalContent,
  {
    // 240px 由 Menu 的 width 属性给出（Popover 默认内联 width: max-content）；
    // 视口不够时收到「视口 - 24px」，避免贴边或溢出。
    maxWidth: 'calc(100vw - 24px)',
    // 6px：外壳只负责托住行内 hover 底色，不需要比行内 inset 更宽。
    padding: 6,
    maxHeight: 'calc(100dvh - 32px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // 不覆盖 border：Popover 默认的 1px 冷灰（--popover-border-color = gray-2）
    // 正是 DESIGN.md「Menus」要求的样子，原先的 border: 0 是这一处的例外。
  },
]);
export const menuIdentity = style({
  display: 'grid',
  gridTemplateColumns: '36px minmax(0, 1fr)',
  alignItems: 'center',
  gap: 10,
  // 上下收窄到 10/12：身份区与操作行共用 10px 内缩，底部 12px 只负责
  // 把身份区和操作区分开，形成「区距 > 行距」的层次。
  padding: '10px 10px 12px',
});
export const menuIdentityText = style({
  minWidth: 0,
  display: 'grid',
  gap: 2,
});
export const menuName = style({
  color: 'var(--mantine-color-text)',
  overflowWrap: 'anywhere',
  lineHeight: 1.5,
});
export const menuEmail = style({
  overflowWrap: 'anywhere',
  lineHeight: 1.5,
});
// 行距 2px：36px 行高本身已经提供了呼吸，4px 会让三行操作显得松散。
export const menuActions = style({ display: 'grid', gap: 2 });
export const menuItem = style({
  // 36px：与树行/设置导航同高，弹层里的三行操作不再比侧栏条目更松。
  minHeight: 36,
  padding: '7px 10px',
  borderRadius: 'var(--mantine-radius-sm)',
  fontSize: 'var(--mantine-font-size-sm)',
  selectors: {
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: -2,
    },
  },
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const menuItemSection = style({
  // 40 → 18：图标 17px 居中放进 40px 栅格，图标与文字之间会空出约 23px，
  // 缩小到刚好包住图标，配合 10px 间距让图标与标签重新成为一组。
  width: 18,
  flexShrink: 0,
  display: 'grid',
  placeItems: 'center',
  marginInlineEnd: 10,
});
