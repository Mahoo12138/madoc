import { style } from "@vanilla-extract/css";
import { touchControls } from "@/styles/interaction.css";

const compact = "(max-width: 1180px)";
export const header = style({
  minHeight: 58,
  position: "sticky",
  top: 0,
  zIndex: 10,
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "7px 22px",
  borderBottom: "1px solid var(--mantine-color-gray-2)",
  background: "var(--mantine-color-body)",
  "@media": { [compact]: { gap: 4, paddingInline: 8 } },
});
export const identity = style({
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
});
export const typeIcon = style({
  flexShrink: 0,
  "@media": { [compact]: { display: "none" } },
});
export const names = style({
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 10,
  "@media": {
    [compact]: { flexDirection: "column", alignItems: "stretch", gap: 0 },
  },
});
export const workspaceName = style({
  minWidth: 0,
  flexShrink: 2,
  color: "var(--mantine-color-gray-7)",
  "@media": { [compact]: { fontSize: "var(--mantine-font-size-xs)" } },
});
export const itemName = style({ minWidth: 0, flexShrink: 1 });
export const separator = style({
  flexShrink: 0,
  color: "var(--mantine-color-gray-7)",
  "@media": { [compact]: { display: "none" } },
});
export const actions = style({
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexShrink: 0,
});
export const desktopActions = style([
  actions,
  {
    "@media": { [compact]: { display: "none" } },
  },
]);
export const compactActions = style([
  actions,
  {
    display: "none",
    gap: 4,
    "@media": { [compact]: { display: "flex" } },
  },
]);
export const compactAction = style({
  minWidth: 44,
  minHeight: 44,
  flexShrink: 0,
});
export const navigationToggle = style([
  compactAction,
  {
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    "@media": { "(max-width: 760px)": { display: "inline-flex" } },
  },
]);
export const menu = style({
  maxHeight: "calc(100dvh - 76px)",
  overflowY: "auto",
});
export const menuItem = style({
  minHeight: 44,
  "@media": { [touchControls]: { fontSize: "var(--mantine-font-size-md)" } },
});
