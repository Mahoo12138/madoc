import { globalStyle, style } from '@vanilla-extract/css';

export const page = style({
  width: 'min(var(--madoc-content-width, 760px), calc(100% - 48px))',
  margin: '0 auto',
  padding: '40px 0 120px',
  '@media': {
    '(max-width: 760px)': {
      width: 'min(100% - 32px, var(--madoc-content-width, 760px))',
      paddingTop: 28,
    },
  },
});

export const title = style({
  margin: 0,
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

// Gap/node selections draw their own indicator and hide the native caret.
globalStyle(`${editor} .milkdown .ProseMirror:not(.ProseMirror-hideselection)`, {
  caretColor: 'var(--mantine-primary-color-filled)',
});

// The gap widget is a local insertion affordance, not a document paragraph.
// Give it a text line while focused so dividers open up around the caret.
// ProseMirror hides the widget on blur and removes it when selection moves.
globalStyle(`${editor} .milkdown .ProseMirror-gapcursor`, {
  position: 'relative',
  lineHeight: 1.5,
  height: 'calc(1lh + 8px)',
  paddingBlock: 4,
  marginBlock: '0.7em',
});

globalStyle(`${editor} .milkdown .ProseMirror-gapcursor::after`, {
  top: 'calc(4px + (1lh - 1em) / 2)',
  left: 0,
  width: 0,
  height: '1em',
  borderTop: 0,
  borderLeft: '1px solid var(--mantine-primary-color-filled)',
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


globalStyle(`${editor} .milkdown .ProseMirror blockquote`, {
  paddingLeft: 16,
});

globalStyle(`${editor} .madoc-hardbreak`, {
  color: 'var(--mantine-color-gray-5)',
  fontSize: '0.8em',
  paddingInline: '0.35em',
  userSelect: 'none',
  pointerEvents: 'none',
});

globalStyle(`${editor} .madoc-reference-definition`, {
  fontSize: '0.9em',
  color: 'var(--mantine-color-dimmed)',
  paddingBlock: 4,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

globalStyle(`${editor} .madoc-image-source-view`, {
  position: 'relative',
  maxWidth: '100%',
});

globalStyle(`${editor} .madoc-image-source-view.is-inline`, {
  display: 'inline-block',
  verticalAlign: 'middle',
});

globalStyle(`${editor} .madoc-image-source`, {
  display: 'block',
  width: '100%',
  minWidth: 0,
  flex: '1 1 0',
  boxSizing: 'border-box',
  resize: 'none',
  overflow: 'hidden',
  padding: '4px 0',
  marginBottom: 4,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: 'var(--mantine-color-text)',
  caretColor: 'var(--mantine-primary-color-filled)',
  fontFamily: 'var(--mantine-font-family-monospace)',
  fontSize: '0.85em',
  lineHeight: 1.5,
});

globalStyle(`${editor} .madoc-image-source[hidden], ${editor} .madoc-image-source-indicator[hidden], ${editor} .madoc-image-source-row[hidden]`, {
  display: 'none',
});

globalStyle(`${editor} .madoc-image-source-row`, {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 4,
  width: '100%',
});

globalStyle(`${editor} .madoc-image-source-indicator`, {
  display: 'inline-flex',
  flex: '0 0 16px',
  marginTop: 6,
  color: 'var(--mantine-color-dimmed)',
  userSelect: 'none',
  pointerEvents: 'none',
});


// Markdown title is edited in the source and exposed as the image tooltip.
globalStyle(`${editor} .milkdown .madoc-image-source-view .milkdown-image-block .caption-input, ${editor} .milkdown .madoc-image-source-view .milkdown-image-block .operation`, {
  display: 'none',
});


globalStyle(`${editor} .milkdown .madoc-image-source-view .image-wrapper img`, {
  objectFit: 'contain',
  minHeight: 0,
});

globalStyle('body', {
  '@media': {
    print: { color: '#000', background: '#fff' },
  },
});

globalStyle('body *', {
  '@media': {
    print: { visibility: 'hidden' },
  },
});

globalStyle(`${page}`, {
  '@media': {
    print: {
      position: 'absolute',
      inset: '0 auto auto 0',
      width: '100%',
      maxWidth: 'none',
      margin: 0,
      padding: 0,
      visibility: 'visible',
    },
  },
});

globalStyle(`${page} *`, {
  '@media': {
    print: { visibility: 'visible' },
  },
});

globalStyle(`${page} ${meta}, ${page} .milkdown-toolbar, ${page} .milkdown-slash-menu, ${page} .milkdown-block-handle`, {
  '@media': {
    print: { display: 'none' },
  },
});

globalStyle(`${page} ${editor}`, {
  '@media': {
    print: { marginTop: 0 },
  },
});

globalStyle(`${page} .milkdown .ProseMirror`, {
  '@media': {
    print: { minHeight: 0, overflow: 'visible', color: '#000' },
  },
});

globalStyle(`${page} .milkdown .ProseMirror :is(h1, h2, h3, h4, h5, h6)`, {
  '@media': {
    print: { breakAfter: 'avoid-page', color: '#000' },
  },
});

globalStyle(`${page} .milkdown .ProseMirror :is(pre, table, blockquote, figure, img)`, {
  '@media': {
    print: { breakInside: 'avoid-page' },
  },
});

globalStyle(`${page} .milkdown .ProseMirror pre`, {
  '@media': {
    print: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  },
});

globalStyle('@page', {
  margin: '18mm',
});

// Failed images keep their editable source, without a broken-image placeholder.
globalStyle(`${editor} .madoc-image-source-view.is-failed > .milkdown-image-block, ${editor} .madoc-image-source-view.is-failed > .milkdown-image-inline`, {
  display: 'none',
});

// CodeMirror declares gutter display with !important. Match it for this user preference.
globalStyle(`${editor}[data-code-line-numbers="false"] .cm-lineNumbers`, { display: 'none !important' });
