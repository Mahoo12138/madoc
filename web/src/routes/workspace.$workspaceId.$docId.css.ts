import { globalStyle, style } from '@vanilla-extract/css';

const border = '1px solid rgba(31, 35, 40, 0.08)';
const textPrimary = '#242424';
const textSecondary = '#6f6f6f';
const textTertiary = '#9b9b9b';
const accent = '#1e96eb';

export const editorLayout = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  color: textPrimary,
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

export const editorAppTabsHeader = style({
  height: '48px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
  backgroundColor: '#ffffff',
  borderBottom: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const editorAppTabsLeft = style({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
});

export const editorAppTabsCenter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '8px',
  flex: 1,
  height: '100%',
  minWidth: 0,
  overflow: 'hidden',
});

export const editorAppTabsRight = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '10px',
  minWidth: 0,
});

export const editorAppHeaderButton = style({
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

export const editorAppTab = style({
  width: '200px',
  maxWidth: 'min(200px, 34vw)',
  minWidth: '44px',
  height: '30px',
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

export const editorAppTabActive = style({
  backgroundColor: '#ffffff',
  color: textPrimary,
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.12)',
  cursor: 'default',
});

export const editorAppTabAdd = style({
  width: '30px',
  height: '30px',
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

export const editorAppTabClose = style({
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginLeft: 'auto',
  border: 'none',
  borderRadius: '3px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '16px',
  lineHeight: 1,
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.08)',
    color: textPrimary,
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '1px',
  },
});

export const editorAppTabFavorite = style({
  width: '18px',
  height: '18px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textTertiary,
  cursor: 'pointer',
  fontFamily: 'inherit',
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

export const editorAppTabFavoriteActive = style({
  color: '#b87900',
  selectors: {
    '&:hover': {
      color: '#8a5a00',
    },
  },
});

export const editorAppTabIcon = style({
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

export const editorAppTabLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorAppMeta = style({
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

export const editorAppViewMain = style({
  flex: 1,
  minHeight: 0,
  width: '100%',
  display: 'flex',
  flexFlow: 'row',
  position: 'relative',
});

export const editorSidebar = style({
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

export const editorSidebarClosed = style({
  display: 'none',
});

export const editorSidebarHeader = style({
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 8px',
  flexShrink: 0,
});

export const editorSidebarWorkspaceBar = style({
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

export const editorSidebarUserButton = style({
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
  transition: 'background-color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.06)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
  ':disabled': {
    cursor: 'default',
    opacity: 0.58,
  },
});

export const editorBackLink = style({
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

export const editorWorkspaceMark = style({
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

export const editorUserAvatar = style({
  width: '30px',
  height: '30px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: '#2f7dd3',
  color: '#fff',
  fontSize: '12px',
  fontWeight: 700,
});

export const editorSidebarFooter = style({
  padding: '6px 8px',
  borderTop: '0.5px solid rgba(31, 35, 40, 0.08)',
  flexShrink: 0,
});

export const editorUserInfo = style({
  minHeight: '36px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 8px',
  borderRadius: '4px',
  cursor: 'default',
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

export const editorUserText = style({
  flex: 1,
  minWidth: 0,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const editorUserName = style({
  fontSize: '13px',
  fontWeight: 650,
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorUserEmail = style({
  fontSize: '11px',
  lineHeight: '15px',
  color: textTertiary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorSidebarText = style({
  minWidth: 0,
  flex: 1,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const editorSidebarTitle = style({
  fontSize: '14px',
  fontWeight: 650,
  lineHeight: '18px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorSidebarMeta = style({
  fontSize: '11px',
  lineHeight: '15px',
  color: textTertiary,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorNav = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
});

export const editorNavSection = style({
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

export const editorNavSectionRoot = style({
  marginTop: '6px',
});

export const editorNavSectionTrigger = style({
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

export const editorNavSectionTitle = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
});

export const editorNavSectionChevron = style({
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
    [`${editorNavSectionRoot}[data-collapsed="true"] &`]: {
      transform: 'rotate(0deg)',
    },
  },
});

export const editorNavSectionActions = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export const editorNavSectionContent = style({
  paddingTop: '2px',
});

export const editorSidebarPrimary = style({
  padding: '0 8px 6px',
  flexShrink: 0,
  borderBottom: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const editorSidebarScrollable = style({
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

export const editorQuickSearchRow = style({
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

export const editorQuickSearchButton = style({
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

export const editorQuickNewButton = style({
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

export const editorNavSectionHeader = style({
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

export const editorNavSectionAction = style({
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

export const editorNavMeta = style({
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

export const editorNavItem = style({
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

export const editorNavItemActive = style({
  backgroundColor: 'rgba(31, 35, 40, 0.065)',
  color: textPrimary,
  boxShadow: 'none',
});

export const editorNavIcon = style({
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

export const editorNavLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const editorRecentDocItem = style({
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

export const editorRecentDocTitle = style({
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

export const editorRecentDocMeta = style({
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

export const editorMain = style({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
  borderLeft: '0.5px solid rgba(31, 35, 40, 0.08)',
});

export const editorRightSidebarShell = style({
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

export const editorRightSidebarPanel = style({
  width: '300px',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  borderLeft: '0.5px solid rgba(31, 35, 40, 0.08)',
  backgroundColor: '#ffffff',
});

export const editorRightSidebarRail = style({
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

export const editorRightSidebarTab = style({
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

export const editorRightSidebarTabActive = style({
  backgroundColor: '#ffffff',
  color: accent,
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.08)',
});

export const editorRightSidebarTabIcon = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '20px',
  fontWeight: 760,
  lineHeight: 1,
});

export const editorRightSidebarTabLabel = style({
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
});

export const editorRightPanelHeader = style({
  minHeight: '48px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '7px 10px 7px 12px',
  borderBottom: border,
  flexShrink: 0,
});

export const editorRightPanelKicker = style({
  marginBottom: '2px',
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
  fontWeight: 560,
});

export const editorRightPanelTitle = style({
  color: textPrimary,
  fontSize: '14px',
  lineHeight: '19px',
  fontWeight: 680,
});

export const editorRightPanelClose = style({
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

export const editorRightPanelBody = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '8px',
});

export const editorRightInfoCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  marginBottom: '2px',
  padding: '8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: '#ffffff',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.035)',
  },
});

export const editorRightInfoLabel = style({
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
});

export const editorRightInfoValue = style({
  minWidth: 0,
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 560,
  overflowWrap: 'anywhere',
});

export const editorRightPanelMeta = style({
  marginTop: '8px',
  padding: '0 8px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '18px',
});

export const editorRightTimeline = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const editorRightTimelineItem = style({
  width: '100%',
  minHeight: '36px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  justifyContent: 'center',
  gap: '2px',
  padding: '5px 8px',
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.055)',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const editorRightTimelineTitle = style({
  width: '100%',
  color: textPrimary,
  fontSize: '13px',
  lineHeight: '18px',
  fontWeight: 560,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorRightTimelineMeta = style({
  width: '100%',
  color: textTertiary,
  fontSize: '11px',
  lineHeight: '15px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorTopbar = style({
  height: '48px',
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '0 16px',
  borderBottom: border,
  backgroundColor: '#ffffff',
});

export const editorTopbarPrimary = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  flex: 1,
});

export const editorDocInfo = style({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
});

export const editorDocTitle = style({
  fontSize: '15px',
  fontWeight: 680,
  lineHeight: '22px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorDocTitleInput = style({
  width: 'min(360px, 36vw)',
  height: '28px',
  margin: 0,
  padding: '0 4px',
  border: '1px solid transparent',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textPrimary,
  fontFamily: 'inherit',
  fontSize: '14px',
  fontWeight: 560,
  lineHeight: '20px',
  outline: 'none',
  textOverflow: 'ellipsis',
  transition: 'border-color 0.16s, background-color 0.16s',
  ':hover': {
    backgroundColor: 'rgba(31, 35, 40, 0.035)',
  },
  ':focus': {
    borderColor: 'rgba(30, 136, 229, 0.36)',
    backgroundColor: '#ffffff',
  },
});

export const editorModeSwitch = style({
  height: '32px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '4px',
  borderRadius: '8px',
  backgroundColor: 'rgba(31, 35, 40, 0.055)',
  flexShrink: 0,
});

export const editorModeButton = style({
  width: '24px',
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '6px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
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

export const editorModeButtonActive = style({
  backgroundColor: '#ffffff',
  color: textPrimary,
  boxShadow: '0 0 0 1px rgba(31, 35, 40, 0.08)',
});

export const editorDocMeta = style({
  fontSize: '12px',
  color: textTertiary,
  lineHeight: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const editorActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
  '@media': {
    '(max-width: 760px)': {
      display: 'none',
    },
  },
});

export const editorSyncStatus = style({
  height: '24px',
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 6px',
  borderRadius: '4px',
  color: textTertiary,
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: 520,
  whiteSpace: 'nowrap',
  selectors: {
    '&[data-status="syncing"], &[data-status="connecting"], &[data-status="loading"]': {
      color: textSecondary,
      backgroundColor: 'rgba(31, 35, 40, 0.04)',
    },
    '&[data-status="error"]': {
      color: '#b42318',
      backgroundColor: 'rgba(180, 35, 24, 0.08)',
    },
  },
});

export const editorHeaderIconButton = style({
  width: '28px',
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: 'none',
  borderRadius: '4px',
  backgroundColor: 'transparent',
  color: textSecondary,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '18px',
  flexShrink: 0,
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

export const editorHeaderIconButtonActive = style({
  color: '#b87900',
  selectors: {
    '&:hover': {
      color: '#8a5a00',
    },
  },
});

export const editorHeaderDivider = style({
  width: '1px',
  height: '20px',
  margin: '0 4px',
  backgroundColor: 'rgba(31, 35, 40, 0.1)',
});

export const editorShareButton = style({
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 10px',
  border: 'none',
  borderRadius: '6px',
  backgroundColor: accent,
  color: '#ffffff',
  fontSize: '13px',
  fontWeight: 560,
  fontFamily: 'inherit',
  cursor: 'pointer',
  transition: 'background-color 0.16s, opacity 0.16s',
  ':hover': {
    backgroundColor: '#1688d8',
  },
  ':focus-visible': {
    outline: `2px solid ${accent}`,
    outlineOffset: '2px',
  },
});

export const editorQuietButton = style({
  height: '28px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0 12px',
  borderRadius: '8px',
  border,
  backgroundColor: '#ffffff',
  color: textSecondary,
  fontSize: '13px',
  fontWeight: 560,
  fontFamily: 'inherit',
  cursor: 'pointer',
});

globalStyle(`${editorSidebarScrollable}::-webkit-scrollbar`, {
  width: '8px',
});

globalStyle(`${editorSidebarScrollable}::-webkit-scrollbar-track`, {
  backgroundColor: 'transparent',
});

globalStyle(`${editorSidebarScrollable}::-webkit-scrollbar-thumb`, {
  border: '2px solid transparent',
  borderRadius: '999px',
  backgroundClip: 'content-box',
  backgroundColor: 'transparent',
});

globalStyle(`${editorSidebarScrollable}:hover::-webkit-scrollbar-thumb`, {
  backgroundColor: 'rgba(31, 35, 40, 0.22)',
});

globalStyle(
  `${editorAppHeaderButton} svg, ${editorAppTabAdd} svg, ${editorAppTabClose} svg, ${editorAppTabFavorite} svg, ${editorAppTabIcon} svg, ${editorBackLink} svg, ${editorWorkspaceMark} svg, ${editorNavSectionChevron} svg, ${editorNavSectionAction} svg, ${editorQuickSearchButton} svg, ${editorQuickNewButton} svg, ${editorNavIcon} svg, ${editorRightSidebarTabIcon} svg, ${editorRightPanelClose} svg, ${editorModeButton} svg, ${editorHeaderIconButton} svg, ${editorShareButton} svg, ${editorQuietButton} svg`,
  {
    width: '1em',
    height: '1em',
    display: 'block',
    flexShrink: 0,
  }
);

globalStyle(
  `${editorQuickSearchButton} svg, ${editorQuickNewButton} svg, ${editorModeButton} svg, ${editorHeaderIconButton} svg, ${editorShareButton} svg, ${editorQuietButton} svg`,
  {
    width: '18px',
    height: '18px',
  }
);

globalStyle(`${editorNavIcon} svg`, {
  width: '100%',
  height: '100%',
});

export const editorContainer = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  position: 'relative',
  overflow: 'hidden',
  backgroundColor: '#ffffff',
});

globalStyle(`${editorContainer} > div`, {
  flex: 1,
  minWidth: 0,
  minHeight: 0,
});

globalStyle(`${editorContainer} affine-editor-container`, {
  display: 'block',
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
});

globalStyle(`${editorContainer} .affine-page-viewport`, {
  width: '100%',
  height: '100%',
  backgroundColor: '#ffffff',
});

globalStyle(`${editorContainer} .playground-page-editor-container`, {
  minHeight: 0,
});

globalStyle(`${editorContainer} .affine-edgeless-viewport`, {
  width: '100%',
  height: '100%',
  backgroundColor: '#ffffff',
});

globalStyle(`${editorContainer} .edgeless-editor-container`, {
  height: '100%',
});

export const editorLoading = style({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: textTertiary,
  backgroundColor: '#fbfbfa',
  fontSize: '14px',
});

export const editorError = style({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#b94848',
  fontSize: '14px',
  gap: '12px',
});
