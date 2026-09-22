const pending = new Map<string, boolean>();
export function setPendingChanges(key: string, value: boolean) {
  if (value) pending.set(key, true);
  else pending.delete(key);
}
export function hasPendingChanges() {
  return pending.size > 0;
}
