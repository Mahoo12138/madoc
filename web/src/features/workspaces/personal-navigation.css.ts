import { style } from "@vanilla-extract/css";
export const panel = style({ padding: "var(--mantine-spacing-sm) 4px" });
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: "var(--mantine-spacing-xs)",
});
export const link = style({
  flex: 1,
  minWidth: 0,
  padding: "var(--mantine-spacing-sm) 4px",
  overflowWrap: "anywhere",
  selectors: { "&:hover": { background: "var(--mantine-color-gray-1)" } },
});
