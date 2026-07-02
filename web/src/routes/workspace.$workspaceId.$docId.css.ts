import { style } from '@vanilla-extract/css';

export const editorLayout = style({
  display: 'flex',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: '#f8f9fa',
});

export const editorSidebar = style({
  width: '256px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(0,0,0,0.06)',
  backgroundColor: '#fff',
});

export const editorSidebarHeader = style({
  height: '52px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 16px',
  borderBottom: '1px solid rgba(0,0,0,0.06)',
  flexShrink: 0,
});

export const editorBackLink = style({
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

export const editorSidebarTitle = style({
  fontSize: '15px',
  fontWeight: 600,
  color: '#2b2b2b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});

export const editorMain = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: '#fff',
});

export const editorContainer = style({
  flex: 1,
  overflow: 'auto',
});

export const editorLoading = style({
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#999',
  fontSize: '14px',
});

export const editorError = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#e68080',
  fontSize: '14px',
  gap: '8px',
});
