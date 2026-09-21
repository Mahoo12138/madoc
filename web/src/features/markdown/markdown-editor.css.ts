import { globalStyle, style } from '@vanilla-extract/css';

export const page = style({
  width: 'min(760px, calc(100% - 48px))',
  margin: '0 auto',
  padding: '40px 0 120px',
  '@media': {
    '(max-width: 760px)': {
      width: 'min(100% - 32px, 760px)',
      paddingTop: 28,
    },
  },
});

export const title = style({
  width: '100%',
  padding: 0,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: 'var(--mantine-color-dark-9)',
  caretColor: 'var(--mantine-primary-color-filled)',
  fontSize: 38,
  fontWeight: 700,
  lineHeight: 1.15,
  letterSpacing: '-0.032em',
  selectors: {
    '&::placeholder': { color: 'var(--mantine-color-gray-5)' },
    '&:focus-visible': { textDecoration: 'underline', textDecorationColor: 'var(--mantine-color-blue-2)', textUnderlineOffset: 8 },
  },
  '@media': {
    '(max-width: 760px)': { fontSize: 32 },
  },
});

export const meta = style({
  minHeight: 36,
  marginTop: 14,
  color: 'var(--mantine-color-gray-6)',
});

export const editor = style({
  marginTop: 18,
  position: 'relative',
  vars: {
    '--crepe-color-background': 'var(--mantine-color-white)',
    '--crepe-color-surface': 'var(--mantine-color-white)',
    '--crepe-color-on-background': 'var(--mantine-color-dark-8)',
    '--crepe-color-on-surface': 'var(--mantine-color-dark-8)',
    '--crepe-color-primary': 'var(--mantine-primary-color-filled)',
    '--crepe-color-outline': 'var(--mantine-color-gray-6)',
    '--crepe-color-hover': 'var(--mantine-color-gray-1)',
    '--crepe-color-selected': 'var(--mantine-color-blue-0)',
    '--crepe-font-default': 'var(--mantine-font-family)',
  },
});

export const focusMode = style({});
export const typewriterMode = style({});

globalStyle(`${focusMode} .milkdown .ProseMirror :is(p, h1, h2, h3, h4, h5, h6, pre, blockquote, table)`, {
  opacity: 0.24,
  transition: 'opacity 160ms ease-out',
});

globalStyle(`${focusMode} .milkdown .ProseMirror .madoc-current-block`, {
  opacity: 1,
});

globalStyle(`${focusMode} .milkdown .ProseMirror:hover :is(p, h1, h2, h3, h4, h5, h6, pre, blockquote, table)`, {
  opacity: 0.48,
});

globalStyle(`${focusMode} .milkdown .ProseMirror:hover .madoc-current-block`, {
  opacity: 1,
});

globalStyle(`${typewriterMode} .milkdown .ProseMirror > *`, {
  scrollMarginBlock: '42vh',
});

globalStyle(`${editor} .milkdown-toolbar`, {
  border: '1px solid var(--mantine-color-gray-2)',
  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
});

globalStyle(`${editor} .milkdown-slash-menu`, {
  border: '1px solid var(--mantine-color-gray-2)',
  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)',
});

globalStyle(`${editor} .milkdown .ProseMirror`, {
  caretColor: 'var(--mantine-primary-color-filled)',
});

globalStyle(`${editor} .milkdown .ProseMirror ::selection`, {
  background: 'var(--mantine-color-blue-1)',
});

globalStyle(`${editor} .milkdown .ProseMirror > p`, {
  marginBlock: '0.7em',
});

globalStyle(`${editor} .milkdown .ProseMirror > h1, ${editor} .milkdown .ProseMirror > h2, ${editor} .milkdown .ProseMirror > h3`, {
  marginTop: '1.6em',
  marginBottom: '0.55em',
});

globalStyle(`${editor} .milkdown .crepe-placeholder::before`, {
  color: 'var(--mantine-color-gray-5)',
});

globalStyle(`${focusMode} .milkdown .ProseMirror :is(p, h1, h2, h3, h4, h5, h6, pre, blockquote, table)`, {
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});
