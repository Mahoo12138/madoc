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
globalStyle('.milkdown .ProseMirror pre', { borderRadius: '10px', overflowX: 'auto' });
globalStyle('.milkdown .ProseMirror img', { maxWidth: '100%', borderRadius: '8px' });
