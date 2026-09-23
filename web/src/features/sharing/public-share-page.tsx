import { useEffect, useRef, useState } from 'react';
import { Alert, Center, Container, Loader, Paper, Stack, Text, Title } from '@mantine/core';
import { useParams } from '@tanstack/react-router';
import { api } from '@/api/client';
import type { SharedItem } from '@/api/types';
import { createMarkdownCrepe } from '@/features/markdown/markdown-session-editor';
import { hardenSharedMarkdown, prepareSharedMarkdown } from './public-markdown';
import { content, header, page } from './public-share-page.css';

export function PublicSharePage() {
  const { token } = useParams({ from: '/s/$token' });
  const [item, setItem] = useState<SharedItem>();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const markdownRoot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setMissing(false); setItem(undefined);
    void api.publicShare(token).then((value) => { if (active) setItem(value); })
      .catch(() => { if (active) setMissing(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!item?.markdown || !markdownRoot.current) return;
    let active = true;
    let created = false;
    const root = markdownRoot.current;
    root.replaceChildren();
    const allowedAssets = new Set(item.assets.map((asset) => asset.id));
    const crepe = createMarkdownCrepe({
      root,
      itemId: 'public-share',
      defaultValue: prepareSharedMarkdown(item.markdown, token, allowedAssets),
      collaborative: false,
      uploadImage: async () => { throw new Error('公开分享只读'); },
      onInlinePreviewChange: () => {},
      onOutlineChange: () => {},
    });
    void crepe.create().then(() => {
      created = true;
      if (!active) { void crepe.destroy(); return; }
      crepe.setReadonly(true);
      root.setAttribute('aria-readonly', 'true');
      hardenSharedMarkdown(root, token, allowedAssets);
    }).catch(() => { if (active) root.replaceChildren(); });
    return () => { active = false; if (created) void crepe.destroy(); };
  }, [item, token]);

  const [boardSVG, setBoardSVG] = useState('');
  useEffect(() => {
    if (!item?.whiteboard) return;
    let active = true;
    let url = '';
    setBoardSVG('');
    void (async () => {
      try {
        const { exportToSvg } = await import('@excalidraw/excalidraw');
        const scene = JSON.parse(item.whiteboard!.scene) as { elements: unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> };
        const svg = await exportToSvg({ elements: scene.elements as never[], appState: scene.appState as never, files: scene.files as never });
        if (!active) return;
        url = URL.createObjectURL(new Blob([svg.outerHTML], { type: 'image/svg+xml' }));
        setBoardSVG(url);
      } catch { if (active) setBoardSVG('error'); }
    })();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [item]);

  return (
    <main className={page}>
      <Container size="md" py="xl">
        {loading ? <Center mih={240}><Loader /></Center> : missing || !item ? (
          <Center mih={240}><Alert color="gray" title="分享不可用">此链接已撤销、已过期或不存在。</Alert></Center>
        ) : (
          <Stack gap="lg">
            <header className={header}>
              <Text size="xs" c="dimmed">MADOC · 只读发布</Text>
              <Title order={1}>{item.title}</Title>
              <Text size="sm" c="dimmed">版本：{item.versionName} · 发布于 {new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.publishedAt))}</Text>
            </header>
            <Paper className={content} withBorder p="xl" radius="md">
              {item.markdown !== undefined ? <div ref={markdownRoot} /> : item.whiteboard ? (
                boardSVG && boardSVG !== 'error' ? <img src={boardSVG} alt="只读白板" style={{ display: 'block', maxWidth: '100%', maxHeight: '80vh', margin: 'auto' }} /> : <Text c="dimmed">{boardSVG === 'error' ? '白板预览暂时不可用。' : '正在生成白板预览…'}</Text>
              ) : <Text c="dimmed">当前发布内容无法显示。</Text>}
            </Paper>
          </Stack>
        )}
      </Container>
    </main>
  );
}
