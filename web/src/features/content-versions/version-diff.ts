export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

// A bounded line LCS keeps the UI responsive for ordinary edits while refusing
// pathological comparisons instead of allocating an unbounded matrix.
export function diffLines(before: string, after: string): DiffLine[] | null {
  const left = before.split('\n');
  const right = after.split('\n');
  if (left.length * right.length > 1_000_000) return null;
  const table = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ kind: 'same', text: left[i++] });
      j++;
    }
    else if (table[i + 1][j] >= table[i][j + 1]) result.push({ kind: 'removed', text: left[i++] });
    else result.push({ kind: 'added', text: right[j++] });
  }
  while (i < left.length) result.push({ kind: 'removed', text: left[i++] });
  while (j < right.length) result.push({ kind: 'added', text: right[j++] });
  return result;
}
