import { style } from '@vanilla-extract/css';

const textPrimary = '#242424';
const textSecondary = '#6f6f6f';
const textTertiary = '#9b9b9b';
const accent = '#1e96eb';

export const root = style({
  position: 'relative',
  flex: 1,
  width: 0,
  minWidth: 0,
});

export const trigger = style({
  width: '100%',
  minHeight: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textPrimary,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const avatar = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: '0.5px solid rgba(31, 35, 40, 0.12)',
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  color: accent,
  fontSize: '16px',
});

export const triggerText = style({
  minWidth: 0,
  flex: 1,
});

export const triggerTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textPrimary,
  fontSize: '14px',
  fontWeight: 650,
  lineHeight: '18px',
});

export const triggerMeta = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
});

export const chevron = style({
  width: '16px',
  height: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: textSecondary,
  fontSize: '14px',
});

export const popover = style({
  position: 'absolute',
  top: '38px',
  left: 0,
  zIndex: 70,
  width: '288px',
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: 'min(680px, calc(100vh - 96px))',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  border: '1px solid rgba(31, 35, 40, 0.1)',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  boxShadow: '0 6px 12px rgba(31, 35, 40, 0.12)',
});

export const account = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px',
  borderBottom: '1px solid rgba(31, 35, 40, 0.08)',
});

export const accountAvatar = style({
  width: '30px',
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: '50%',
  backgroundColor: '#2f7dd3',
  color: '#ffffff',
  fontSize: '12px',
  fontWeight: 700,
});

export const accountText = style({
  minWidth: 0,
  flex: 1,
});

export const accountName = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textPrimary,
  fontSize: '13px',
  fontWeight: 650,
  lineHeight: '18px',
});

export const accountEmail = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textSecondary,
  fontSize: '12px',
  lineHeight: '16px',
});

export const list = style({
  minHeight: 0,
  overflowY: 'auto',
  padding: '6px',
});

export const item = style({
  width: '100%',
  minHeight: '38px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px',
  border: 'none',
  borderRadius: '4px',
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

export const itemActive = style({
  backgroundColor: 'rgba(30, 150, 235, 0.08)',
});

export const itemText = style({
  minWidth: 0,
  flex: 1,
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

export const activeIcon = style({
  width: '20px',
  height: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: accent,
  fontSize: '15px',
});

export const empty = style({
  padding: '24px 16px',
  color: textSecondary,
  fontSize: '13px',
  lineHeight: '20px',
  textAlign: 'center',
});

export const footer = style({
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '6px',
  borderTop: '1px solid rgba(31, 35, 40, 0.08)',
});

export const action = style({
  width: '100%',
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '8px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textPrimary,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 560,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    color: textTertiary,
    cursor: 'not-allowed',
  },
});

export const dangerAction = style({
  color: '#b42318',
  ':hover': {
    backgroundColor: 'rgba(180, 35, 24, 0.08)',
  },
});

export const actionIcon = style({
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});
