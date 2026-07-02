import { style } from '@vanilla-extract/css';

// Layout
export const layout = style({
  display: 'flex',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: '#f8f9fa',
});

// Sidebar
export const sidebar = style({
  width: '256px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(0,0,0,0.06)',
  backgroundColor: '#fff',
});

export const sidebarHeader = style({
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 16px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  flexShrink: 0,
});

export const sidebarHeaderTitle = style({
  fontSize: '15px',
  fontWeight: 600,
  color: '#2b2b2b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const sidebarNav = style({
  flex: 1,
  overflowY: 'auto',
  padding: '8px',
});

export const navItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#555',
  cursor: 'pointer',
  textDecoration: 'none',
  transition: 'background 0.15s',
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});

export const navItemActive = style({
  backgroundColor: 'rgba(30,150,235,0.08)',
  color: '#1e96eb',
});

export const navSectionLabel = style({
  padding: '16px 12px 4px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#999',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
});

export const sidebarFooter = style({
  padding: '8px',
  borderTop: '1px solid rgba(0,0,0,0.06)',
  flexShrink: 0,
});

export const userInfo = style({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 12px',
  borderRadius: '8px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
});

export const avatar = style({
  width: '28px',
  height: '28px',
  borderRadius: '50%',
  backgroundColor: '#1e96eb',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 600,
  flexShrink: 0,
});

export const userName = style({
  fontSize: '13px',
  fontWeight: 600,
  color: '#2b2b2b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const userEmail = style({
  fontSize: '11px',
  color: '#999',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

// Main area
export const main = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
});

export const mainHeader = style({
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 24px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  backgroundColor: '#fff',
  flexShrink: 0,
});

export const mainHeaderTitle = style({
  fontSize: '15px',
  fontWeight: 600,
  color: '#2b2b2b',
});

export const mainContent = style({
  flex: 1,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
});

export const emptyIcon = style({
  width: '64px',
  height: '64px',
  borderRadius: '16px',
  backgroundColor: '#f0f3ff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '16px',
});

export const emptyTitle = style({
  fontSize: '20px',
  fontWeight: 700,
  color: '#1a1a2e',
  marginBottom: '8px',
});

export const emptySubtitle = style({
  fontSize: '14px',
  color: '#777',
  lineHeight: '22px',
  textAlign: 'center',
  maxWidth: '400px',
  marginBottom: '24px',
});

export const loadingContainer = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#999',
  fontSize: '14px',
});

// Back link
export const backLink = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '13px',
  color: '#777',
  cursor: 'pointer',
  textDecoration: 'none',
  ':hover': {
    color: '#2b2b2b',
  },
});
