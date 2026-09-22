import { globalStyle } from '@vanilla-extract/css';

const block = '.milkdown .ProseMirror .milkdown-code-block';
const language = `${block} .tools .language-button`;
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
  color: 'var(--mantine-color-gray-7)',
  fontWeight: 500,
});
globalStyle(`${block} .tools`, {
  position: 'absolute',
  inset: 0,
  minHeight: 0,
  display: 'block',
  pointerEvents: 'none',
});
globalStyle(language, {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  right: 0,
  minWidth: 120,
  maxWidth: '100%',
  height: 28,
  margin: 0,
  padding: '4px 8px',
  justifyContent: 'space-between',
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-xs)',
  background: 'var(--mantine-color-body)',
  color: 'var(--mantine-color-gray-7)',
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
globalStyle(`${block} .language-picker`, {
  // Crepe positions bottom-start with inline styles. Anchor this existing menu
  // to the external trigger's right edge, including after a viewport resize.
  top: 'calc(100% + 32px) !important',
  left: 'auto !important',
  right: 0,
  paddingTop: 4,
  pointerEvents: 'auto',
  maxWidth: 'min(100%, calc(100vw - 32px))',
});
globalStyle(`${block} .language-picker .list-wrapper`, {
  width: 240,
  maxWidth: '100%',
  borderRadius: 'var(--mantine-radius-md)',
  boxShadow: 'var(--mantine-shadow-md)',
  background: 'var(--mantine-color-body)',
});
globalStyle(`${block} .language-list`, {
  height: 'auto',
  maxHeight: 'min(280px, 40dvh)',
  paddingBottom: 8,
});
globalStyle(`${language}, ${buttons}`, {
  '@media': {
    '(hover: none), (pointer: coarse)': { opacity: 1, minHeight: 32, minWidth: 32 },
    '(prefers-reduced-motion: reduce)': { transition: 'none' },
  },
});
