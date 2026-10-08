import { workspaceMedia } from "./workspace-layout";
import { style } from "@vanilla-extract/css";
import { touchControls } from "@/styles/interaction.css";

export const shell = style({
  vars: { "--madoc-sidebar-width": "300px", "--madoc-outline-width": "306px" },
  minHeight: "100dvh",
  display: "grid",
  gridTemplateColumns: "var(--madoc-sidebar-width) minmax(0, 1fr)",
  background: "var(--mantine-color-white)",
  "@media": { [workspaceMedia.mobile]: { display: "block" } },
});
export const shellWithOutline = style({
  gridTemplateColumns:
    "var(--madoc-sidebar-width) minmax(0, 1fr) var(--madoc-outline-width)",
  "@media": {
    [workspaceMedia.compact]: {
      gridTemplateColumns: "var(--madoc-sidebar-width) minmax(0, 1fr)",
    },
  },
});
export const sidebar = style({
  height: "100dvh",
  position: "sticky",
  top: 0,
  display: "flex",
  flexDirection: "column",
  background: "var(--mantine-color-gray-0)",
  borderRight: "1px solid var(--mantine-color-gray-2)",
  padding: "16px 14px 12px",
  gap: 16,
  overflow: "hidden",
  "@media": { [workspaceMedia.mobile]: { display: "none" } },
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
  fontWeight: 650,
  letterSpacing: 0,
});
export const brandMark = style({
  width: 22,
  height: 22,
  display: "block",
  flexShrink: 0,
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
  alignItems: "stretch",
});
export const shortcutKey = style({
  padding: "2px 5px",
  border: "1px solid var(--mantine-color-gray-3)",
  borderRadius: 5,
  color: "var(--mantine-color-dimmed)",
  background: "var(--mantine-color-gray-0)",
  fontSize: 11,
  lineHeight: 1.3,
});
export const sidebarSearch = style({
  width: "100%",
  justifyContent: "flex-start",
  fontWeight: 400,
  color: "var(--mantine-color-dimmed)",
  borderColor: "var(--mantine-color-gray-2)",
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
  color: "var(--mantine-color-gray-7)",
  fontSize: 14,
  selectors: { "&:hover": { background: "var(--mantine-color-gray-1)" } },
});
export const workspaceButton = style({
  width: "100%",
  padding: "10px 10px",
  minHeight: 64,
  border: "1px solid transparent",
  borderRadius: "var(--mantine-radius-md)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
  selectors: {
    "&:focus-visible": {
      outline: "2px solid var(--mantine-primary-color-filled)",
      outlineOffset: 2,
    },
    "&:hover": {
      background: "var(--mantine-color-white)",
      borderColor: "var(--mantine-color-gray-2)",
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
  gap: 6,
  paddingBottom: 8,
});
export const navSectionGroup = style({ flexShrink: 0 });
export const mobileNavigation = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
  flexDirection: "column",
  marginTop: 4,
});
export const navSectionHeader = style({
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 6px 0 2px",
});
export const navSectionToggle = style({
  "@media": { [touchControls]: { height: 44 } },
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 8,
  height: 32,
  color: "var(--mantine-color-gray-6)",
  textAlign: "left",
  fontSize: 12,
  fontWeight: 600,
});
export const navSectionChevron = style({
  display: "flex",
  alignItems: "center",
  opacity: 0,
  visibility: "hidden",
  transition: "opacity 120ms ease",
  "@media": { "(hover: none)": { opacity: 1, visibility: "visible" } },
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
export const tree = style({ paddingTop: 4 });
export const treeLink = style({
  flex: 1,
  minWidth: 0,
  height: "100%",
  display: "flex",
  alignItems: "center",
  gap: 8,
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
  "@media": { [touchControls]: { height: 44 } },
  width: "100%",
  height: 32,
  display: "flex",
  alignItems: "center",
  gap: 7,
  border: 0,
  borderRadius: 7,
  background: "transparent",
  color: "var(--mantine-color-gray-7)",
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
export const treeRowActions = style({
  display: "flex",
  alignItems: "center",
  flexShrink: 0,
  gap: 7,
  // Keep the title width and keyboard focus order stable when icons are hidden.
  opacity: 0,
  selectors: {
    [`${treeRow}:hover &`]: { opacity: 1 },
    [`${treeRow}:focus-within &`]: { opacity: 1 },
    "&:has([data-expanded])": { opacity: 1 },
  },
  "@media": {
    [touchControls]: { opacity: 1 },
    "(hover: none)": { opacity: 1 },
  },
});
export const treeIcon = style({ flexShrink: 0 });
export const rowTitle = style({
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
export const main = style({
  minWidth: 0,
  minHeight: "100dvh",
  background: "var(--mantine-color-white)",
});
export const outlinePanel = style({
  minWidth: 0,
  minHeight: "var(--madoc-frame-height)",
  height: "var(--madoc-frame-height)",
  position: "sticky",
  top: "var(--madoc-header-height)",
  display: "flex",
  flexDirection: "column",
  padding: "14px 14px 20px",
  borderLeft: "1px solid var(--mantine-color-gray-2)",
  background: "var(--mantine-color-white)",
  overflow: "hidden",
  overscrollBehavior: "contain",
  "@media": { [workspaceMedia.compact]: { display: "none" } },
});
export const content = style({ minHeight: "var(--madoc-frame-height)" });
export const editorPage = style({
  vars: { "--madoc-editor-max-width": "760px" },
  width: "min(var(--madoc-editor-max-width), calc(100% - 48px))",
  margin: "0 auto",
  paddingTop: 46,
});
// `place-items: center` sizes this to the grid's single implicit track, so a
// very long single-word workspace name can push the column wider than the
// viewport. Cap the measure and keep the overflow inside the box.
// A column flow is required: the first-run note stacks under the empty state
// as a sibling, and a grid track would centre them as one block.
export const empty = style({
  minHeight: "var(--madoc-frame-height)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 30,
  textAlign: "center",
  overflowWrap: "anywhere",
});
