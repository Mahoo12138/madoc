import { useEffect, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { submitContentImport, type ContentImportResult } from '@/api/content-import';
import { keys } from '@/api/hooks';
import { APIError } from '@/api/types';
import { preparePortableImport } from './portable-import-plan';
import type { PortableImportPreview } from './portable-package-selection';

const leaveWarning =
  '导入结果尚未确认，服务器可能已完成导入。离开会丢失本次重试信息，请先检查目录，避免重复导入。仍要离开吗？';
type Prepared = Awaited<ReturnType<typeof preparePortableImport>>;
type Phase = 'idle' | 'preparing' | 'submitting' | 'uncertain' | 'success';

export function usePortableImport(workspaceId: string) {
  const client = useQueryClient();
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ContentImportResult>();
  const prepared = useRef<Prepared>();
  const active = useRef<AbortController>();
  const uncertain = useRef(false);
  const unsafe = phase === 'submitting' || phase === 'uncertain';
  useBlocker({
    shouldBlockFn: () => unsafe && !window.confirm(leaveWarning),
    enableBeforeUnload: unsafe,
  });
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = undefined;
    },
    [],
  );

  const submit = async (preview: PortableImportPreview, parentId: string | null, title: string) => {
    if (active.current || phase === 'success') return;
    const controller = new AbortController();
    active.current = controller;
    setError('');
    let sending = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!prepared.current) {
        setPhase('preparing');
        prepared.current = await preparePortableImport(preview, { workspaceId, parentId, title }, controller.signal);
      }
      controller.signal.throwIfAborted();
      setPhase('submitting');
      sending = true;
      // Longer than the server's five-minute upload deadline. A timeout does
      // not establish whether the server committed the transaction.
      timeout = setTimeout(() => controller.abort(), 330_000);
      const response = await submitContentImport(
        workspaceId,
        prepared.current.rootId,
        prepared.current.body,
        controller.signal,
      );
      if (active.current !== controller) return;
      uncertain.current = false;
      prepared.current = undefined;
      setResult(response);
      setPhase('success');
      void client.invalidateQueries({ queryKey: keys.items(workspaceId) });
    } catch (failure) {
      if (active.current !== controller) return;
      // Once a response has been lost, a later permission/validation rejection
      // says nothing about the earlier attempt. Only success resolves it.
      const rejected =
        failure instanceof APIError &&
        [400, 401, 403, 404, 409, 413].includes(failure.status) &&
        failure.code !== 'HTTP_ERROR';
      if (sending && (uncertain.current || !rejected)) {
        uncertain.current = true;
        setPhase('uncertain');
        setError(
          '尚未确认导入结果，服务器可能已经完成。请使用“重试确认”，不会重复创建；不要重新选择文件发起另一组导入。',
        );
      } else {
        prepared.current = undefined;
        setPhase('idle');
        setError(
          controller.signal.aborted
            ? '已取消准备，尚未提交任何内容。'
            : failure instanceof APIError && failure.status === 409
              ? '导入位置或名称发生冲突，请检查目录并修改名称后重试。'
              : failure instanceof APIError && [401, 403].includes(failure.status)
                ? '当前账号无法导入，请确认登录状态和工作区写入权限。'
                : failure instanceof APIError && failure.status === 400
                  ? '服务器拒绝了导入包，请检查正文、附件类型及单附件上传大小限制。'
                  : failure instanceof Error
                    ? failure.message
                    : '无法准备导入，请重试。',
        );
        if (sending) void client.invalidateQueries({ queryKey: keys.items(workspaceId) });
      }
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = undefined;
    }
  };

  return {
    phase,
    error,
    result,
    submit,
    locked: phase !== 'idle',
    cancelPreparation: () => {
      if (phase === 'preparing') active.current?.abort();
    },
    clearError: () => setError(''),
    canClose: () => phase !== 'submitting' && (!uncertain.current || window.confirm(leaveWarning)),
  };
}
