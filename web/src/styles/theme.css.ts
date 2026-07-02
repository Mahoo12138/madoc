import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  fontSize: '14px',
  position: 'relative',
  backgroundColor: '#fff',
  backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)`,
  backgroundSize: '24px 24px',
});

export const topNav = style({
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  position: 'fixed',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 120px',
  zIndex: 100,
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '16px 20px',
    },
  },
});

export const affineLogo = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  textDecoration: 'none',
  fontSize: '18px',
  fontWeight: 600,
  color: '#2b2b2b',
});

export const hideInSmallScreen = style({
  '@media': {
    'screen and (max-width: 1024px)': {
      display: 'none',
    },
  },
});

// Background arts
export const artsWrapper = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  pointerEvents: 'none',
  zIndex: 0,
});

export const arts = style({
  position: 'absolute',
  top: '128px',
  pointerEvents: 'none',
});

// SignInPageContainer
export const signInPageContainer = style({
  height: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
  zIndex: 1,
});

// Auth components
export const authContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  minHeight: '422px',
});

export const authHeaderWrapper = style({
  marginBottom: '20px',
});

globalStyle(`${authHeaderWrapper} > p:first-of-type`, {
  fontSize: '16px',
  fontWeight: 600,
  marginBottom: '4px',
  lineHeight: '28px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

globalStyle(`${authHeaderWrapper} > p:last-of-type`, {
  fontSize: '18px',
  fontWeight: 600,
  lineHeight: '28px',
});

export const authContent = style({
  fontSize: '14px',
  lineHeight: '30px',
  flexGrow: 1,
});

globalStyle(`${authContent} > *:not(:last-child)`, {
  marginBottom: '20px',
});

export const authFooter = style({});

globalStyle(`${authFooter} > *:not(:last-child)`, {
  marginBottom: '20px',
});

// AuthInput
export const authInputWrapper = style({
  position: 'relative',
  selectors: {
    '&.with-hint': {
      marginBottom: '8px',
    },
  },
});

globalStyle(`${authInputWrapper} label`, {
  display: 'block',
  color: '#777',
  marginBottom: '4px',
  fontSize: '13px',
  fontWeight: 600,
  lineHeight: '22px',
});

export const authInputError = style({
  color: '#e68080',
  fontSize: '12px',
  lineHeight: '20px',
  minHeight: '20px',
});

globalStyle(`${authContent} a`, {
  color: '#1e96eb',
});

// Input
export const inputWrapper = style({
  width: '100%',
  height: '28px',
  lineHeight: '22px',
  gap: '10px',
  color: '#2b2b2b',
  border: '1px solid',
  borderColor: 'rgba(0,0,0,0.1)',
  backgroundColor: '#fff',
  borderRadius: '8px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '14px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  selectors: {
    '&.extra-large': {
      height: '40px',
      fontWeight: 600,
    },
    '&.error': {
      borderColor: '#e68080',
    },
    '&.default:is(:focus-within, :focus, :focus-visible)': {
      borderColor: '#1e96eb',
      outline: 'none',
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30)',
    },
  },
});

export const input = style({
  height: '100%',
  width: '0',
  flex: 1,
  boxSizing: 'border-box',
  padding: '0 12px',
  WebkitAppearance: 'none',
  WebkitTapHighlightColor: 'transparent',
  outline: 'none',
  border: 'none',
  background: 'transparent',
  selectors: {
    '&::placeholder': {
      color: '#999',
    },
    '&:-webkit-autofill': {
      WebkitBoxShadow: '0 0 0 1000px #fff inset',
    },
  },
});

// Button
export const buttonBase = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  borderRadius: '8px',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 600,
  border: 'none',
  transition: 'background 0.2s, opacity 0.2s',
  userSelect: 'none',
  selectors: {
    '&:disabled': {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
  },
});

export const buttonPrimary = style({
  backgroundColor: '#1e96eb',
  color: '#fff',
  selectors: {
    '&:hover:not(:disabled)': {
      backgroundColor: '#1a85d4',
    },
  },
});

export const buttonExtraLarge = style({
  height: '40px',
  width: '100%',
});

// Back button
export const backButton = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: '#777',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'none',
  border: 'none',
  padding: 0,
  selectors: {
    '&:hover': {
      color: '#2b2b2b',
    },
  },
});

// Error message
export const errorMessage = style({
  color: '#e68080',
  fontSize: '12px',
  lineHeight: '20px',
});
