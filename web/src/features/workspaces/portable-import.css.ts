import { globalStyle, style } from '@vanilla-extract/css';

export const table = style({
  tableLayout: 'fixed',
  overflowWrap: 'anywhere',
});

globalStyle(`${table} th:last-child`, { width: '5rem' });
