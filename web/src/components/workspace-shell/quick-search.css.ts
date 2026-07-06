import { style } from '@vanilla-extract/css';

const textPrimary = '#242424';
const textSecondary = '#6f6f6f';
const textTertiary = '#9b9b9b';
const accent = '#1e96eb';

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 80,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '92px 16px 24px',
  backgroundColor: 'rgba(31, 35, 40, 0.18)',
});

export const panel = style({
  width: 'min(640px, 100%)',
  maxHeight: 'min(560px, calc(100vh - 124px))',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: '1px solid rgba(31, 35, 40, 0.1)',
  borderRadius: '10px',
  backgroundColor: '#ffffff',
  boxShadow: '0 8px 12px rgba(31, 35, 40, 0.12)',
});

export const field = style({
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 14px',
  borderBottom: '1px solid rgba(31, 35, 40, 0.08)',
  color: textTertiary,
});

export const fieldIcon = style({
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const input = style({
  minWidth: 0,
  flex: 1,
  height: '100%',
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: textPrimary,
  fontFamily: 'inherit',
  fontSize: '15px',
  fontWeight: 520,
  '::placeholder': {
    color: textTertiary,
    fontWeight: 450,
  },
});

export const body = style({
  minHeight: 0,
  overflowY: 'auto',
  padding: '8px',
});

export const sectionTitle = style({
  padding: '8px 8px 6px',
  color: textTertiary,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: 0,
  textTransform: 'uppercase',
});

export const item = style({
  width: '100%',
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const itemIcon = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: '6px',
  backgroundColor: 'rgba(30, 150, 235, 0.1)',
  color: accent,
});

export const itemMain = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const itemTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textPrimary,
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: '18px',
});

export const itemMeta = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textSecondary,
  fontSize: '12px',
  lineHeight: '16px',
});

export const empty = style({
  minHeight: '160px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '10px',
  padding: '24px',
  color: textSecondary,
  textAlign: 'center',
});

export const emptyTitle = style({
  color: textPrimary,
  fontSize: '14px',
  fontWeight: 650,
});

export const emptyMeta = style({
  maxWidth: '320px',
  color: textSecondary,
  fontSize: '13px',
  lineHeight: '20px',
});

export const createButton = style({
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 12px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: accent,
  color: '#ffffff',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 650,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: '#1688d8',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    opacity: 0.56,
    cursor: 'not-allowed',
  },
});
