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
