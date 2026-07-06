import { globalStyle, style } from '@vanilla-extract/css';

const border = '1px solid rgba(31, 35, 40, 0.08)';
const textPrimary = '#242424';
const textSecondary = '#6f6f6f';
const textTertiary = '#9b9b9b';
const accent = '#1e96eb';

export const layout = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  color: textPrimary,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

export const appTabsHeader = style({
  height: '48px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
  backgroundColor: '#ffffff',
  borderBottom: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const appTabsLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
});

export const appTabsCenter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '8px',
  flex: 1,
  height: '100%',
  minWidth: 0,
  overflow: 'hidden',
});

export const appTabsRight = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  minWidth: 0,
});

export const appHeaderButton = style({
  width: '32px',
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: '#121212',
  fontFamily: 'inherit',
  fontSize: '16px',
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    opacity: 0.42,
    cursor: 'default',
  },
});

export const appTab = style({
  width: '200px',
  maxWidth: 'min(200px, 34vw)',
  minWidth: '44px',
  height: '26px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '6px',
  padding: '0 8px',
  borderRadius: '4px',
  border: 'none',
  backgroundColor: 'rgba(31, 35, 40, 0.045)',
  color: textSecondary,
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: 540,
  lineHeight: '16px',
  cursor: 'pointer',
  position: 'relative',
  transition: 'background-color 0.16s, box-shadow 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.075)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const appTabActive = style({
  backgroundColor: '#ffffff',
  color: textPrimary,
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.12)',
});

export const appTabAdd = style({
  width: '26px',
  height: '26px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '16px',
  lineHeight: 1,
  transition: 'background-color 0.16s, color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    opacity: 0.42,
    cursor: 'not-allowed',
  },
});

export const appTabIcon = style({
  width: '16px',
  height: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'inherit',
  fontSize: '16px',
  fontWeight: 760,
});

export const appTabLabel = style({
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const appTabClose = style({
  width: '18px',
  height: '18px',
  marginRight: '-3px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontSize: '16px',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.08)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const appMeta = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: textTertiary,
  fontSize: '12px',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const appViewMain = style({
  flex: 1,
  minHeight: 0,
  width: '100%',
  display: 'flex',
  flexFlow: 'row',
  position: 'relative',
});

export const sidebar = style({
  width: '248px',
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#ffffff',
  '@media': {
    '(max-width: 760px)': {
      width: '72px',
    },
  },
});

export const sidebarClosed = style({
  display: 'none',
});

export const sidebarHeader = style({
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px',
  flexShrink: 0,
});

export const sidebarWorkspaceBar = style({
  flex: 1,
  width: 0,
  minHeight: '32px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px',
  borderRadius: '4px',
  transition: 'background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
});

export const sidebarUserButton = style({
  width: '30px',
  height: '30px',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  transition: 'background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const backLink = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '4px',
  color: textSecondary,
  cursor: 'pointer',
  textDecoration: 'none',
  fontSize: '16px',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const workspaceMark = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  border,
  color: accent,
  fontSize: '18px',
  fontWeight: 760,
});

export const sidebarHeaderText = style({
  minWidth: 0,
  flex: 1,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const sidebarHeaderTitle = style({
  fontSize: '14px',
  fontWeight: 650,
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sidebarHeaderMeta = style({
  fontSize: '11px',
  lineHeight: '15px',
  color: textTertiary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const sidebarNav = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const navSectionLabel = style({
  padding: 0,
  fontSize: '12px',
  fontWeight: 650,
  color: textTertiary,
  letterSpacing: '0',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const navSectionRoot = style({
  marginTop: '6px',
});

export const navSectionTrigger = style({
  width: '100%',
  minHeight: '26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '3px 6px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.045)',
    color: textSecondary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  '@media': {
    '(max-width: 760px)': {
      justifyContent: 'center',
      padding: '4px 0',
    },
  },
});

export const navSectionTitle = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const navSectionChevron = style({
  width: '16px',
  height: '16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  fontSize: '16px',
  color: 'inherit',
  transform: 'rotate(90deg)',
  transition: 'transform 0.16s',
  selectors: {
    [`${navSectionRoot}[data-collapsed="true"] &`]: {
      transform: 'rotate(0deg)',
    },
  },
});

export const navSectionActions = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const navSectionContent = style({
  paddingTop: '2px',
});

export const sidebarPrimary = style({
  padding: '0 8px 6px',
  flexShrink: 0,
  borderBottom: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const sidebarScrollable = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '6px 8px 8px',
  scrollbarGutter: 'stable',
  scrollbarWidth: 'thin',
  scrollbarColor: 'transparent transparent',
  ':hover': {
    scrollbarColor: 'rgba(31, 35, 40, 0.22) transparent',
  },
});

export const quickSearchRow = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 30px',
  gap: '6px',
  marginBottom: '6px',
  '@media': {
    '(max-width: 760px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const quickSearchButton = style({
  minWidth: 0,
  height: '30px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 10px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'rgba(31, 35, 40, 0.045)',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 520,
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.075)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  '@media': {
    '(max-width: 760px)': {
      justifyContent: 'center',
      padding: 0,
    },
  },
});

export const quickNewButton = style({
  width: '30px',
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  color: textPrimary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  lineHeight: 1,
  transition: 'background-color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
});

export const navSectionHeader = style({
  minHeight: '28px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
  padding: '10px 8px 2px',
  '@media': {
    '(max-width: 760px)': {
      justifyContent: 'center',
      padding: '8px 0 2px',
    },
  },
});

export const navSectionAction = style({
  width: '22px',
  height: '22px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const navMeta = style({
  padding: '2px 10px 6px',
  fontSize: '12px',
  lineHeight: '17px',
  color: textTertiary,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const navItem = style({
  width: '100%',
  minHeight: '30px',
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
  padding: '0 6px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: 400,
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.52,
  },
  '@media': {
    '(max-width: 760px)': {
      justifyContent: 'center',
      padding: 0,
    },
  },
});

export const navItemActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.065)',
  color: textPrimary,
  boxShadow: 'none',
});

export const navItemIcon = style({
  width: '20px',
  height: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'inherit',
  fontSize: '20px',
  fontWeight: 700,
});

export const navItemLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const recentDocItem = style({
  width: '100%',
  minHeight: '34px',
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr)',
  gridTemplateRows: '18px 14px',
  alignItems: 'center',
  columnGap: '10px',
  padding: '3px 6px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  '@media': {
    '(max-width: 760px)': {
      display: 'flex',
      justifyContent: 'center',
      padding: 0,
    },
  },
});

export const recentDocTitle = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '13px',
  fontWeight: 540,
  lineHeight: '18px',
  color: 'inherit',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const recentDocMeta = style({
  gridColumn: '2',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '11px',
  lineHeight: '16px',
  color: textTertiary,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const sidebarFooter = style({
  padding: '6px 8px',
  borderTop: '0.5px solid rgba(31, 35, 40, 0.08)',
  flexShrink: 0,
});

export const userInfo = style({
  minHeight: '36px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  '@media': {
    '(max-width: 760px)': {
      justifyContent: 'center',
      padding: '6px 0',
    },
  },
});

export const avatar = style({
  width: '30px',
  height: '30px',
  borderRadius: '50%',
  backgroundColor: '#2f7dd3',
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '12px',
  fontWeight: 700,
  flexShrink: 0,
});

export const userText = style({
  flex: 1,
  minWidth: 0,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const userName = style({
  fontSize: '13px',
  fontWeight: 650,
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const userEmail = style({
  fontSize: '11px',
  lineHeight: '15px',
  color: textTertiary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const main = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  borderLeft: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const rightSidebarShell = style({
  flexShrink: 0,
  display: 'flex',
  minHeight: 0,
  backgroundColor: '#ffffff',
  selectors: {
    '&[data-open="false"]': {
      backgroundColor: '#fbfbfa',
    },
  },
  '@media': {
    '(max-width: 1100px)': {
      display: 'none',
    },
  },
});

export const rightSidebarPanel = style({
  width: '300px',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '0.5px solid rgba(31, 35, 40, 0.08)',
  backgroundColor: '#ffffff',
});

export const rightSidebarRail = style({
  width: '40px',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
  padding: '8px 4px',
  borderLeft: '0.5px solid rgba(31, 35, 40, 0.08)',
  backgroundColor: '#fbfbfa',
});

export const rightSidebarTab = style({
  width: '32px',
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const rightSidebarTabActive = style({
  backgroundColor: '#ffffff',
  color: accent,
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.08)',
});

export const rightSidebarTabIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  fontWeight: 760,
  lineHeight: 1,
});

export const rightSidebarTabLabel = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
});

export const rightPanelHeader = style({
  minHeight: '52px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '8px 12px',
  borderBottom: border,
  flexShrink: 0,
});

export const rightPanelKicker = style({
  marginBottom: '2px',
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
  fontWeight: 560,
});

export const rightPanelTitle = style({
  color: textPrimary,
  fontSize: '14px',
  lineHeight: '19px',
  fontWeight: 680,
});

export const rightPanelClose = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const rightPanelBody = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '10px',
});

export const rightCalendar = style({
  padding: '8px 0 10px',
  borderBottom: '0.5px solid rgba(31, 35, 40, 0.08)',
  backgroundColor: '#ffffff',
});

export const rightCalendarHeader = style({
  marginBottom: '10px',
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 650,
});

export const rightCalendarGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(7, 1fr)',
  gap: '4px',
});

export const rightCalendarWeekday = style({
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '14px',
});

export const rightCalendarDay = style({
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '12px',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const rightCalendarDayActive = style({
  backgroundColor: accent,
  color: '#ffffff',
  fontWeight: 700,
});

export const rightInfoCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '8px',
  padding: '8px 0',
  border: 'none',
  borderRadius: 0,
  backgroundColor: '#ffffff',
});

export const rightInfoLabel = style({
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
});

export const rightInfoValue = style({
  minWidth: 0,
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 560,
  overflowWrap: 'anywhere',
});

export const rightPanelMeta = style({
  marginTop: '10px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '18px',
});

export const mainHeader = style({
  height: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '0 16px',
  borderBottom: border,
  flexShrink: 0,
  backgroundColor: '#ffffff',
});

export const headerPrimary = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const mainHeaderTitle = style({
  flexShrink: 0,
  fontSize: '15px',
  fontWeight: 680,
  lineHeight: '20px',
});

export const headerTabs = style({
  display: 'flex',
  alignItems: 'center',
  gap: '2px',
  minWidth: 0,
  overflowX: 'auto',
});

export const headerTab = style({
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textSecondary,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 560,
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const headerTabActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.065)',
  color: textPrimary,
});

export const headerTabIcon = style({
  width: '20px',
  height: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  color: 'inherit',
  fontSize: '18px',
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexShrink: 0,
});

export const headerActionGroup = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
});

export const viewToggle = style({
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: 0,
  borderRadius: '4px',
  border: 'none',
  backgroundColor: 'transparent',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const viewToggleButton = style({
  height: '28px',
  minWidth: '28px',
  width: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textSecondary,
  fontFamily: 'inherit',
  fontSize: '18px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s, box-shadow 0.16s',
  ':hover': {
    color: textPrimary,
  },
});

export const viewToggleButtonActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.065)',
  color: textPrimary,
  boxShadow: 'none',
});

export const displayMenuButton = style({
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  borderRadius: '8px',
  border,
  backgroundColor: '#ffffff',
  color: textPrimary,
  fontFamily: 'inherit',
  fontSize: '14px',
  fontWeight: 560,
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s, border-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.045)',
    color: textPrimary,
    borderColor: 'rgba(31, 35, 40, 0.14)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  '@media': {
    '(max-width: 900px)': {
      display: 'none',
    },
  },
});

export const displayMenu = style({
  position: 'absolute',
  top: '40px',
  right: 0,
  zIndex: 20,
  width: '280px',
  padding: '8px',
  border,
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  boxShadow: '0 2px 8px rgba(31, 35, 40, 0.12)',
});

export const displayMenuSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const displayMenuTitle = style({
  padding: '4px 8px 6px',
  color: textTertiary,
  fontSize: '11px',
  fontWeight: 650,
});

export const displayMenuRow = style({
  width: '100%',
  minHeight: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textPrimary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  textAlign: 'left',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const displayMenuLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const displayMenuValue = style({
  color: textTertiary,
  fontSize: '12px',
  whiteSpace: 'nowrap',
});

export const displayMenuDivider = style({
  height: '1px',
  margin: '6px 0',
  backgroundColor: 'rgba(31, 35, 40, 0.08)',
});

export const propertyToggle = style({
  width: '100%',
  minHeight: '30px',
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr)',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  textAlign: 'left',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const propertyToggleActive = style({
  color: textPrimary,
});

export const mainContent = style({
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: 0,
});

export const contentFrame = style({
  maxWidth: '980px',
  margin: '0 auto',
});

export const docsExplorer = style({
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  width: '100%',
  paddingTop: 0,
});

export const pinnedCollectionArea = style({
  padding: '0 16px',
  paddingTop: '8px',
  '@media': {
    '(max-width: 760px)': {
      padding: '0 16px',
      paddingTop: '10px',
    },
  },
});

export const pinnedCollectionList = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  overflowX: 'auto',
});

export const pinnedCollectionItem = style({
  minWidth: '46px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  lineHeight: '24px',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const pinnedCollectionItemActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.075)',
  color: textPrimary,
});

export const pinnedCollectionAdd = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  transition: 'background-color 0.16s, color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.55,
  },
});

export const filterArea = style({
  padding: '0 16px',
  paddingTop: '8px',
  '@media': {
    '(max-width: 760px)': {
      padding: '0 16px',
      paddingTop: '10px',
    },
  },
});

export const filterInnerArea = style({
  minHeight: '32px',
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: '6px',
  padding: 0,
  borderRadius: 0,
  backgroundColor: 'transparent',
  '@media': {
    '(max-width: 860px)': {
      alignItems: 'flex-start',
      flexDirection: 'column',
    },
  },
});

export const filterLabel = style({
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '0 4px',
  borderRadius: '4px',
  color: textSecondary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 590,
  whiteSpace: 'nowrap',
});

export const filterTokenIcon = style({
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: textTertiary,
});

export const filterTokens = style({
  minWidth: 0,
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: '6px',
});

export const filterToken = style({
  maxWidth: '100%',
  minHeight: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  borderRadius: '4px',
  backgroundColor: 'rgba(31, 35, 40, 0.055)',
  color: textSecondary,
  fontSize: '13px',
  lineHeight: '18px',
  boxShadow: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const filterMeta = style({
  flexShrink: 0,
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
  whiteSpace: 'nowrap',
  '@media': {
    '(max-width: 860px)': {
      whiteSpace: 'normal',
    },
  },
});

export const docsExplorerScroll = style({
  minHeight: 0,
  overflowY: 'auto',
  margin: '0 16px 16px',
});

export const collectionStrip = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 24px',
  marginBottom: '12px',
  overflowX: 'auto',
});

export const collectionChip = style({
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 12px',
  borderRadius: '8px',
  border,
  backgroundColor: '#ffffff',
  color: textSecondary,
  fontFamily: 'inherit',
  fontSize: '13px',
  fontWeight: 590,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s, border-color 0.16s',
  ':hover': {
    borderColor: 'rgba(31, 35, 40, 0.14)',
    color: textPrimary,
  },
});

export const collectionChipActive = style({
  backgroundColor: '#eef6ff',
  borderColor: 'rgba(30, 150, 235, 0.2)',
  color: '#156fbd',
});

export const sectionToolbar = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '8px 16px 6px',
});

export const sectionTitle = style({
  margin: 0,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 650,
  color: textSecondary,
});

export const docCount = style({
  fontSize: '12px',
  color: textTertiary,
});

export const docSelectionBar = style({
  minHeight: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px 6px 4px 10px',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.12)',
});

export const docSelectionMeta = style({
  color: textSecondary,
  fontSize: '12px',
  lineHeight: '16px',
  whiteSpace: 'nowrap',
});

export const docSelectionButton = style({
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: accent,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: 590,
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(30, 150, 235, 0.08)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const docGroup = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const docGroupHeader = style({
  minHeight: '24px',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '6px 4px 2px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
});

export const docGroupTitle = style({
  color: textSecondary,
  fontWeight: 620,
});

export const docList = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  overflow: 'visible',
  backgroundColor: '#ffffff',
});

export const docListHeader = style({
  minHeight: '28px',
  display: 'grid',
  gridTemplateColumns: '28px minmax(200px, 1fr) 140px 140px 88px',
  alignItems: 'center',
  gap: '8px',
  padding: '0 4px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
  '@media': {
    '(max-width: 860px)': {
      display: 'none',
    },
  },
});

export const docListHeaderCell = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const docGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: '16px 24px',
});

export const docMasonry = style({
  columnWidth: '240px',
  columnGap: '24px',
});

export const docGridCard = style({
  position: 'relative',
  minHeight: '154px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '16px',
  border: '0.5px solid rgba(31, 35, 40, 0.1)',
  borderRadius: '12px',
  backgroundColor: '#fbfbfa',
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'border-color 0.16s, box-shadow 0.16s, background-color 0.16s',
  breakInside: 'avoid',
  ':hover': {
    backgroundColor: '#ffffff',
    borderColor: 'rgba(31, 35, 40, 0.16)',
    boxShadow: '0 2px 8px rgba(31, 35, 40, 0.08)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  selectors: {
    [`${docMasonry} &`]: {
      marginBottom: '16px',
    },
    '&[data-selected="true"]': {
      backgroundColor: '#f4f9ff',
      borderColor: 'rgba(30, 150, 235, 0.32)',
      boxShadow: '0 0 0 1px rgba(30, 150, 235, 0.16)',
    },
  },
});

export const docMasonryCardTall = style({
  minHeight: '188px',
});

export const docMasonryCardMedium = style({
  minHeight: '172px',
});

export const docGridMeta = style({
  width: '100%',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '6px',
});

export const docCard = style({
  minHeight: '42px',
  display: 'grid',
  gridTemplateColumns: '28px minmax(200px, 1fr) 140px 140px 88px',
  alignItems: 'center',
  gap: '8px',
  padding: '2px 4px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: 'background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.045)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
  selectors: {
    '&[data-selected="true"]': {
      backgroundColor: '#f4f9ff',
    },
  },
  '@media': {
    '(max-width: 860px)': {
      gridTemplateColumns: '28px minmax(0, 1fr)',
      alignItems: 'start',
      gap: '4px',
      padding: '12px 14px',
    },
  },
});

export const docSelectBox = style({
  width: '20px',
  height: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  justifySelf: 'center',
  flexShrink: 0,
  border: '1px solid rgba(31, 35, 40, 0.18)',
  borderRadius: '5px',
  backgroundColor: '#ffffff',
  color: '#ffffff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: 1,
  transition:
    'background-color 0.16s, border-color 0.16s, color 0.16s, opacity 0.16s',
  ':hover': {
    borderColor: 'rgba(30, 150, 235, 0.52)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
  selectors: {
    [`${docGridCard} &`]: {
      position: 'absolute',
      top: '10px',
      right: '44px',
      opacity: 0,
    },
    [`${docGridCard}:hover &`]: {
      opacity: 1,
    },
    [`${docGridCard}[data-selected="true"] &`]: {
      opacity: 1,
    },
  },
});

export const docSelectBoxActive = style({
  borderColor: accent,
  backgroundColor: accent,
  color: '#ffffff',
});

export const docFavoriteButton = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  transition: 'background-color 0.16s, color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
  selectors: {
    [`${docGridCard} &`]: {
      position: 'absolute',
      top: '10px',
      left: '10px',
      opacity: 0,
    },
    [`${docGridCard}:hover &`]: {
      opacity: 1,
    },
    [`${docGridCard} &[aria-pressed="true"]`]: {
      opacity: 1,
    },
  },
});

export const docFavoriteButtonActive = style({
  color: '#b87900',
  selectors: {
    '&:hover': {
      color: '#8a5a00',
    },
  },
});

export const docTitleGroup = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  selectors: {
    [`${docGridCard} &`]: {
      marginTop: '18px',
    },
  },
});

export const docIcon = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textSecondary,
  fontSize: '24px',
  fontWeight: 700,
});

export const docTitle = style({
  minWidth: 0,
  fontSize: '14px',
  fontWeight: 520,
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const docPreview = style({
  minWidth: 0,
  fontSize: '12px',
  fontWeight: 400,
  lineHeight: '18px',
  color: textTertiary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const docMeta = style({
  fontSize: '12px',
  lineHeight: '18px',
  color: textTertiary,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '@media': {
    '(max-width: 860px)': {
      display: 'none',
    },
  },
});

export const docActionGroup = style({
  justifySelf: 'end',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  opacity: 0,
  transition: 'opacity 0.16s',
  selectors: {
    [`${docCard}:hover &`]: {
      opacity: 1,
    },
    [`${docCard}[data-selected="true"] &`]: {
      opacity: 1,
    },
    '&:focus-within': {
      opacity: 1,
    },
  },
  '@media': {
    '(max-width: 860px)': {
      display: 'none',
    },
  },
});

export const docMoreButton = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  transition: 'background-color 0.16s, color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
  selectors: {
    [`${docCard}:hover &`]: {
      color: textSecondary,
    },
    [`${docGridCard} &`]: {
      backgroundColor: '#ffffff',
      opacity: 0,
    },
    [`${docGridCard}:hover &`]: {
      opacity: 1,
    },
    [`${docGridCard} &[aria-expanded=\"true\"]`]: {
      opacity: 1,
    },
  },
});

export const docMoreButtonActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.08)',
  color: textPrimary,
});

export const docActionMenuWrap = style({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  selectors: {
    [`${docGridCard} > &`]: {
      position: 'absolute',
      top: '10px',
      right: '10px',
      zIndex: 5,
    },
  },
});

export const docActionMenu = style({
  position: 'fixed',
  zIndex: 60,
  width: '204px',
  padding: '6px',
  border,
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  boxShadow: '0 2px 8px rgba(31, 35, 40, 0.12)',
});

export const docActionMenuItem = style({
  width: '100%',
  minHeight: '32px',
  display: 'grid',
  gridTemplateColumns: '18px minmax(0, 1fr)',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textPrimary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '13px',
  textAlign: 'left',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const docActionMenuDanger = style({
  color: '#b42318',
  ':hover': {
    backgroundColor: 'rgba(202, 73, 73, 0.08)',
  },
});

export const docActionMenuIcon = style({
  width: '20px',
  height: '20px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'inherit',
  fontSize: '18px',
});

export const docActionMenuLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const docActionMenuDivider = style({
  height: '1px',
  margin: '5px 0',
  backgroundColor: 'rgba(31, 35, 40, 0.08)',
});

export const docPropertyPill = style({
  maxWidth: '100%',
  height: '22px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 8px',
  borderRadius: '6px',
  backgroundColor: 'rgba(31, 35, 40, 0.055)',
  color: textSecondary,
  fontSize: '12px',
  lineHeight: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const docAction = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  color: textTertiary,
  fontSize: '18px',
  '@media': {
    '(max-width: 860px)': {
      display: 'none',
    },
  },
});

export const panelList = style({
  width: 'min(560px, calc(100vw - 56px))',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '2px',
  border: '0.5px solid rgba(31, 35, 40, 0.1)',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  padding: '4px',
});

export const panelRow = style({
  width: '100%',
  minHeight: '48px',
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: '6px',
  color: textPrimary,
  textAlign: 'left',
});

export const panelRowButton = style({
  width: '100%',
  minHeight: '48px',
  display: 'grid',
  gridTemplateColumns: '28px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textPrimary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  transition: 'background-color 0.16s, color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.68,
  },
});

export const panelRowIcon = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  backgroundColor: '#f6f6f4',
  color: textSecondary,
  fontSize: '20px',
});

export const panelRowContent = style({
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: '1px',
});

export const panelRowTitle = style({
  width: '100%',
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 590,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const panelRowMeta = style({
  width: '100%',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const panelRowAction = style({
  color: textTertiary,
  fontSize: '14px',
  lineHeight: 1,
});

export const panelAction = style({
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 8px',
  borderRadius: '6px',
  backgroundColor: 'rgba(31, 35, 40, 0.055)',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
  whiteSpace: 'nowrap',
});

export const panelEmptyHint = style({
  padding: '8px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '18px',
  textAlign: 'left',
});

export const infoList = style({
  width: 'min(680px, calc(100vw - 56px))',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginTop: '2px',
  border: '0.5px solid rgba(31, 35, 40, 0.1)',
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  padding: '4px',
});

export const infoRow = style({
  minHeight: '52px',
  display: 'grid',
  gridTemplateColumns: '28px minmax(160px, 1fr) minmax(120px, auto)',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: '6px',
  color: textPrimary,
  textAlign: 'left',
  '@media': {
    '(max-width: 760px)': {
      gridTemplateColumns: '28px minmax(0, 1fr)',
    },
  },
});

export const infoRowIcon = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '6px',
  backgroundColor: '#f6f6f4',
  color: textSecondary,
  fontSize: '20px',
});

export const infoRowTitle = style({
  display: 'block',
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 590,
});

export const infoRowMeta = style({
  display: 'block',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
});

export const infoRowValue = style({
  justifySelf: 'end',
  maxWidth: '260px',
  color: textSecondary,
  fontSize: '12px',
  lineHeight: '18px',
  overflowWrap: 'anywhere',
  textAlign: 'right',
  '@media': {
    '(max-width: 760px)': {
      gridColumn: '2',
      justifySelf: 'start',
      textAlign: 'left',
    },
  },
});

export const emptyState = style({
  minHeight: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
});

export const emptyIcon = style({
  width: '64px',
  height: '64px',
  borderRadius: '16px',
  backgroundColor: 'transparent',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '16px',
  color: accent,
  fontSize: '40px',
  fontWeight: 760,
});

export const emptyTitle = style({
  margin: '0 0 8px',
  fontSize: '20px',
  fontWeight: 720,
  lineHeight: '26px',
});

export const emptySubtitle = style({
  margin: '0 0 24px',
  fontSize: '14px',
  color: textSecondary,
  lineHeight: '22px',
  maxWidth: '440px',
});

export const loadingContainer = style({
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: textTertiary,
  backgroundColor: '#fbfbfa',
  fontSize: '14px',
});

export const newDocButton = style({
  minWidth: '88px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 12px',
  border,
  borderRadius: '8px',
  backgroundColor: '#ffffff',
  color: textPrimary,
  fontSize: '14px',
  fontWeight: 560,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 0.16s, border-color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.045)',
    borderColor: 'rgba(31, 35, 40, 0.14)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    opacity: 0.52,
    cursor: 'not-allowed',
  },
});

export const quietButton = style({
  height: '34px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '0 12px',
  borderRadius: '8px',
  border,
  backgroundColor: '#ffffff',
  color: textSecondary,
  fontSize: '13px',
  fontWeight: 560,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 0.16s, color 0.16s, border-color 0.16s',
  ':hover': {
    backgroundColor: '#f8f8f6',
    borderColor: 'rgba(31, 35, 40, 0.14)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

globalStyle(`${sidebarScrollable}::-webkit-scrollbar`, {
  width: '8px',
});

globalStyle(`${sidebarScrollable}::-webkit-scrollbar-track`, {
  backgroundColor: 'transparent',
});

globalStyle(`${sidebarScrollable}::-webkit-scrollbar-thumb`, {
  border: '2px solid transparent',
  borderRadius: '999px',
  backgroundClip: 'content-box',
  backgroundColor: 'transparent',
});

globalStyle(`${sidebarScrollable}:hover::-webkit-scrollbar-thumb`, {
  backgroundColor: 'rgba(31, 35, 40, 0.22)',
});

globalStyle(
  `${appHeaderButton} svg, ${appTabAdd} svg, ${appTabIcon} svg, ${appTabClose} svg, ${backLink} svg, ${workspaceMark} svg, ${navSectionChevron} svg, ${navSectionAction} svg, ${quickSearchButton} svg, ${quickNewButton} svg, ${navItemIcon} svg, ${rightSidebarTabIcon} svg, ${rightPanelClose} svg, ${headerTabIcon} svg, ${viewToggleButton} svg, ${displayMenuButton} svg, ${propertyToggle} svg, ${filterTokenIcon} svg, ${pinnedCollectionAdd} svg, ${docSelectBox} svg, ${docFavoriteButton} svg, ${docIcon} svg, ${docMoreButton} svg, ${docActionMenuIcon} svg, ${docAction} svg, ${panelRowIcon} svg, ${panelRowAction} svg, ${panelAction} svg, ${infoRowIcon} svg, ${emptyIcon} svg, ${newDocButton} svg, ${quietButton} svg`,
  {
    width: '1em',
    height: '1em',
    display: 'block',
    flexShrink: 0,
  }
);

globalStyle(
  `${quickSearchButton} svg, ${quickNewButton} svg, ${headerTabIcon} svg, ${viewToggleButton} svg, ${displayMenuButton} svg, ${propertyToggle} svg, ${newDocButton} svg, ${quietButton} svg`,
  {
    width: '18px',
    height: '18px',
  }
);

globalStyle(
  `${navItemIcon} svg, ${docIcon} svg, ${panelRowIcon} svg, ${infoRowIcon} svg`,
  {
    width: '100%',
    height: '100%',
  }
);
