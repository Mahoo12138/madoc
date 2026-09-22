import { globalStyle } from '@vanilla-extract/css';

const math = '.milkdown .ProseMirror .milkdown-code-block.madoc-block-math';

globalStyle(math, {
  padding: 0, margin: '16px 0', background: 'var(--mantine-color-body)',
  borderColor: 'transparent', borderRadius: 'var(--mantine-radius-xs)',
});
globalStyle(`${math}[data-editing="true"]`, { borderColor: 'var(--mantine-color-gray-3)' });
globalStyle(`${math}:focus-visible`, { outline: '2px solid var(--mantine-primary-color-filled)' });
globalStyle(`${math} .cm-gutters, ${math} .language-button, ${math} .language-picker, ${math} .copy-button, ${math} .preview-label, ${math} .preview-divider`, {
  display: 'none',
});
globalStyle(`${math}[data-editing="false"] .codemirror-host, ${math}[data-editing="false"] .tools`, { display: 'none' });
globalStyle(`${math} .cm-editor`, {
  background: 'var(--mantine-color-gray-0)', padding: '4px 10px',
  color: 'var(--mantine-color-text)', fontSize: '13px',
});
globalStyle(`${math} .cm-editor::before, ${math} .cm-editor::after`, {
  content: '"$$"', display: 'block', color: 'var(--mantine-color-dimmed)',
  fontFamily: 'var(--crepe-font-code)', lineHeight: '20px', pointerEvents: 'none',
});
globalStyle(`${math} .cm-content`, { padding: '2px 0', minWidth: 0 });
globalStyle(`${math} .cm-line`, { padding: 0, lineHeight: '1.75' });
globalStyle(`${math} .cm-scroller`, { overflowX: 'auto' });
globalStyle(`${math} .tools .tools-button-group`, { top: 0, right: 0 });
globalStyle(`${math} .tools .tools-button-group .preview-toggle-button`, {
  opacity: 1, height: 22, minHeight: 22, padding: '2px 10px',
  fontSize: '12px', fontWeight: 400, borderRadius: 0,
  color: 'var(--mantine-color-gray-6)', background: 'var(--mantine-color-gray-0)',
});
globalStyle(`${math} .preview-panel`, {
  background: 'var(--mantine-color-body)', padding: '14px 16px', minHeight: 64,
});
globalStyle(`${math}[data-editing="true"] .preview-panel`, { borderTop: '1px solid var(--mantine-color-gray-2)' });
globalStyle(`${math} .preview`, { cursor: 'text' });
globalStyle(`${math} .katex-display`, { margin: '6px 0' });
