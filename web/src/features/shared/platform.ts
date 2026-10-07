/**
 * `navigator.platform` is deprecated and returns an empty string on some
 * engines, so a truthiness check is not enough: an iPad reports "MacIntel" and
 * must still show ⌘. Feature-detect the platform instead of sniffing the UA.
 */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const platform =
    (navigator as { userAgentData?: { platform?: string } }).userAgentData
      ?.platform ??
    navigator.platform ??
    '';
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The modifier key glyph used for shortcut hints. */
export function shortcutModifier(): string {
  return isApplePlatform() ? '⌘' : 'Ctrl';
}