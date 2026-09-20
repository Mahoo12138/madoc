import { globalStyle } from '@vanilla-extract/css';

globalStyle('html, body, #root', { minHeight: '100%', margin: 0 });
globalStyle('body', {
  background: 'var(--mantine-color-gray-0)',
  color: 'var(--mantine-color-dark-8)',
  fontFamily: 'var(--mantine-font-family)',
  WebkitFontSmoothing: 'antialiased',
});
globalStyle('*', { boxSizing: 'border-box' });
globalStyle('button, input, textarea', { font: 'inherit' });
globalStyle('a', { color: 'inherit', textDecoration: 'none' });
globalStyle('.milkdown', { minHeight: '60vh' });
globalStyle('.milkdown .ProseMirror', {
  outline: 'none',
  padding: '18px 0 120px',
  color: 'var(--mantine-color-dark-8)',
  fontSize: '16px',
  lineHeight: '1.75',
});
globalStyle('.milkdown .ProseMirror h1', { fontSize: '32px', lineHeight: '1.2', letterSpacing: '-0.025em' });
globalStyle('.milkdown .ProseMirror h2', { fontSize: '24px', lineHeight: '1.3', letterSpacing: '-0.018em' });
globalStyle('.milkdown .ProseMirror h3', { fontSize: '20px', lineHeight: '1.4', letterSpacing: '-0.012em' });
globalStyle('.milkdown .ProseMirror h4', { fontSize: '18px', lineHeight: '1.45', letterSpacing: '-0.008em' });
globalStyle('.milkdown .ProseMirror h5', { fontSize: '16px', lineHeight: '1.5' });
globalStyle('.milkdown .ProseMirror h6', { fontSize: '14px', lineHeight: '1.5' });
globalStyle('.milkdown .ProseMirror pre', { borderRadius: '10px', overflowX: 'auto' });
globalStyle('.milkdown .ProseMirror img', { maxWidth: '100%', borderRadius: '8px' });
globalStyle('.milkdown .ProseMirror .madoc-active-mark::before, .milkdown .ProseMirror .madoc-active-mark::after', {
  color: 'var(--mantine-color-gray-6)',
  fontFamily: 'var(--mantine-font-family)',
  fontSize: '0.85em',
  fontStyle: 'normal',
  fontWeight: 400,
  opacity: 0.8,
  marginInline: '2px',
});
globalStyle('.milkdown .ProseMirror .madoc-active-mark[data-mark-name="strong"]::before, .milkdown .ProseMirror .madoc-active-mark[data-mark-name="strong"]::after', { content: '"**"' });
globalStyle('.milkdown .ProseMirror .madoc-active-mark[data-mark-name="em"]::before, .milkdown .ProseMirror .madoc-active-mark[data-mark-name="em"]::after', { content: '"*"' });
globalStyle('.milkdown .ProseMirror .milkdown-code-block .tools', { minHeight: '28px' });
globalStyle('.milkdown .ProseMirror .milkdown-code-block .language-button', { opacity: 0, transition: 'opacity 0.2s ease-in-out' });
globalStyle('.milkdown .ProseMirror .milkdown-code-block:hover .language-button', { opacity: 1 });
globalStyle('.milkdown .ProseMirror .madoc-remote-cursor', {
  display: 'inline-block',
  position: 'relative',
  width: 0,
  height: '1.35em',
  marginLeft: -1,
  borderLeft: '2px solid var(--madoc-remote-color, var(--mantine-primary-color-filled))',
  verticalAlign: 'text-bottom',
  pointerEvents: 'none',
  zIndex: 1,
});
globalStyle('.milkdown .ProseMirror .madoc-remote-cursor-label', {
  position: 'absolute',
  top: '-1.65em',
  left: -1,
  display: 'block',
  padding: '2px 5px',
  border: '1px solid var(--madoc-remote-color, var(--mantine-primary-color-filled))',
  borderRadius: '4px',
  background: 'var(--mantine-color-dark-7)',
  color: 'var(--mantine-color-white)',
  fontFamily: 'var(--mantine-font-family)',
  fontSize: '10px',
  fontWeight: 600,
  lineHeight: 1.2,
  whiteSpace: 'nowrap',
  pointerEvents: 'none',
});
globalStyle('.milkdown .ProseMirror .madoc-remote-selection', {
  background: 'color-mix(in srgb, var(--madoc-remote-color, var(--mantine-primary-color-filled)), transparent 88%)',
  borderBottom: '2px solid color-mix(in srgb, var(--madoc-remote-color, var(--mantine-primary-color-filled)), transparent 55%)',
});
