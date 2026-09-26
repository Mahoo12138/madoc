import { style } from "@vanilla-extract/css";

// Screen width and input capability are independent: large touchscreens need
// the same hit area as phones, while pointer-only desktop layouts stay dense.
export const touchControls = "(max-width: 760px), (any-pointer: coarse)";
export const touchAction = style({
  flexShrink: 0,
  "@media": {
    [touchControls]: { minWidth: 44, minHeight: 44 },
  },
});
export const touchRow = style({
  "@media": { [touchControls]: { minHeight: 44 } },
});
