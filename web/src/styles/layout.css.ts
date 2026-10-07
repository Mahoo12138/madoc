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
  },
});