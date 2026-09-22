/** Fence metadata uses one-based line numbers; malformed groups are ignored. */
export function highlightedCodeLines(meta: string, lineCount: number): number[] {
  const lines = new Set<number>();
  for (const group of meta.matchAll(/(?:^|\s)\{([^{}]*)\}(?=\s|$)/g)) {
    const entries = group[1].split(',').map((entry) => entry.trim());
    if (entries.some((entry) => !/^\d+(?:\s*-\s*\d+)?$/.test(entry))) continue;
    for (const entry of entries) {
      const [first, last = first] = entry.split('-').map(Number);
      if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first) continue;
      for (let line = first; line <= Math.min(last, lineCount); line += 1) lines.add(line);
    }
  }
  return [...lines].sort((a, b) => a - b);
}
