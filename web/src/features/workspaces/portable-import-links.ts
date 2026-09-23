/** Resolve only relative URLs inside the inspected archive's logical namespace.
 * Package parts share this namespace; their ZIP filenames are never URL bases.
 */
export function createPortableImportLinkResolver(fromFile: string, destinations: ReadonlyMap<string, string>) {
  return (href: string): string => {
    if (
      !href ||
      href.trim() !== href ||
      href.startsWith('/') ||
      href.startsWith('#') ||
      href.startsWith('?') ||
      /^[a-z][a-z\d+.-]*:/i.test(href) ||
      /[\\\u0000-\u001f\u007f]/.test(href)
    )
      return href;
    const boundary = href.search(/[?#]/);
    const rawPath = boundary < 0 ? href : href.slice(0, boundary);
    const suffix = boundary < 0 ? '' : href.slice(boundary);
    const parts = fromFile.split('/').slice(0, -1);
    for (const raw of rawPath.split('/')) {
      let part: string;
      try {
        part = decodeURIComponent(raw);
      } catch {
        return href;
      }
      if (/[\/\\\u0000-\u001f\u007f]/.test(part)) return href;
      if (!part || part === '.') continue;
      if (part === '..') {
        if (!parts.length) return href;
        parts.pop();
      } else parts.push(part);
    }
    const target = destinations.get(parts.join('/'));
    return target === undefined ? href : target + suffix;
  };
}
