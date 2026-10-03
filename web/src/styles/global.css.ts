import { globalStyle } from '@vanilla-extract/css';
import { touchControls } from './interaction.css';

globalStyle('html, body, #root', { minHeight: '100%', margin: 0 });
globalStyle('body', {
  background: 'var(--mantine-color-gray-0)',
  color: 'var(--mantine-color-text)',
  fontFamily: 'var(--mantine-font-family)',
  letterSpacing: 0,
  WebkitFontSmoothing: 'antialiased',
});
globalStyle('*', { boxSizing: 'border-box' });
globalStyle('button, input, textarea', { font: 'inherit' });
globalStyle('a', { color: 'inherit', textDecoration: 'none' });
globalStyle('button, a, input, textarea, select', {
  transition:
    'background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease',
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});
globalStyle('button:focus-visible, a:focus-visible', {
  outline: '2px solid var(--mantine-primary-color-filled)',
  outlineOffset: 2,
});
globalStyle('.mantine-Button-root', {
  fontWeight: 600,
  '@media': { [touchControls]: { minHeight: 44 } },
});
globalStyle('.mantine-ActionIcon-root, .mantine-CloseButton-root', {
  '@media': { [touchControls]: { minWidth: 44, minHeight: 44 } },
});
globalStyle('.mantine-Menu-dropdown, .mantine-Popover-dropdown', {
  boxShadow:
    '0 4px 16px color-mix(in srgb, var(--mantine-color-gray-9) 8%, transparent)',
});
