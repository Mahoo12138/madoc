import { style } from '@vanilla-extract/css';

export const shell = style({ vars: { '--madoc-sidebar-width': '280px' }, minHeight: '100vh', display: 'grid', gridTemplateColumns: 'var(--madoc-sidebar-width) minmax(0, 1fr)', background: 'var(--mantine-color-white)', '@media': { '(max-width: 760px)': { display: 'block' } } });
export const sidebar = style({ height: '100vh', position: 'sticky', top: 0, display: 'flex', flexDirection: 'column', background: 'var(--mantine-color-gray-0)', borderRight: '1px solid var(--mantine-color-gray-2)', padding: 12, overflow: 'hidden', '@media': { '(max-width: 760px)': { display: 'none' } } });
export const mobileMenu = style({ display: 'none', '@media': { '(max-width: 760px)': { display: 'block' } } });
export const workspaceButton = style({ width: '100%', padding: '8px 9px', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: 0, background: 'transparent', cursor: 'pointer', selectors: { '&:hover': { background: 'var(--mantine-color-gray-1)' } } });
export const tree = style({ flex: 1, overflow: 'auto', paddingTop: 10 });
export const treeRow = style({ width: '100%', height: 34, display: 'flex', alignItems: 'center', gap: 7, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--mantine-color-dark-6)', cursor: 'pointer', fontSize: 14, textAlign: 'left', selectors: { '&:hover': { background: 'var(--mantine-color-gray-1)' }, '&[data-active="true"]': { color: 'var(--mantine-color-blue-7)', background: 'var(--mantine-color-blue-0)', fontWeight: 600 } } });
export const rowTitle = style({ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' });
export const main = style({ minWidth: 0, minHeight: '100vh', background: 'var(--mantine-color-white)' });
export const topbar = style({ height: 58, position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 22px', borderBottom: '1px solid var(--mantine-color-gray-2)', background: 'color-mix(in srgb, var(--mantine-color-white) 93%, transparent)', backdropFilter: 'blur(12px)' });
export const content = style({ minHeight: 'calc(100vh - 58px)' });
export const editorPage = style({ vars: { '--madoc-editor-max-width': '760px' }, width: 'min(var(--madoc-editor-max-width), calc(100% - 48px))', margin: '0 auto', paddingTop: 46 });
export const empty = style({ minHeight: 'calc(100vh - 58px)', display: 'grid', placeItems: 'center', padding: 30, textAlign: 'center' });
