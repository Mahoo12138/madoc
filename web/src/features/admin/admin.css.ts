import { globalStyle, style } from '@vanilla-extract/css';
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
