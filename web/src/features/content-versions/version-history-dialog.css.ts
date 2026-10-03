import { style } from '@vanilla-extract/css';
import { touchControls } from '@/styles/interaction.css';

const mobile = '(max-width: 760px)';
const shortViewport = '(max-height: 600px)';

export const modal = style({
  display: 'flex',
  flexDirection: 'column',
  height: 'min(760px, calc(100dvh - 64px))',
  maxHeight: 'calc(100dvh - 64px)',
  '@media': {
    [mobile]: {
      height: 'calc(100dvh - 32px)',
      maxHeight: 'calc(100dvh - 32px)',
    },
  },
});
export const modalHeader = style({
  flexShrink: 0,
  padding: '16px 24px',
  '@media': { [mobile]: { padding: '12px 16px' } },
});
export const modalBody = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '0 24px 20px',
  '@media': {
    [mobile]: { padding: '0 16px 16px' },
    [shortViewport]: { overflowY: 'auto', overscrollBehavior: 'contain' },
  },
});
export const tabs = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  '@media': { [shortViewport]: { flex: 'none' } },
});
export const tabList = style({ flexShrink: 0 });
export const panel = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  '@media': { [shortViewport]: { flex: 'none' } },
});
export const toolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  padding: '16px 0',
  flexShrink: 0,
});
export const itemTitle = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
});
export const action = style({
  flexShrink: 0,
  '@media': { [touchControls]: { minHeight: 44 } },
});
export const notice = style({ marginTop: 12, flexShrink: 0 });
export const browser = style({
  display: 'grid',
  gridTemplateColumns: '240px minmax(0, 1fr)',
  gap: 24,
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  '@media': {
    [mobile]: {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(100px, 128px) minmax(0, 1fr)',
      gap: 16,
    },
    [shortViewport]: { flex: 'none', height: 440 },
  },
});
export const versionList = style({
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  padding: 6,
  background: 'var(--mantine-color-gray-0)',
  borderRadius: 'var(--mantine-radius-sm)',
});
export const versionButton = style({
  display: 'grid',
  gap: 6,
  width: '100%',
  padding: '12px 10px',
  textAlign: 'left',
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-text)',
  selectors: {
    '&:hover': { background: 'var(--mantine-color-gray-1)' },
    '&[aria-pressed="true"]': {
      background: 'var(--mantine-color-blue-0)',
      color: 'var(--mantine-color-blue-7)',
    },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: -2,
    },
  },
});
export const versionLabel = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
  minWidth: 0,
});
export const versionName = style({
  minWidth: 0,
  overflowWrap: 'anywhere',
  lineHeight: 1.5,
});
export const kind = style({
  flexShrink: 0,
  marginTop: 2,
  borderRadius: 'var(--mantine-radius-xs)',
  textTransform: 'none',
  letterSpacing: 0,
});
export const loadMore = style({ width: '100%', marginTop: 8 });
export const preview = style({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  minHeight: 0,
});
export const previewHeader = style({
  display: 'grid',
  gap: 6,
  paddingBottom: 12,
  flexShrink: 0,
});
export const previewTitle = style({
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
});
export const previewTabs = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
});
export const previewPanel = style({
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  marginTop: 12,
  background: 'var(--mantine-color-gray-0)',
  borderRadius: 'var(--mantine-radius-sm)',
});
export const code = style({
  minHeight: '100%',
  padding: 16,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  color: 'var(--mantine-color-text)',
  background: 'transparent',
  fontSize: 12,
  lineHeight: 1.7,
});
export const diffCode = style([
  code,
  { whiteSpace: 'pre', overflowWrap: 'normal' },
]);
export const previewFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  paddingTop: 12,
  flexShrink: 0,
});
export const boardViewport = style({
  display: 'grid',
  placeItems: 'center',
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  background: 'var(--mantine-color-gray-0)',
  borderRadius: 'var(--mantine-radius-sm)',
});
export const boardImage = style({
  display: 'block',
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
});
export const usage = style({
  display: 'grid',
  gap: 6,
  paddingTop: 16,
  flexShrink: 0,
});
export const usageSummary = style({
  display: 'flex',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '4px 16px',
  fontVariantNumeric: 'tabular-nums',
});
export const formActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
});
export const sharePanel = style({
  minHeight: 0,
  overflow: 'auto',
  paddingTop: 20,
  overscrollBehavior: 'contain',
});
export const shareHeader = style({
  display: 'grid',
  gap: 12,
  marginBottom: 20,
});
export const shareSelector = style({ maxWidth: 440 });
export const shareActions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
});
export const shareRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '14px 0',
  '@media': { [mobile]: { flexDirection: 'column', gap: 8 } },
});
export const shareIdentity = style({ display: 'grid', gap: 6, minWidth: 0 });
export const shareName = style({ overflowWrap: 'anywhere', minWidth: 0 });
export const shareLink = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 36px',
  gap: 8,
  marginTop: 12,
  '@media': { [touchControls]: { gridTemplateColumns: 'minmax(0, 1fr) 44px' } },
});
