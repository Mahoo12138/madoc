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
 *
 * The horizontal padding consumes the page gutter tokens rather than
 * repeating pixel values: DESIGN.md makes layout.css.ts the single source for
 * gutters, and an empty page should align with the content around it.
 */
const framePage = style([
  frame,
  {
    padding: '64px var(--madoc-gutter-page)',
    '@media': {
      [workspaceMedia.mobile]: {
        padding: '32px var(--madoc-gutter-page-mobile)',
      },
    },
  },
]);

const framePageFlush = style([frame, { padding: 0 }]);

const frameSection = style([
  frame,
  {
    alignItems: 'flex-start',
    textAlign: 'left',
    // 20px is the documented card interior; this variant is always the
    // contents of a panel, so it should never invent its own padding.
    padding: '20px',
    borderRadius: 'var(--mantine-radius-md)',
    background: 'var(--mantine-color-gray-0)',
  },
]);

const frameInline = style([
  frame,
  {
    alignItems: 'flex-start',
    textAlign: 'left',
    // The sidebar rail is dense: an inline empty state reads as a caption
    // under its header, so it must not add the block padding a section gets.
    // 8px keeps the text on the same left edge as the tree rows it follows.
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
  marginBottom: 12,
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
  // Title step of the type scale, not a size invented for this component.
  fontSize: 16,
  fontWeight: 600,
  lineHeight: 1.5,
});

const description = style({
  maxWidth: 360,
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.75,
  // Chinese has no hyphenation, so an unbalanced wrap strands a two-character
  // tail on its own line. Balancing evens the lines instead.
  textWrap: 'balance',
});

const descriptionSection = style({
  margin: '10px 0 0',
  fontSize: 14,
  lineHeight: 1.65,
});

/** One primary action per screen: the rest stay quiet, so actions sit left of centre. */
const actions = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  marginTop: 20,
});

const actionsSection = style({
  marginTop: 16,
});

/**
 * Inline variants have no plate; the heading simply carries the message.
 * 14px matches the nav rows this caption sits among, and keeps text off the
 * sub-14px sizes that are only ever allowed for structural labels.
 */
const inlineTitle = style({
  margin: 0,
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.6,
});

const inlineDescription = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
  lineHeight: 1.6,
});

const inlineActions = style({
  marginTop: 10,
});

/** Permission states must never look like an invitation to try again. */
const restricted = style({
  margin: '10px 0 0',
  color: 'var(--mantine-color-dimmed)',
  fontSize: 14,
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