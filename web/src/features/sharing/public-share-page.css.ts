import { globalStyle, style } from '@vanilla-extract/css';

export const page = style({
  minHeight: '100vh',
  background: 'var(--mantine-color-body)',
});

export const header = style({ paddingInline: 'var(--mantine-spacing-md)' });

export const content = style({
  minHeight: 240,
  overflow: 'hidden',
});

globalStyle(`${header} h1`, { overflowWrap: 'anywhere' });
globalStyle(`${content} .milkdown`, { minHeight: 200 });
globalStyle(`${content} .ProseMirror`, { outline: 'none', cursor: 'auto' });
globalStyle(`${content} img`, { maxWidth: '100%', height: 'auto' });
globalStyle(`${content} pre`, { overflowX: 'auto' });
