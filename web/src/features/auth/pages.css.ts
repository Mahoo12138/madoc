import { style } from '@vanilla-extract/css';

export const page = style({ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 });
export const panel = style({ width: '100%', maxWidth: 420 });
export const brand = style({ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 30 });
export const mark = style({ width: 30, height: 30, display: 'block', flexShrink: 0 });
