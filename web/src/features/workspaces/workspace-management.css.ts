import { globalStyle, style } from "@vanilla-extract/css";
import { touchControls } from "@/styles/interaction.css";
import { workspaceMedia } from "./workspace-layout";

export const pageMain = style({
  display: "flex",
  flexDirection: "column",
  height: "100dvh",
  overflow: "hidden",
});
export const sidebar = style({ gap: 14 });
export const dialogContent = style({});

globalStyle(
  `${pageMain} .mantine-Button-root, ${pageMain} .mantine-Tabs-tab, ${pageMain} .mantine-Select-input, ${pageMain} .mantine-TextInput-input`,
  { "@media": { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${pageMain} .mantine-ActionIcon-root`, {
  "@media": { [touchControls]: { minWidth: 44, minHeight: 44 } },
});
globalStyle(
  `${dialogContent} .mantine-Button-root, ${dialogContent} .mantine-Select-input, ${dialogContent} .mantine-TextInput-input, ${dialogContent} .mantine-Modal-close`,
  { "@media": { [touchControls]: { minHeight: 44 } } },
);
globalStyle(`${dialogContent} .mantine-ActionIcon-root`, {
  "@media": { [touchControls]: { minWidth: 44, minHeight: 44 } },
});

export const pageHeader = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 58,
  flexShrink: 0,
  padding: "0 40px",
  borderBottom: "1px solid var(--mantine-color-gray-2)",
  background: "var(--mantine-color-body)",
  "@media": { [workspaceMedia.mobile]: { padding: "0 20px", gap: 8 } },
});
export const headerIdentity = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  flex: 1,
  minWidth: 0,
});
export const headerTitle = style({
  margin: 0,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--mantine-color-text)",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.35,
});
export const headerSeparator = style({
  color: "var(--mantine-color-gray-5)",
  paddingInline: 4,
});
export const headerWorkspace = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--mantine-color-dimmed)",
  fontSize: 13,
  "@media": { [workspaceMedia.mobile]: { display: "none" } },
});
export const desktopBack = style({
  "@media": { [workspaceMedia.mobile]: { display: "none" } },
});
export const mobileNavigationToggle = style({
  display: "none",
  alignItems: "center",
  justifyContent: "center",
  "@media": {
    [workspaceMedia.mobile]: {
      display: "inline-flex",
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const mobileBack = style({
  display: "none",
  "@media": {
    [workspaceMedia.mobile]: {
      display: "inline-flex",
      minWidth: 44,
      minHeight: 44,
    },
  },
});
export const sidebarHeading = style({
  padding: "12px 10px 2px",
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  fontWeight: 600,
});
export const navigation = style({
  display: "flex",
  flex: 1,
  minHeight: 0,
  flexDirection: "column",
  gap: 4,
  overflowY: "auto",
  overscrollBehavior: "contain",
});

export const navButton = style({
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  minHeight: 40,
  padding: "0 12px",
  border: 0,
  borderRadius: "var(--mantine-radius-sm)",
  background: "transparent",
  color: "var(--mantine-color-gray-7)",
  font: "inherit",
  fontSize: 14,
  textAlign: "left",
  cursor: "pointer",
  fontWeight: 500,
  transition: "background-color 140ms ease, color 140ms ease",
  selectors: {
    "&:hover:not(:disabled)": { background: "var(--mantine-color-gray-1)" },
    "&:focus-visible": {
      outline: "2px solid var(--mantine-primary-color-filled)",
      outlineOffset: -2,
    },
    "&:disabled": { cursor: "not-allowed", opacity: 0.55 },
  },
  "@media": {
    [touchControls]: { minHeight: 44 },
    "(prefers-reduced-motion: reduce)": { transition: "none" },
  },
});

export const navButtonActive = style({
  color: "var(--mantine-color-blue-7)",
  background: "var(--mantine-color-blue-0)",
  fontWeight: 600,
  selectors: {
    "&:hover:not(:disabled)": { background: "var(--mantine-color-blue-1)" },
  },
});

export const mobileDrawerBody = style({
  display: "flex",
  flexDirection: "column",
  minHeight: "calc(100dvh - 66px)",
  gap: 16,
});
export const mobileNavigationFooter = style({
  display: "flex",
  flexDirection: "column",
  gap: 4,
  marginTop: "auto",
  paddingTop: 12,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});

export const content = style({
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: "44px 40px 72px",
  "@media": {
    [workspaceMedia.mobile]: {
      padding: "28px 20px 72px",
    },
  },
});

export const pane = style({ maxWidth: 760, margin: "0 auto" });
export const pageHeading = style({
  margin: 0,
  color: "var(--mantine-color-text)",
  fontSize: 22,
  fontWeight: 650,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
});
export const lead = style({
  margin: "8px 0 0",
  color: "var(--mantine-color-dimmed)",
  fontSize: 14,
  lineHeight: 1.7,
  maxWidth: "65ch",
});
export const section = style({ marginTop: 32 });
export const sectionHeading = style({
  margin: "0 0 8px",
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.4,
});
export const sectionRule = style({
  marginTop: 30,
  paddingTop: 24,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});
export const dangerRule = style({
  marginTop: 44,
  paddingTop: 24,
  borderTop: "1px solid var(--mantine-color-gray-2)",
});
export const actionRow = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  "@media": {
    [workspaceMedia.mobile]: {
      alignItems: "flex-start",
      flexDirection: "column",
      gap: 16,
    },
  },
});
export const actionText = style({ minWidth: 0 });
export const formActions = style({
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 16,
  flexWrap: "wrap",
});

export const list = style({
  display: "grid",
  gap: 12,
  marginTop: 24,
});
export const listCard = style({
  minWidth: 0,
  padding: 16,
  borderRadius: "var(--mantine-radius-md)",
  background: "var(--mantine-color-gray-0)",
});
export const memberRow = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 16,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)", gap: 12 },
  },
});
export const memberIdentity = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  minWidth: 0,
});
export const memberMeta = style({ minWidth: 0, overflowWrap: "anywhere" });
export const memberAvatar = style({ flexShrink: 0 });
export const memberActions = style({
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
});
export const inviteForm = style({
  padding: "20px 0 24px",
});
export const inviteFields = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 145px",
  gap: 12,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});
export const inviteLink = style({
  display: "flex",
  gap: 8,
  minWidth: 0,
  marginTop: 12,
});
export const statusLine = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  "@media": {
    [workspaceMedia.mobile]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});

export const dayHeading = style({
  margin: "28px 0 12px",
  color: "var(--mantine-color-dimmed)",
  fontSize: 13,
  fontWeight: 600,
});
export const activityList = style({ display: "grid", gap: 12 });
export const activityRow = style([
  listCard,
  {
    display: "grid",
    gridTemplateColumns: "68px minmax(0, 1fr)",
    gap: 16,
    "@media": {
      [workspaceMedia.mobile]: {
        gridTemplateColumns: "52px minmax(0, 1fr)",
        gap: 12,
      },
    },
  },
]);
export const activityMeta = style({ minWidth: 0, overflowWrap: "anywhere" });
export const activityTime = style({
  color: "var(--mantine-color-dimmed)",
  fontSize: 12,
  lineHeight: 1.7,
  fontVariantNumeric: "tabular-nums",
});
export const emptyState = style({ padding: "48px 0", textAlign: "center" });
