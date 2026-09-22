export type MarkdownExportSource = {
  state: () => { ready: boolean; online: boolean; stopped: boolean; pending: boolean; generation?: number; seq: number };
  flush: () => void;
  markdown: () => string;
};

function delay(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { window.clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, milliseconds);
    signal.addEventListener('abort', cancel, { once: true });
  });
}

export async function exportConfirmedMarkdown(itemId: string, source: MarkdownExportSource, signal: AbortSignal) {
  let state = source.state();
  while (true) {
    if (signal.aborted) throw signal.reason;
    if (state.stopped) throw new Error('保存已停止，无法确认服务器内容。可先下载本地副本。');
    if (!state.online) throw new Error('当前未连接服务器。可以重连后重试，或下载本地副本。');
    if (state.ready && !state.pending && state.generation !== undefined) break;
    await delay(signal, 50);
    state = source.state();
  }
  // Freeze the minimum confirmed watermark after local edits have drained.
  const generation = state.generation!;
  const minSeq = state.seq;
  const query = new URLSearchParams({ generation: String(generation), minSeq: String(minSeq) });
  while (true) {
    state = source.state();
    if (state.stopped || state.generation !== generation) throw new Error('文档状态已变化，请重新打开后导出，或下载本地副本。');
    if (!state.online) throw new Error('连接已中断。可以重连后重试，或下载本地副本。');
    source.flush();
    const response = await fetch(`/api/items/${encodeURIComponent(itemId)}/export.md?${query}`, {
      credentials: 'include', cache: 'no-store', signal,
    });
    if (response.ok) {
      const returnedGeneration = response.headers.get('X-Madoc-Content-Generation');
      const returnedSeq = response.headers.get('X-Madoc-Content-Seq');
      if (returnedGeneration === null || returnedSeq === null || Number(returnedGeneration) !== generation || !Number.isSafeInteger(Number(returnedSeq)) || Number(returnedSeq) < minSeq) {
        throw new Error('服务器没有返回可验证的导出版本，请升级服务后重试。');
      }
      return response.text();
    }
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    if (response.status === 409 && body?.error?.code === 'EXPORT_NOT_READY') {
      await delay(signal, 200);
      continue;
    }
    if (response.status === 401 || response.status === 403) throw new Error('登录或访问权限已失效，无法导出服务器内容。可下载本地副本。');
    throw new Error(body?.error?.message ?? '导出失败，请稍后重试或下载本地副本。');
  }
}

export function downloadMarkdown(markdown: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.replace(/[\\/:*?"<>|]/g, '_');
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
