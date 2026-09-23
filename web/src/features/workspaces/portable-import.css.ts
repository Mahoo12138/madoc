import { globalStyle, style } from '@vanilla-extract/css';

export const table = style({
  tableLayout: 'fixed',
  overflowWrap: 'anywhere',
});

globalStyle(`${table} th:last-child`, { width: '5rem' });

export const actions = style({
  position: 'sticky',
  bottom: 0,
  zIndex: 1,
  background: 'var(--mantine-color-body)',
  paddingBlock: 'var(--mantine-spacing-sm)',
  borderTop: '1px solid var(--mantine-color-default-border)',
});
