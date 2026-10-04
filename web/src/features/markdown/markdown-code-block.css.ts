import { globalStyle } from '@vanilla-extract/css';

const block = '.milkdown .ProseMirror .milkdown-code-block';
const language = `${block} .madoc-code-language-host .language-button`;
const buttons = `${block} .tools .tools-button-group button`;

globalStyle(block, {
  position: 'relative',
  padding: '10px 12px',
  // Keep the external selector close to the next block, never inside the code.
  margin: '12px 0 24px',
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-xs)',
});
globalStyle(`${block} .cm-activeLineGutter`, {
  backgroundColor: 'transparent',
  color: 'inherit',
  fontWeight: 'inherit',
});
globalStyle(`${block} .tools`, {
  position: 'absolute',
  inset: 0,
  minHeight: 0,
  display: 'block',
  pointerEvents: 'none',
});
globalStyle(`${block}[data-madoc-language-picker] .tools > .language-button, ${block}[data-madoc-language-picker] .tools > .language-picker`, {
  display: 'none',
});
globalStyle(`${block} .madoc-code-language-host`, {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  maxWidth: '100%',
  pointerEvents: 'auto',
});
globalStyle(language, {
  minWidth: 120,
  maxWidth: '100%',
  height: 28,
  margin: 0,
  padding: '4px 8px',
  justifyContent: 'space-between',
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-xs)',
  background: 'var(--mantine-color-body)',
  color: 'var(--mantine-color-dimmed)',
  fontFamily: 'var(--mantine-font-family)',
  fontSize: 'var(--mantine-font-size-xs)',
  fontWeight: 400,
  opacity: 0,
  pointerEvents: 'auto',
});
globalStyle(`${block} .tools .tools-button-group`, {
  position: 'absolute',
  top: 6,
  right: 8,
  zIndex: 2,
  pointerEvents: 'auto',
});
globalStyle(buttons, {
  minWidth: 28,
  height: 28,
  padding: 6,
  borderRadius: 'var(--mantine-radius-xs)',
  background: 'var(--mantine-color-gray-0)',
  color: 'var(--mantine-color-gray-6)',
});
globalStyle(`${block} .tools .tools-button-group .copy-button`, {
  // Keep the localized accessible name while showing only the copy icon.
  fontSize: 0,
  gap: 0,
  borderRadius: 'var(--mantine-radius-xs)',
});
globalStyle(`${block} .tools .tools-button-group button:hover`, {
  background: 'var(--mantine-color-gray-2)',
  color: 'var(--mantine-color-gray-8)',
});
globalStyle(`${block}:hover .language-button, ${block}:focus-within .language-button, ${block} .language-button[data-expanded="true"], ${block}:focus-within .tools-button-group button`, {
  opacity: 1,
});
globalStyle(`${language}:focus-visible, ${buttons}:focus-visible`, {
  outline: '2px solid var(--mantine-primary-color-filled)',
  outlineOffset: 2,
});
globalStyle(`${language}, ${buttons}`, {
  '@media': {
    '(hover: none), (pointer: coarse)': { opacity: 1, minHeight: 32, minWidth: 32 },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});


// Cursor position never paints a row; only explicit fence metadata does.
globalStyle(`${block} .cm-activeLine`, { backgroundColor: 'transparent' });
globalStyle(`${block} .cm-line.madoc-code-highlight`, {
  backgroundColor: 'var(--mantine-primary-color-light)',
  boxShadow: 'inset 2px 0 var(--mantine-primary-color-filled)',
});
