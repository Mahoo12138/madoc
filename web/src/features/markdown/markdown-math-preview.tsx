import { useLayoutEffect, useRef } from 'react';
import { Tooltip } from '@mantine/core';
import type { InlineMathPreview } from './markdown-inline-presentation';

function RenderedFormula({ content }: { content: Node }) {
  const root = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { root.current?.replaceChildren(content); }, [content]);
  return <span ref={root} />;
}

export function MarkdownMathPreview({ preview }: { preview: InlineMathPreview | null }) {
  if (!preview) return null;
  return (
    <Tooltip
      target={preview.target}
      opened
      position="bottom-start"
      offset={8}
      transitionProps={{ duration: 0 }}
      className="madoc-inline-math-preview"
      id="madoc-inline-math-preview"
      aria-label="公式预览"
      label={<RenderedFormula content={preview.content} />}
    />
  );
}
