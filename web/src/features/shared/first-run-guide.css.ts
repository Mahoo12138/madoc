import { style } from '@vanilla-extract/css';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';

/**
 * The card reads as a note slipped under the empty state, not a banner: gray
 * paper instead of a wash of blue, hairline border instead of shadow, and a
 * rhythm tight enough to stay out of the title's way.
 */
export const guide = style({
  width: 'min(100%, 420px)',
  margin: '28px auto 0',
  padding: '14px 16px 12px',
  textAlign: 'left',
  borderRadius: 'var(--mantine-radius-md)',
  border: '1px solid var(--mantine-color-gray-2)',
  background: 'var(--mantine-color-gray-0)',
  '@media': { [workspaceMedia.mobile]: { marginTop: 20, padding: '12px 12px 10px' } },
});

export const headingRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginBottom: 8,
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
  gap: 6,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const item = style({
  display: 'grid',
  gridTemplateColumns: '14px auto minmax(0, 1fr)',
  alignItems: 'baseline',
  gap: 8,
  fontSize: 13,
  lineHeight: 1.6,
});

export const icon = style({
  color: 'var(--mantine-color-gray-5)',
  alignSelf: 'center',
});

export const label = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  color: 'var(--mantine-color-text)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
});

export const hint = style({
  padding: '0 5px',
  borderRadius: 'var(--mantine-radius-xs)',
  border: '1px solid var(--mantine-color-gray-3)',
  background: 'var(--mantine-color-body)',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 11,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
});

export const detail = style({
  color: 'var(--mantine-color-dimmed)',
  overflowWrap: 'anywhere',
});

export const footnote = style({
  margin: '10px 0 0',
  paddingTop: 8,
  borderTop: '1px solid var(--mantine-color-gray-2)',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 12,
  lineHeight: 1.6,
});