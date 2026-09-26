import { style } from '@vanilla-extract/css';

export const page = style({
  minHeight: '100vh',
  padding: '36px clamp(20px, 5vw, 72px)',
});
export const header = style({
  maxWidth: 1040,
  margin: '0 auto 34px',
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
});
export const grid = style({
  maxWidth: 1040,
  margin: '0 auto',
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
  gap: 16,
});
export const workspaceName = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: 'anywhere',
});
export const chevron = style({
  flexShrink: 0,
  color: 'var(--mantine-color-dimmed)',
});
export const workspaceCard = style({
  minWidth: 0,
  cursor: 'pointer',
  transition: 'transform 140ms ease, box-shadow 140ms ease',
  selectors: {
    '&:hover': {
      transform: 'translateY(-2px)',
      boxShadow: 'var(--mantine-shadow-md)',
    },
    '&:focus-visible': {
      outline: '2px solid var(--mantine-primary-color-filled)',
      outlineOffset: 2,
    },
  },
  '@media': { '(prefers-reduced-motion: reduce)': { transition: 'none' } },
});
