import { style } from '@vanilla-extract/css';

export const results = style({
  maxHeight: '55vh',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});
export const content = style({
  minWidth: 0,
  flex: 1,
  overflowWrap: 'anywhere',
});
export const icon = style({ flexShrink: 0, marginTop: 3 });
export const option = style({
  padding: 'var(--mantine-spacing-sm)',
  borderRadius: 'var(--mantine-radius-sm)',
});
