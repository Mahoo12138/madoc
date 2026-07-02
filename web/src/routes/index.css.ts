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
  flexShrink: 0,
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
  position: 'relative',
});

export const dropdown = style({
  position: 'absolute',
  top: '40px',
  right: 0,
  backgroundColor: '#fff',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: '8px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
  padding: '4px 0',
  zIndex: 100,
  minWidth: '180px',
});

export const dropdownEmail = style({
  padding: '8px 16px',
  fontSize: '13px',
  color: '#777',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  wordBreak: 'break-all',
});

export const dropdownSignOut = style({
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '8px 16px',
  fontSize: '13px',
  color: '#e68080',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'rgba(230,128,128,0.08)',
  },
});

export const content = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '48px 24px',
});

export const contentInner = style({
  maxWidth: '600px',
  width: '100%',
});

export const contentHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '32px',
});

export const contentTitle = style({
  fontSize: '24px',
  fontWeight: 700,
  color: '#1a1a2e',
});

export const workspaceList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const workspaceCard = style({
  display: 'flex',
  alignItems: 'center',
  gap: '16px',
  padding: '16px 20px',
  borderRadius: '12px',
  border: '1px solid rgba(0,0,0,0.08)',
  backgroundColor: '#fff',
  cursor: 'pointer',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  ':hover': {
    borderColor: 'rgba(30,150,235,0.4)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
});

export const workspaceIcon = style({
  width: '40px',
  height: '40px',
  borderRadius: '10px',
  backgroundColor: '#f0f3ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '18px',
  fontWeight: 700,
  color: '#1e96eb',
  flexShrink: 0,
});

export const workspaceInfo = style({
  flex: 1,
  minWidth: 0,
});

export const workspaceName = style({
  fontSize: '15px',
  fontWeight: 600,
  color: '#1a1a2e',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const workspaceMeta = style({
  fontSize: '12px',
  color: '#999',
  marginTop: '2px',
});

export const emptyState = style({
  textAlign: 'center',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '16px',
  padding: '80px 0',
});

export const emptyTitle = style({
  fontSize: '20px',
  fontWeight: 700,
  color: '#1a1a2e',
});

export const emptySubtitle = style({
  fontSize: '14px',
  color: '#777',
  lineHeight: '22px',
  maxWidth: '400px',
});

export const loadingText = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '200px',
  color: '#999',
  fontSize: '14px',
});

// Modal
export const modalOverlay = style({
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.3)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
});

export const modal = style({
  backgroundColor: '#fff',
  borderRadius: '12px',
  padding: '24px',
  width: '400px',
  maxWidth: '90vw',
  boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
});

export const modalTitle = style({
  fontSize: '18px',
  fontWeight: 700,
  color: '#1a1a2e',
  marginBottom: '16px',
});

export const modalInput = style({
  width: '100%',
  height: '40px',
  padding: '0 12px',
  border: '1px solid rgba(0,0,0,0.1)',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  outline: 'none',
  boxSizing: 'border-box',
  ':focus': {
    borderColor: '#1e96eb',
    boxShadow: '0px 0px 0px 2px rgba(30,150,235,0.2)',
  },
});

export const modalActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '20px',
});

export const buttonGhost = style({
  height: '36px',
  padding: '0 16px',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  backgroundColor: 'transparent',
  color: '#777',
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});
