import { globalStyle } from '@vanilla-extract/css';

const root = '.milkdown .ProseMirror';
const reference = `${root} sup[data-type="footnote_reference"]`;
const definition = `${root} .madoc-footnote-definition`;

globalStyle(reference, { fontSize: '12px', color: 'var(--mantine-primary-color-filled)', cursor: 'text' });
globalStyle(`${reference}::before`, {
  content: '"[" attr(data-footnote-number) "]"', fontSize: '12px', fontWeight: 500,
});
globalStyle(`${reference}[data-missing="true"]`, { color: 'var(--mantine-color-orange-8)' });
globalStyle(`${reference}.madoc-inline-hidden::before`, { display: 'none' });
globalStyle(`${reference}:focus-visible`, { outline: '2px solid var(--mantine-primary-color-filled)' });
globalStyle(definition, { position: 'relative', margin: '12px 0', paddingLeft: 32 });
globalStyle(`${definition}[data-footnote-start="true"]`, {
  borderTop: '1px solid var(--mantine-color-gray-3)', paddingTop: 14, marginTop: 28,
});
globalStyle(`${definition}::before`, {
  content: 'attr(data-footnote-number) "."', position: 'absolute', left: 0,
  color: 'var(--mantine-color-dimmed)', fontSize: '13px', lineHeight: '24px',
});
globalStyle(`${definition} dt`, {
  display: 'flex', alignItems: 'center', minWidth: 0, maxWidth: '100%',
  fontFamily: 'var(--crepe-font-code)', fontSize: '13px', lineHeight: '24px',
  color: 'var(--mantine-color-dimmed)',
});
globalStyle(`${definition} .madoc-footnote-label`, {
  minWidth: 0, maxWidth: 'calc(100% - 80px)', padding: 0, border: 0,
  borderBottom: '1px solid transparent', background: 'transparent',
  borderRadius: 0, font: 'inherit', color: 'inherit', outline: 'none',
  caretColor: 'var(--mantine-primary-color-filled)',
});
globalStyle(`${definition} .madoc-footnote-label:focus`, { borderBottomColor: 'var(--mantine-primary-color-filled)', color: 'var(--mantine-color-text)' });
globalStyle(`${definition} .madoc-footnote-label[aria-invalid="true"]`, { borderBottomColor: 'var(--mantine-color-red-6)' });
globalStyle(`${definition} dd`, { margin: 0, minWidth: 0 });
globalStyle(`${definition} dd > p`, { margin: '4px 0 8px' });
globalStyle(`${definition} .madoc-footnote-back`, {
  marginLeft: 8, padding: '0 6px', border: 0, borderRadius: 'var(--mantine-radius-xs)',
  color: 'var(--mantine-primary-color-filled)', background: 'transparent',
  cursor: 'pointer', fontSize: 16, lineHeight: '24px',
});
globalStyle(`${definition} .madoc-footnote-back:hover`, { background: 'var(--mantine-primary-color-light)' });
globalStyle(`${definition} .madoc-footnote-back:focus-visible`, { outline: '2px solid var(--mantine-primary-color-filled)' });
globalStyle(`${definition} .madoc-footnote-back[hidden]`, { display: 'none' });

globalStyle(`${reference} .madoc-footnote-raw`, { display: 'none' });
globalStyle(`${reference}[data-missing="true"]::before`, { content: 'attr(data-footnote-source)' });

globalStyle(`${root} .madoc-footnote-jump`, {
  display: 'inline-block', padding: '0 4px', margin: '0 2px', border: 0,
  borderRadius: 'var(--mantine-radius-xs)', font: 'inherit',
  color: 'var(--mantine-primary-color-filled)', background: 'var(--mantine-primary-color-light)',
  cursor: 'pointer',
});
globalStyle(`${root} .madoc-footnote-jump[hidden]`, { display: 'none' });
globalStyle(`${root} .madoc-footnote-jump:focus-visible`, { outline: '2px solid var(--mantine-primary-color-filled)' });
