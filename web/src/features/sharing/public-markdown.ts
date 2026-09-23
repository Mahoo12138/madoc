export function prepareSharedMarkdown(markdown: string, token: string, assetIds: ReadonlySet<string>) {
  const base = `/api/public/shares/${encodeURIComponent(token)}/assets/`;
  const rewritten = markdown.replace(/(?:https?:\/\/[^/\s)]+)?\/api\/assets\/([a-zA-Z0-9_-]+)(?:\?[^)\s]*)?/g, (_match, id: string) =>
    assetIds.has(id) ? `${base}${encodeURIComponent(id)}` : '#unpublished-asset',
  );
  let fence = '';
  return rewritten.split('\n').map((line) => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = '';
      return line;
    }
    if (fence) return line;
    return line.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_match, alt: string, destination: string) => {
      const url = destination.trim().split(/\s+/, 1)[0].replace(/^<|>$/g, '');
      return url.startsWith(base) ? _match : alt;
    }).replace(/!\[([^\]]*)\]\[([^\]]*)\]/g, '$1');
  }).join('\n');
}

export function hardenSharedMarkdown(root: HTMLElement, token: string, assetIds: ReadonlySet<string>) {
  const allowedImagePath = (value: string) => {
    try {
      const url = new URL(value, window.location.origin);
      const prefix = `/api/public/shares/${encodeURIComponent(token)}/assets/`;
      const id = decodeURIComponent(url.pathname.slice(prefix.length));
      return url.origin === window.location.origin && url.pathname.startsWith(prefix) && assetIds.has(id) && !url.search && !url.hash;
    } catch { return false; }
  };
  root.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.referrerPolicy = 'no-referrer';
    if (!image.getAttribute('src') || !allowedImagePath(image.getAttribute('src')!)) image.removeAttribute('src');
  });
  root.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    const value = anchor.getAttribute('href') ?? '';
    try {
      const url = new URL(value, window.location.origin);
      if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
        anchor.removeAttribute('href');
        return;
      }
      anchor.referrerPolicy = 'no-referrer';
      if (url.origin !== window.location.origin) {
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
      }
    } catch { anchor.removeAttribute('href'); }
  });
}
