import { style } from '@vanilla-extract/css';

export const page = style({ minHeight: '100vh', padding: '36px clamp(20px, 5vw, 72px)' });
export const header = style({ maxWidth: 1040, margin: '0 auto 34px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 });
export const grid = style({ maxWidth: 1040, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 });
export const workspaceCard = style({ cursor: 'pointer', transition: 'transform 140ms ease, box-shadow 140ms ease', selectors: { '&:hover': { transform: 'translateY(-2px)', boxShadow: 'var(--mantine-shadow-md)' } } });
