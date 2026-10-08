/**
 * Dismissal memory for one-time guidance.
 *
 * Guidance is a courtesy, not a gate: every prompt keyed here must have a
 * working product behind it, so a missed or wiped key costs the user one
 * dismissible card and nothing else. Storage failures degrade to "show it
 * again" rather than throwing inside a render.
 */

const NAMESPACE = 'madoc.guide.v1.';

function storage(): Storage | null {
  try {
    const area = window.localStorage;
    // Private modes can expose the object but reject every write.
    const probe = `${NAMESPACE}probe`;
    area.setItem(probe, '1');
    area.removeItem(probe);
    return area;
  } catch {
    return null;
  }
}

/** True once the user has dismissed `key`. Missing or blocked storage says no. */
export function isGuideDismissed(key: string): boolean {
  const area = storage();
  if (!area) return false;
  return area.getItem(NAMESPACE + key) === '1';
}

export function dismissGuide(key: string): void {
  storage()?.setItem(NAMESPACE + key, '1');
}