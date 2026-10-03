import { style } from "@vanilla-extract/css";
import { touchControls } from "@/styles/interaction.css";

export const panel = style({ padding: "2px 0 4px" });
export const detailedPanel = style({
  padding: "var(--mantine-spacing-sm) 4px",
});
export const row = style({
  display: "flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  minHeight: 32,
  padding: "0 4px",
  borderRadius: 7,
  color: "var(--mantine-color-gray-7)",
  selectors: {
    "&:hover": { background: "var(--mantine-color-gray-1)" },
    "&:focus-within": { background: "var(--mantine-color-gray-1)" },
  },
  "@media": { [touchControls]: { minHeight: 44 } },
});
export const link = style({
  flex: 1,
  minWidth: 0,
  minHeight: 32,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "6px 4px",
  borderRadius: "inherit",
  overflowWrap: "anywhere",
  selectors: {
    "&:focus-visible": {
      outline: "2px solid var(--mantine-primary-color-filled)",
      outlineOffset: -2,
    },
  },
  "@media": { [touchControls]: { minHeight: 44 } },
});
export const title = style({ lineHeight: 1.4 });
export const icon = style({ flexShrink: 0 });
export const favoriteAction = style({
  flexShrink: 0,
  opacity: 0,
  pointerEvents: "none",
  selectors: {
    [`${row}:hover &`]: { opacity: 1, pointerEvents: "auto" },
    "&:focus-visible": { opacity: 1, pointerEvents: "auto" },
  },
  "@media": {
    [touchControls]: { opacity: 1, pointerEvents: "auto" },
    "(hover: none)": { opacity: 1, pointerEvents: "auto" },
  },
});
