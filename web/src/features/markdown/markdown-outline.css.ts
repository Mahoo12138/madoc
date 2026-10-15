import { style } from '@vanilla-extract/css';
import { touchControls } from '@/styles/interaction.css';

export const outline = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  paddingTop: 12,
  selectors: {
    '&[data-desktop="true"]': { paddingTop: 0, overflow: 'hidden' },
  },
});
export const documentTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  flex: 1,
});
export const list = style({ margin: 0, padding: 0, listStyle: 'none' });
export const rootList = style({
  minWidth: 0,
  minHeight: 0,
  selectors: {
    [`${outline}[data-desktop="true"] &`]: {
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      overscrollBehavior: 'contain',
      scrollbarGutter: 'stable',
    },
  },
});
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  // The label and the tool buttons share the rows' left line: title text and
  // the chevron column below both start at panel gutter + row inset, so the
  // outline reads as one indented block instead of a floating caption.
  padding: '0 6px 8px 6px',
  minHeight: 34,
  flexShrink: 0,
  selectors: {
    [`${outline}[data-desktop="true"] &`]: {
      minHeight: 40,
      padding: '0 6px 8px',
    },
  },
});
export const tools = style({ display: 'flex', flexShrink: 0, gap: 2 });
export const toggle = style({ flexShrink: 0 });
export const spacer = style({
  width: 26,
  flexShrink: 0,
  '@media': { [touchControls]: { width: 44 } },
});
export const children = style({ paddingLeft: 'var(--madoc-indent-step)' });
export const row = style({
  display: 'flex',
  alignItems: 'center',
  paddingInlineStart: 'var(--madoc-inset-row)',
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-dark-4)',
  selectors: {
    '&:hover': { background: 'var(--mantine-color-gray-1)' },
    '&[data-active="true"]': {
      color: 'var(--mantine-color-blue-7)',
      background: 'var(--mantine-color-blue-0)',
      fontWeight: 600,
    },
  },
});
export const heading = style({
  display: 'block',
  flex: 1,
  minWidth: 0,
  minHeight: 34,
  '@media': { [touchControls]: { minHeight: 44 } },
  // No left padding: the chevron's own box already carries the gutter, and
  // every row's text starts on one column regardless of nesting depth.
  padding: '7px 8px 7px 0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: 'var(--mantine-font-size-sm)',
  lineHeight: 1.5,
  color: 'inherit',
  fontWeight: 'inherit',
  borderRadius: 'var(--mantine-radius-sm)',
  selectors: {
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: -2,
    },
  },
});
