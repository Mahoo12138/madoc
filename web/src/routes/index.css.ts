import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '100vh',
  backgroundColor: '#fff',
  backgroundImage: `radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)`,
  backgroundSize: '24px 24px',
});

export const nav = style({
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
});

export const navLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '18px',
  fontWeight: 600,
  color: '#2b2b2b',
});

export const navRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
});

export const navAvatar = style({
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  backgroundColor: '#1e96eb',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
});

export const content = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
});

export const welcomeCard = style({
  maxWidth: '480px',
  width: '100%',
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
});

export const welcomeTitle = style({
  fontSize: '28px',
  fontWeight: 700,
  color: '#1a1a2e',
});

export const welcomeSubtitle = style({
  fontSize: '14px',
  color: '#777',
  lineHeight: '22px',
});

export const createButton = style({
  marginTop: '8px',
});

export const loadingContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  color: '#999',
  fontSize: '14px',
});

