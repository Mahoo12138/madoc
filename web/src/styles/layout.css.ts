import { globalStyle } from '@vanilla-extract/css';

// The page frame has one source. DESIGN.md names this file as the only place
// that may declare header height, content widths and gutters; pages consume the
// variables instead of repeating pixel values.
globalStyle(':root', {
  vars: {
    '--madoc-header-height': '58px',
    // 100dvh rather than 100vh: mobile browser chrome collapses while scrolling
    // and a fixed-height frame would clip the last row of controls.
    '--madoc-view-height': '100dvh',
    '--madoc-frame-height': 'calc(100dvh - var(--madoc-header-height))',
    '--madoc-content-width': '760px',
    '--madoc-grid-width': '1120px',
    '--madoc-gutter-page': '40px',
    '--madoc-gutter-page-mobile': '20px',
    '--madoc-gutter-workspace': '24px',
    '--madoc-gutter-workspace-mobile': '16px',
    // Navigation columns (sidebar tree + document outline) share one rhythm.
    // The two side panels are adjacent grid columns of the workspace shell, so
    // their gutter, row inset and indent step are declared once here and
    // consumed by both features — the left and right columns stay in step
    // instead of drifting apart value by value.
    // The 6px row inset is the second off-scale alignment value in the system
    // (after the sidebar's 4px vertical padding): navigation panels have the
    // tightest density budget, and the on-scale 10px would push a level-1 tree
    // title to 63px and an outline heading to 48px — the opposite of
    // "content first". 12px is the panel's breath, 6px the row's.
    '--madoc-gutter-panel': '12px',
    '--madoc-inset-row': '6px',
    '--madoc-indent-step': '16px',
  },
});