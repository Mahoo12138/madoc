import { useEffect, useRef, useState } from 'react';
import { notifications } from '@mantine/notifications';
import { downloadMarkdown, exportConfirmedMarkdownSnapshot, type MarkdownExportSource } from './markdown-export';

type ExportKind = 'markdown' | 'package';

export function useMarkdownExport(itemId: string, title: string) {
  const source = useRef<MarkdownExportSource>();
  const attempt = useRef<AbortController>();
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<ExportKind>();
  const [error, setError] = useState('');
  const lastKind = useRef<ExportKind>('markdown');
  useEffect(() => () => { attempt.current?.abort(); }, [itemId]);

  const register = (value?: MarkdownExportSource) => {
    attempt.current?.abort();
    source.current = value;
    setBusy(false);
    setError('');
  };
  const run = async (exportKind: ExportKind = 'markdown') => {
    if (attempt.current && !attempt.current.signal.aborted) return;
    const current = source.current;
    if (!current) { setError('编辑器尚未准备完成，请稍后重试。'); return; }
    const controller = new AbortController();
    attempt.current = controller;
    lastKind.current = exportKind;
    setError('');
    setBusy(true);
    setKind(exportKind);
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, exportKind === 'package' ? 60000 : 8000);
    try {
      const snapshot = await exportConfirmedMarkdownSnapshot(itemId, current, controller.signal);
      if (controller.signal.aborted) return;
      if (exportKind === 'markdown') {
        downloadMarkdown(snapshot.markdown, `${title}.md`);
      } else {
        const { createMarkdownPortablePackage, downloadPortablePackage } = await import('./markdown-portable-export');
        const references = current.assetReferences(snapshot.markdown);
        const result = await createMarkdownPortablePackage({ id: itemId, title }, snapshot, references, controller.signal);
        if (controller.signal.aborted) return;
        downloadPortablePackage(result.data, result.fileName);
        notifications.show({
          message: result.unpackagedImageCount
            ? `导出完成，包含 ${result.attachmentCount} 个 Madoc 附件；${result.unpackagedImageCount} 个外部或相对图片仍使用原地址。`
            : `导出完成，包含 ${result.attachmentCount} 个 Madoc 图片附件。`,
        });
      }
    } catch (error) {
      if (timedOut) setError(exportKind === 'package'
        ? '导出等待超时，尚未完成内容确认或附件打包。可以重试，或下载本地副本。'
        : '导出等待超时，尚未取得已确认内容。可以重试，或下载本地副本。');
      else if (!controller.signal.aborted) setError(error instanceof Error ? error.message : '导出失败，请重试。');
    } finally {
      window.clearTimeout(timer);
      if (attempt.current === controller) { attempt.current = undefined; setBusy(false); setKind(undefined); }
    }
  };
  const runPackage = () => run('package');
  const retry = () => run(lastKind.current);
  const local = () => {
    try {
      if (!source.current) throw new Error('本地正文尚未准备完成。');
      downloadMarkdown(source.current.markdown(), `${title}-本地副本.md`);
    } catch (error) {
      setError(error instanceof Error ? error.message : '本地副本导出失败');
    }
  };
  const inspect = () => {
    const current = source.current;
    if (!current || !current.state().ready) throw new Error('编辑器尚未准备完成，请稍后刷新源码。');
    return { markdown: current.markdown(), ...current.state() };
  };
  const assetReferences = (markdown: string) => source.current?.assetReferences(markdown) ?? [];
  return { register, run, runPackage, retry, local, busy, packageBusy: busy && kind === 'package', error, inspect, assetReferences };
}
