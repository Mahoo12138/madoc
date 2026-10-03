import { globalStyle, style } from '@vanilla-extract/css';
import { touchControls } from '@/styles/interaction.css';
import { workspaceMedia } from './workspace-layout';

export const page = style({
  minWidth: 0,
  minHeight: '100dvh',
  background: 'var(--mantine-color-gray-0)',
});
export const headerInner = style({
  maxWidth: 1120,
  margin: '0 auto',
  padding: '12px 40px',
  minHeight: 72,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 20,
  '@media': { [workspaceMedia.mobile]: { padding: '8px 20px', minHeight: 70 } },
});
export const brand = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: 0,
});
export const brandMark = style({
  width: 22,
  height: 22,
  display: 'block',
});
export const account = style({ width: 50, flexShrink: 0 });
export const intro = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: 16,
});
export const createButton = style({
  flexShrink: 0,
  minHeight: 40,
  '@media': { [touchControls]: { minHeight: 44, paddingInline: 12 } },
});
export const content = style({
  maxWidth: 1120,
  margin: '0 auto',
  padding: '40px 40px 80px',
  '@media': { [workspaceMedia.mobile]: { padding: '28px 20px 56px' } },
});
export const titleRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
});
export const pageTitle = style({
  margin: 0,
  fontSize: 30,
  fontWeight: 600,
  lineHeight: 1.4,
  letterSpacing: 0,
  '@media': { [workspaceMedia.mobile]: { fontSize: 24 } },
});
export const count = style({
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  fontVariantNumeric: 'tabular-nums',
});
export const lead = style({
  margin: '12px 0 24px',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.6,
});
export const notice = style({ marginBottom: 24 });
export const list = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  alignItems: 'start',
  gap: 16,
  listStyle: 'none',
  margin: 0,
  padding: 0,
  '@media': {
    '(max-width: 1023px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
    [workspaceMedia.mobile]: { gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 },
  },
});
export const listItem = style({ minWidth: 0 });
const card = style({
  display: 'grid',
  gridTemplateColumns: '40px minmax(0, 1fr) 16px',
  alignContent: 'center',
  alignItems: 'start',
  gap: 16,
  minWidth: 0,
  minHeight: 104,
  padding: 20,
  borderRadius: 'var(--mantine-radius-md)',
  background: 'var(--mantine-color-body)',
  '@media': {
    [workspaceMedia.mobile]: { minHeight: 96, padding: 16, gap: 12 },
  },
});
export const workspaceLink = style([
  card,
  {
    color: 'var(--mantine-color-text)',
    textDecoration: 'none',
    transition:
      'background-color 180ms ease, box-shadow 180ms ease, transform 180ms ease',
    selectors: {
      '&:focus-visible': {
        outline: '2px solid var(--mantine-primary-color-filled)',
        outlineOffset: 3,
        background: 'var(--mantine-color-blue-0)',
      },
      '&:active': {
        transform: 'translateY(1px)',
        background: 'var(--mantine-color-blue-0)',
      },
    },
    '@media': {
      '(hover: hover) and (pointer: fine)': {
        selectors: {
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow:
              '0 8px 24px color-mix(in srgb, var(--mantine-color-gray-9) 8%, transparent)',
          },
          '&:hover:active': { transform: 'translateY(1px)' },
        },
      },
      '(prefers-reduced-motion: reduce)': {
        transition: 'none',
        selectors: {
          '&:hover, &:active, &:hover:active': { transform: 'none' },
        },
      },
    },
  },
]);
export const workspaceMark = style({ flexShrink: 0, marginTop: 4 });
export const cardIdentity = style({ display: 'grid', gap: 4, minWidth: 0 });
export const workspaceName = style({
  minWidth: 0,
  margin: 0,
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  textWrap: 'pretty',
});
export const workspaceRole = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 13,
  lineHeight: 1.5,
});
export const cardArrow = style({
  flexShrink: 0,
  marginTop: 4,
  color: 'var(--mantine-color-dimmed)',
});
export const empty = style({
  padding: '72px 24px 80px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  '@media': { [workspaceMedia.mobile]: { padding: '40px 0' } },
});
export const emptyMark = style({
  display: 'grid',
  placeItems: 'center',
  width: 64,
  height: 64,
  borderRadius: 'var(--mantine-radius-md)',
  background: 'var(--mantine-color-blue-0)',
  color: 'var(--mantine-color-blue-6)',
  marginBottom: 20,
});
export const emptyTitle = style({
  margin: 0,
  fontSize: 20,
  fontWeight: 650,
  lineHeight: 1.4,
});
export const emptyDescription = style({
  maxWidth: 340,
  margin: '10px 0 24px',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.7,
  textWrap: 'balance',
});
export const loadingCard = style([card]);
export const loadingIdentity = style({
  display: 'grid',
  gap: 8,
  minWidth: 0,
});
globalStyle(`${loadingCard} .mantine-Skeleton-root::after`, {
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
});
export const dialogActions = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8,
});
