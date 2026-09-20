import { style } from '@vanilla-extract/css';

export const page = style({ width: 'min(760px, calc(100% - 48px))', margin: '0 auto', padding: '40px 0 100px' });
export const title = style({ border: 0, outline: 0, width: '100%', padding: 0, background: 'transparent', color: 'var(--mantine-color-dark-9)', fontSize: 38, fontWeight: 700, lineHeight: 1.15, letterSpacing: '-0.032em' });
export const meta = style({ minHeight: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, color: 'var(--mantine-color-gray-6)' });
export const editor = style({ marginTop: 10 });
