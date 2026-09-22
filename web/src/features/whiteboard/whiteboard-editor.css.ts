import { style } from '@vanilla-extract/css';

export const root = style({ height: 'calc(100vh - 58px)', position: 'relative', overflow: 'hidden' });
export const status = style({ position: 'absolute', zIndex: 5, top: 12, right: 78, display: 'flex', gap: 6, alignItems: 'center' });

export const failure = style({ position: 'absolute', zIndex: 6, top: 64, left: 16, right: 16, maxWidth: 480 });
