import { style } from "@vanilla-extract/css";

export const shell = style({
  vars: { "--madoc-sidebar-width": "300px", "--madoc-outline-width": "306px" },
  minHeight: "100vh",
  display: "grid",
  gridTemplateColumns: "var(--madoc-sidebar-width) minmax(0, 1fr)",
  background: "var(--mantine-color-white)",
  "@media": { "(max-width: 760px)": { display: "block" } },
});
export const shellWithOutline = style({
  gridTemplateColumns:
    "var(--madoc-sidebar-width) minmax(0, 1fr) var(--madoc-outline-width)",
  "@media": {
    "(max-width: 1180px)": {
      gridTemplateColumns: "var(--madoc-sidebar-width) minmax(0, 1fr)",
    },
  },
});
export const sidebar = style({
  height: "100vh",
  position: "sticky",
  top: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--mantine-color-gray-0)",
  borderRight: "1px solid var(--mantine-color-gray-2)",
  padding: "16px 14px 12px",
  gap: 14,
  overflow: "hidden",
  "@media": { "(max-width: 760px)": { display: "none" } },
});
export const brandRow = style({
  minHeight: 36,
  padding: "0 5px 4px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
});
export const brand = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: 21,
  fontWeight: 700,
  letterSpacing: "-0.04em",
});
export const brandMark = style({
  width: 22,
  height: 22,
  borderRadius: 6,
  background:
    "linear-gradient(135deg, var(--mantine-primary-color-filled) 0 48%, #8dbbff 48% 65%, var(--mantine-primary-color-7) 65%)",
  boxShadow:
    "0 2px 5px color-mix(in srgb, var(--mantine-primary-color-filled) 24%, transparent)",
});
export const workspaceIdentity = style({
  flex: 1,
  minWidth: 0,
  justifyContent: "flex-start",
});
export const workspaceIdentityText = style({
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
  gap: 2,
  alignItems: "flex-start",
});
export const shortcutKey = style({
  padding: "2px 5px",
  border: "1px solid var(--mantine-color-gray-3)",
  borderRadius: 5,
  color: "var(--mantine-color-gray-6)",
  background: "var(--mantine-color-gray-0)",
  fontSize: 11,
  lineHeight: 1.3,
});
export const sidebarSearch = style({
  width: "100%",
  justifyContent: "flex-start",
  fontWeight: 400,
  color: "var(--mantine-color-dimmed)",
  borderColor: "var(--mantine-color-gray-3)",
  background: "var(--mantine-color-white)",
  height: 40,
});
export const sidebarScroll = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  margin: "0 -4px",
  padding: "0 4px",
});
export const sidebarBottom = style({
  flexShrink: 0,
  borderTop: "1px solid var(--mantine-color-gray-2)",
  paddingTop: 8,
});
export const footerAction = style({
  width: "100%",
  minHeight: 36,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 9,
  padding: "0 9px",
  borderRadius: 7,
  color: "var(--mantine-color-dark-6)",
  fontSize: 14,
  selectors: { "&:hover": { background: "var(--mantine-color-gray-1)" } },
});
export const mobileMenu = style({
  display: "none",
  "@media": { "(max-width: 760px)": { display: "block" } },
});
export const workspaceButton = style({
  width: "100%",
  padding: "10px 10px",
  minHeight: 64,
  border: "1px solid var(--mantine-color-gray-2)",
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background:
    "color-mix(in srgb, var(--mantine-color-white) 80%, var(--mantine-color-gray-0))",
  cursor: "pointer",
  selectors: {
    "&:hover": {
      background: "var(--mantine-color-white)",
      borderColor: "var(--mantine-color-gray-3)",
    },
  },
});
export const navigation = style({
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  marginTop: 16,
});
export const desktopNavigation = style({
  display: "flex",
  flexDirection: "column",
  gap: 12,
  paddingBottom: 8,
  "@media": { "(max-width: 1180px)": { display: "none" } },
});
export const navSectionGroup = style({ flexShrink: 0 });
export const mobileNavigation = style({
  display: "none",
  flex: 1,
  minHeight: 0,
  flexDirection: "column",
  marginTop: 4,
  "@media": { "(max-width: 1180px)": { display: "flex" } },
});
export const responsiveOutlineToggle = style({
  display: "none",
  "@media": { "(max-width: 1180px)": { display: "inline-flex" } },
});
export const navSectionHeader = style({
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 6px 0 2px",
});
export const navSectionToggle = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  height: 34,
  color: "var(--mantine-color-dark-7)",
  textAlign: "left",
});
export const navSectionChevron = style({
  display: "flex",
  alignItems: "center",
  opacity: 0,
  visibility: "hidden",
  transition: "opacity 120ms ease",
  selectors: {
    [`${navSectionToggle}:hover &`]: { opacity: 1, visibility: "visible" },
    [`${navSectionToggle}:focus-visible &`]: {
      opacity: 1,
      visibility: "visible",
    },
  },
});
export const navSectionLabel = style({
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
});
export const navigationPanel = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
});
export const tree = style({ paddingTop: 10 });
export const treeLink = style({
  flex: 1,
  minWidth: 0,
  height: "100%",
  display: "flex",
  alignItems: "center",
  gap: 7,
  fontSize: "inherit",
  fontWeight: "inherit",
  color: "inherit",
  borderRadius: "inherit",
  selectors: {
    "&:focus-visible": {
      outline: "2px solid var(--mantine-primary-color-filled)",
      outlineOffset: -2,
    },
  },
});
export const treeRow = style({
  width: "100%",
  height: 34,
  display: "flex",
  alignItems: "center",
  gap: 7,
  border: 0,
  borderRadius: 7,
  background: "transparent",
  color: "var(--mantine-color-dark-6)",
  cursor: "pointer",
  fontSize: 14,
  textAlign: "left",
  selectors: {
    "&:hover": { background: "var(--mantine-color-gray-1)" },
    '&[data-active="true"]': {
      color: "var(--mantine-color-blue-7)",
      background: "var(--mantine-color-blue-0)",
      fontWeight: 600,
    },
  },
});
export const rowTitle = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const main = style({
  minWidth: 0,
  minHeight: "100vh",
  background: "var(--mantine-color-white)",
});
export const outlinePanel = style({
  minWidth: 0,
  minHeight: "calc(100vh - 58px)",
  height: "calc(100vh - 58px)",
  position: "sticky",
  top: 58,
  display: "flex",
  flexDirection: "column",
  padding: "14px 14px 20px",
  borderLeft: "1px solid var(--mantine-color-gray-2)",
  background: "var(--mantine-color-white)",
  overflowY: "auto",
  overscrollBehavior: "contain",
  "@media": { "(max-width: 1180px)": { display: "none" } },
});
export const outlineHeader = style({
  minHeight: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 2px 8px",
});
export const topbar = style({
  height: 58,
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "0 22px",
  borderBottom: "1px solid var(--mantine-color-gray-2)",
  background: "color-mix(in srgb, var(--mantine-color-white) 93%, transparent)",
  backdropFilter: "blur(12px)",
});
export const content = style({ minHeight: "calc(100vh - 58px)" });
export const editorPage = style({
  vars: { "--madoc-editor-max-width": "760px" },
  width: "min(var(--madoc-editor-max-width), calc(100% - 48px))",
  margin: "0 auto",
  paddingTop: 46,
});
export const empty = style({
  minHeight: "calc(100vh - 58px)",
  display: "grid",
  placeItems: "center",
  padding: 30,
  textAlign: "center",
});
