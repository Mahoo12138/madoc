import { style } from '@vanilla-extract/css';
export const trigger = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  width: '100%',
  padding: '10px 8px',
  borderRadius: 'var(--mantine-radius-md)',
  color: 'var(--mantine-color-text)',
  selectors: { '&:hover': { background: 'var(--mantine-color-gray-1)' } },
});
export const identity = style({ minWidth: 0, flex: 1, textAlign: 'left' });
export const layout = style({
  display: 'grid',
  gridTemplateColumns: '170px minmax(0,1fr)',
  height: 'min(580px, 72dvh)',
  gap: 28,
  '@media': {
    '(max-width: 760px)': {
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100dvh - 100px)',
      gap: 20,
    },
  },
});
export const navigation = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  paddingRight: 16,
  borderRight: '1px solid var(--mantine-color-gray-2)',
  '@media': { '(max-width: 760px)': { display: 'none' } },
});
export const mobileNavigation = style({
  display: 'none',
  '@media': { '(max-width: 760px)': { display: 'block' } },
});
export const content = style({
  minWidth: 0,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  paddingRight: 8,
  paddingBottom: 16,
});
export const profile = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
});
export const avatarRow = style({
  display: 'flex',
  gap: 20,
  alignItems: 'center',
});
export const actions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 8,
});
export const preferenceRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 20,
});
export const control = style({
  width: 150,
  flexShrink: 0,
  '@media': { '(max-width: 760px)': { width: 145 } },
});
export const preview = style({
  padding: 16,
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-md)',
  color: 'var(--mantine-color-text)',
  overflow: 'hidden',
});
export const codePreview = style({
  fontFamily: 'monospace',
  fontSize: 13,
  lineHeight: 1.6,
  display: 'flex',
  gap: 16,
});

export const switchBody = style({
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 20,
});
export const switchLabel = style({ flex: 1 });

export const modalContent = style({
  vars: { '--mantine-color-dimmed': 'var(--mantine-color-gray-7)' },
});
export const inactiveNavigation = style({
  color: 'var(--mantine-color-gray-7)',
});
