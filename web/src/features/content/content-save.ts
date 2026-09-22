type Prepare = (signal: AbortSignal) => Promise<void>;
const sources = new Map<string, Prepare>();

export function registerContentSave(itemId: string, prepare: Prepare) {
  sources.set(itemId, prepare);
  return () => {
    if (sources.get(itemId) === prepare) sources.delete(itemId);
  };
}

export async function prepareContentSave(
  itemId: string,
  required: boolean,
  signal: AbortSignal,
) {
  const prepare = sources.get(itemId);
  if (prepare) await prepare(signal);
  else if (required) throw new Error('编辑器尚未准备完成，请稍后重试。');
  signal.throwIfAborted();
}

export function waitForSave(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const cancel = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, 50);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
