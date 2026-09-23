import { style } from '@vanilla-extract/css';

export const source = style({
  fontFamily: 'var(--mantine-font-family-monospace)',
  fontSize: 'var(--mantine-font-size-sm)',
  lineHeight: 1.6,
  minHeight: '45vh',
  maxHeight: '60vh',
  overflow: 'auto',
});
