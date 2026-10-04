import { globalStyle, style } from '@vanilla-extract/css';

export const dropdown = style({
  maxWidth: 'calc(100vw - 24px)',
  padding: 6,
  borderColor: 'var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-md)',
  boxShadow: 'var(--mantine-shadow-md)',
});

export const search = style({
  width: '100%',
  margin: 0,
  marginBottom: 6,
  borderRadius: 'var(--mantine-radius-sm)',
  border: '1px solid var(--mantine-color-default-border)',
  fontSize: 'var(--mantine-font-size-sm)',
});

export const options = style({
  maxHeight: 'min(280px, 40dvh)',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
});

export const option = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  minHeight: 32,
  padding: '6px 10px',
  borderRadius: 'var(--mantine-radius-sm)',
  fontSize: 'var(--mantine-font-size-sm)',
  fontWeight: 400,
});

export const languageLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const check = style({
  flexShrink: 0,
  color: 'var(--mantine-primary-color-filled)',
});

globalStyle(`${option}[data-checked]`, {
  background: 'var(--mantine-primary-color-light)',
  color: 'var(--mantine-primary-color-light-color)',
});
