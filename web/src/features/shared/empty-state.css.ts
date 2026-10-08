import { style } from '@vanilla-extract/css';
import { workspaceMedia } from '@/features/workspaces/workspace-layout';

/**
 * Empty states follow the desk metaphor: the icon sits on a wash of letter
 * blue, the title reads as a caption on the page, and nothing else competes
 * for attention. Static surfaces stay flat — no shadow until an action lifts.
 */

const frame = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  overflowWrap: 'anywhere',
});

/**
 * Page padding exists for a standalone empty page. When the empty state is
 * centred inside an already-framed shell — and may have a note stacked under
 * it — `flush` drops the padding so the shell owns the vertical rhythm.
 */
const framePage = style([
  frame,
  {
    padding: '72px 24px 80px',
    '@media': { [workspaceMedia.mobile]: { padding: '40px 16px' } },
  },
]);

const framePageFlush = style([frame, { padding: 0 }]);

const frameSection = style([
  frame,
  {
    alignItems: 'flex-start',
    textAlign: 'left',
    padding: '28px 20px',
    borderRadius: 'var(--mantine-radius-md)',
    background: 'var(--mantine-color-gray-0)',
    '@media': { [workspaceMedia.mobile]: { padding: '20px 16px' } },
  },
]);

const frameInline = style([
  frame,
  {
    alignItems: 'flex-start',
    textAlign: 'left',
    // The sidebar rail is dense: an inline empty state reads as a caption
    // under its header, so it must not add the block padding a section gets.
    padding: '4px 8px',
  },
]);

/** The blue wash is the only place letter blue appears without being an action. */
const plate = style({
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
  width: 64,
  height: 64,
  borderRadius: 'var(--mantine-radius-md)',
  background: 'var(--mantine-color-blue-0)',
  color: 'var(--mantine-color-blue-6)',
  marginBottom: 20,
});

const plateSection = style({
  width: 40,
  height: 40,
  marginBottom: 14,
  borderRadius: 'var(--mantine-radius-sm)',
  color: 'var(--mantine-color-gray-5)',
  background: 'var(--mantine-color-gray-1)',
});

const icon = style({
  display: 'block',
});

const titlePage = style({
  margin: 0,
  fontSize: 20,
  fontWeight: 650,
  lineHeight: 1.4,
  textWrap: 'balance',
});

const titleSection = style({
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1.5,
});

const description = style({
  maxWidth: 360,
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.75,
  textWrap: 'pretty',
});

const descriptionSection = style({
  margin: '6px 0 0',
  fontSize: 13,
  lineHeight: 1.65,
});

/** One primary action per screen: the rest stay quiet, so actions sit left of centre. */
const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
  marginTop: 22,
});

const actionsSection = style({
  marginTop: 16,
});

/** Inline variants have no plate; the heading simply carries the message. */
const inlineTitle = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.6,
});

const inlineDescription = style({
  margin: '4px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 13,
  lineHeight: 1.6,
});

const inlineActions = style({
  marginTop: 10,
});

/** Permission states must never look like an invitation to try again. */
const restricted = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 13,
  lineHeight: 1.65,
});

export const emptyState = {
  page: framePage,
  pageFlush: framePageFlush,
  section: frameSection,
  inline: frameInline,
  plate,
  plateSection,
  icon,
  titlePage,
  titleSection,
  description,
  descriptionSection,
  actions,
  actionsSection,
  inlineTitle,
  inlineDescription,
  inlineActions,
  restricted,
};