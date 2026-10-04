import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  height: 'calc(100dvh - 58px)',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const toolbar = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '4px 16px',
  padding: '6px 16px',
  flexShrink: 0,
  borderBottom: '1px solid var(--mantine-color-default-border)',
  background: 'var(--mantine-color-body)',
  '@media': { '(max-width: 600px)': { padding: '4px 12px', gap: 0 } },
});
export const status = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  minHeight: 32,
  fontSize: 'var(--mantine-font-size-xs)',
  color: 'var(--mantine-color-dimmed)',
  fontVariantNumeric: 'tabular-nums',
});
export const actions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  '@media': {
    '(max-width: 600px)': { width: '100%', justifyContent: 'space-between' },
  },
});
export const action = style({
  '@media': { '(max-width: 600px)': { height: 44, paddingInline: 10 } },
});
export const canvas = style({ position: 'relative', flex: 1, minHeight: 0 });
export const failure = style({ margin: '8px 16px', flexShrink: 0 });
export const settings = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 18,
});
export const setting = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});
export const swatches = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, 1fr)',
  gap: 8,
  '@media': { '(max-width: 600px)': { gridTemplateColumns: 'repeat(3, 1fr)' } },
});
export const swatch = style({
  width: 34,
  height: 34,
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-sm)',
  cursor: 'pointer',
  selectors: {
    '&[aria-pressed="true"]': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: 2,
    },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: 2,
    },
  },
  '@media': { '(max-width: 600px)': { width: '100%', height: 44 } },
});
export const searchResults = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});
export const searchResult = style({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-text)',
  fontSize: 'var(--mantine-font-size-sm)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  selectors: {
    '&:hover': { background: 'var(--mantine-color-default-hover)' },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
    },
  },
});

// An empty MainMenu suppresses the fallback but still renders a trigger.
// Keep this public-component adapter override scoped to the whiteboard.
globalStyle(`${canvas} .excalidraw .main-menu-trigger`, { display: 'none' });
globalStyle(`${canvas} .excalidraw .help-icon`, { display: 'none' });
globalStyle(`${canvas} .excalidraw`, {
  vars: {
    '--ui-font': 'var(--mantine-font-family)',
    '--color-primary': 'var(--mantine-primary-color-filled)',
    '--color-primary-darker': 'var(--mantine-color-blue-7)',
    '--color-primary-darkest': 'var(--mantine-color-blue-8)',
    '--color-brand-hover': 'var(--mantine-color-blue-7)',
    '--color-brand-active': 'var(--mantine-color-blue-8)',
    '--focus-highlight-color': 'var(--mantine-primary-color-filled)',
    '--color-surface-primary-container': 'var(--mantine-color-blue-0)',
    '--color-on-primary-container': 'var(--mantine-color-blue-7)',
    '--border-radius-lg': 'var(--mantine-radius-sm)',
  },
});
globalStyle(`${canvas} .excalidraw:not(.theme--dark)`, {
  vars: {
    '--button-gray-1': 'var(--mantine-color-gray-0)',
    '--button-gray-2': 'var(--mantine-color-gray-1)',
    '--button-gray-3': 'var(--mantine-color-gray-2)',
    '--button-hover-bg': 'var(--mantine-color-gray-1)',
    '--island-bg-color': 'var(--mantine-color-body)',
    '--default-border-color': 'var(--mantine-color-default-border)',
  },
});
globalStyle(`${canvas} .excalidraw.theme--dark`, {
  vars: {
    '--color-surface-primary-container': 'var(--mantine-color-blue-9)',
    '--color-on-primary-container': 'var(--mantine-color-blue-1)',
  },
});
