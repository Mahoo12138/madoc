import { useEffect, useRef, useState } from 'react';
import { downloadMarkdown, exportConfirmedMarkdown, type MarkdownExportSource } from './markdown-export';

export function useMarkdownExport(itemId: string, title: string) {
  const source = useRef<MarkdownExportSource>();
  const attempt = useRef<AbortController>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { attempt.current?.abort(); }, [itemId]);

  const register = (value?: MarkdownExportSource) => {
    attempt.current?.abort();
    source.current = value;
    setBusy(false);
    setError('');
  };
  const run = async () => {
    if (attempt.current && !attempt.current.signal.aborted) return;
    const current = source.current;
    if (!current) { setError('编辑器尚未准备完成，请稍后重试。'); return; }
    const controller = new AbortController();
    attempt.current = controller;
    setError('');
    setBusy(true);
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 8000);
    try {
      const markdown = await exportConfirmedMarkdown(itemId, current, controller.signal);
      if (!controller.signal.aborted) downloadMarkdown(markdown, `${title}.md`);
    } catch (error) {
      if (timedOut) setError('导出等待超时，尚未取得已确认内容。可以重试，或下载本地副本。');
      else if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      window.clearTimeout(timer);
      if (attempt.current === controller) { attempt.current = undefined; setBusy(false); }
    }
  };
  const local = () => {
    try {
      if (!source.current) throw new Error('本地正文尚未准备完成。');
      downloadMarkdown(source.current.markdown(), `${title}-本地副本.md`);
    } catch (error) {
      setError(error instanceof Error ? error.message : '本地副本导出失败');
    }
  };
  return { register, run, local, busy, error };
}
