import { keyframes, style } from '@vanilla-extract/css';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';

/**
 * The card appears once, in a centred column, and asks to be read. A short
 * rise-and-fade is enough to draw the eye to it. Only transform and opacity
 * animate, so this stays on the compositor and cannot shift layout.
 */
const enter = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'none' },
});

/**
 * The card reads as a note slipped under the empty state, not a banner: gray
 * paper instead of a wash of blue, hairline border instead of shadow, and a
 * rhythm tight enough to stay out of the title's way.
 */
export const guide = style({
  width: 'min(100%, 420px)',
  margin: '20px auto 0',
  padding: '16px 20px',
  textAlign: 'left',
  borderRadius: 'var(--mantine-radius-md)',
  border: '1px solid var(--mantine-color-gray-2)',
  background: 'var(--mantine-color-gray-0)',
  animation: `${enter} 150ms ease-out`,
  '@media': {
    [workspaceMedia.mobile]: { padding: '16px' },
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const headingRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginBottom: 10,
});

export const heading = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.5,
});

export const dismiss = style({
  flexShrink: 0,
  marginRight: -6,
});

export const list = style({
  display: 'grid',
  gap: 10,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const item = style({
  display: 'grid',
  gridTemplateColumns: '14px auto minmax(0, 1fr)',
  alignItems: 'baseline',
  gap: 10,
  fontSize: 14,
  lineHeight: 1.6,
});

export const icon = style({
  color: 'var(--mantine-color-gray-5)',
  alignSelf: 'center',
});

export const label = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 10,
  color: 'var(--mantine-color-text)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

export const hint = style({
  padding: '0 6px',
  borderRadius: 'var(--mantine-radius-xs)',
  border: '1px solid var(--mantine-color-gray-3)',
  background: 'var(--mantine-color-body)',
  color: 'var(--mantine-color-dimmed)',
  // Label step of the type scale; the key cap is a structural label, not body
  // text, and 11px was a size invented for this component.
  fontSize: 12,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
});

export const detail = style({
  color: 'var(--mantine-color-dimmed)',
  overflowWrap: 'anywhere',
});

export const footnote = style({
  margin: '16px 0 0',
  paddingTop: 10,
  borderTop: '1px solid var(--mantine-color-gray-2)',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
  textWrap: 'balance',
});