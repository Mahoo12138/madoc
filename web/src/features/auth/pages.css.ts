import { globalStyle, keyframes, style } from '@vanilla-extract/css';

// Auth pages are the product's front door: same paper-gray desk and
// letter-paper blue as the workspace. Two slow light drifts keep the
// otherwise empty page alive; motion stays on compositor properties
// (transform / opacity) and stops entirely under prefers-reduced-motion.
const driftA = keyframes({
  from: { transform: 'translate3d(0, 0, 0) scale(1)' },
  to: { transform: 'translate3d(6vmax, 4vmax, 0) scale(1.1)' },
});
const driftB = keyframes({
  from: { transform: 'translate3d(0, 0, 0) scale(1.08)' },
  to: { transform: 'translate3d(-5vmax, -4vmax, 0) scale(1)' },
});
const enter = keyframes({
  from: { opacity: 0, transform: 'translateY(6px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const page = style({
  minHeight: '100dvh',
  display: 'grid',
  placeItems: 'center',
  padding: 'var(--madoc-gutter-page)',
  background: 'var(--mantine-color-gray-0)',
  '@media': {
    '(max-width: 760px)': { padding: 'var(--madoc-gutter-page-mobile)' },
  },
});

// Fixed backdrop: oversized glows never extend the scrollable area.
export const decor = style({
  position: 'fixed',
  inset: 0,
  zIndex: 0,
  overflow: 'hidden',
  pointerEvents: 'none',
});

const glowBase = {
  position: 'absolute',
  borderRadius: '50%',
  willChange: 'transform',
  '@media': { '(prefers-reduced-motion: reduce)': { animation: 'none' } },
} as const;

export const glowA = style({
  ...glowBase,
  width: '56vmax',
  height: '56vmax',
  top: '-20vmax',
  left: '-16vmax',
  background:
    'radial-gradient(circle, color-mix(in srgb, var(--mantine-color-blue-2) 70%, transparent) 0%, transparent 68%)',
  animation: `${driftA} 28s ease-in-out infinite alternate`,
});

export const glowB = style({
  ...glowBase,
  width: '48vmax',
  height: '48vmax',
  right: '-14vmax',
  bottom: '-18vmax',
  background:
    'radial-gradient(circle, color-mix(in srgb, var(--mantine-color-blue-1) 85%, transparent) 0%, transparent 66%)',
  animation: `${driftB} 34s ease-in-out infinite alternate`,
});

export const panel = style({
  position: 'relative',
  zIndex: 1,
  width: '100%',
  maxWidth: 400,
  display: 'flex',
  flexDirection: 'column',
});

export const brand = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  marginBottom: 32,
});
export const mark = style({ width: 32, height: 32, display: 'block', flexShrink: 0 });
// Brand wordmark scale (650, 21px) from DESIGN.md; display text stays "Madoc".
export const wordmark = style({
  fontSize: 21,
  fontWeight: 650,
  lineHeight: 1.2,
  letterSpacing: '-0.01em',
});

// White card on the paper-gray desk: hierarchy by tone layering and a 1px
// cold-gray border, no static shadow (Flat-by-Default Rule).
export const card = style({
  background: 'var(--mantine-color-white)',
  border: '1px solid var(--mantine-color-gray-2)',
  borderRadius: 'var(--mantine-radius-lg)',
  padding: 32,
  animation: `${enter} 180ms ease-out`,
  '@media': {
    '(max-width: 760px)': { padding: 20 },
    '(prefers-reduced-motion: reduce)': { animation: 'none' },
  },
});

export const heading = style({
  margin: 0,
  fontSize: 20,
  fontWeight: 650,
  lineHeight: 1.4,
  textWrap: 'balance',
});

export const lead = style({
  margin: '10px 0 0',
  fontSize: 14,
  lineHeight: 1.5,
  color: 'var(--mantine-color-dimmed)',
  textWrap: 'balance',
});

// Input state vocabulary, scoped to the auth card: Mantine already covers
// focus / disabled / error natively; these rules add hover affordance, a
// soft focus ring and a calmer disabled surface.
const input = `${card} :where(.mantine-TextInput-input, .mantine-PasswordInput-input)`;

globalStyle(`${input}:hover:not(:disabled):not(:focus):not([data-error])`, {
  borderColor: 'var(--mantine-color-gray-4)',
});
globalStyle(`${input}:focus`, {
  borderColor: 'var(--mantine-primary-color-filled)',
  boxShadow:
    '0 0 0 3px color-mix(in srgb, var(--mantine-primary-color-filled) 14%, transparent)',
});
globalStyle(`${input}[data-error]:focus`, {
  boxShadow:
    '0 0 0 3px color-mix(in srgb, var(--mantine-color-red-filled) 14%, transparent)',
});
globalStyle(`${input}:disabled`, {
  background: 'var(--mantine-color-gray-1)',
  color: 'var(--mantine-color-dimmed)',
});
