import { style } from '@vanilla-extract/css';

export const outline = style({ paddingTop: 14 });
export const documentTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
  flex: 1,
});
export const empty = style({
  padding: '8px 10px',
  color: 'var(--mantine-color-dark-3)',
});
export const list = style({ margin: 0, padding: 0, listStyle: 'none' });
export const header = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 6px 8px 10px',
  minHeight: 34,
});
export const tools = style({ display: 'flex', flexShrink: 0, gap: 2 });
export const toggle = style({ flexShrink: 0 });
export const spacer = style({ width: 26, flexShrink: 0 });
export const children = style({ paddingLeft: 14 });
export const row = style({
  display: 'flex',
  alignItems: 'center',
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
  padding: '7px 8px 7px 2px',
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
