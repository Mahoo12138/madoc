const assetPath = /^\/api\/assets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const nilUUID = '00000000-0000-0000-0000-000000000000';

// Accept only an exact same-origin Madoc asset endpoint and return the
// canonical UUID expected by the version API. Other image URLs are not assets
// that this workspace can grant to a public share.
export function localMadocAssetID(source: string, origin: string): string | undefined {
  let base: URL;
  let url: URL;
  try {
    base = new URL(origin);
    url = new URL(source, base);
  } catch {
    return undefined;
  }
  if (url.origin !== base.origin || url.search || url.hash) return undefined;
  const id = assetPath.exec(url.pathname)?.[1]?.toLowerCase();
  if (!id || id === nilUUID) return undefined;
  return id;
}
