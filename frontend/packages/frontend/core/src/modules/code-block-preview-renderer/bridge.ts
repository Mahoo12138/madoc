import {
  renderMermaidSvgBackend,
  renderTypstSvgBackend,
} from '@madoc/core/modules/code-block-preview-renderer/platform-backend';
import type {
  MermaidRenderRequest,
  MermaidRenderResult,
} from '@madoc/core/modules/mermaid/renderer';
import type {
  TypstRenderRequest,
  TypstRenderResult,
} from '@madoc/core/modules/typst/renderer';
export function sanitizeSvg(svg: string): string {
  return svg;
}

export async function renderMermaidSvg(
  request: MermaidRenderRequest
): Promise<MermaidRenderResult> {
  const rendered = await renderMermaidSvgBackend(request);
  return { svg: rendered.svg };
}

export async function renderTypstSvg(
  request: TypstRenderRequest
): Promise<TypstRenderResult> {
  const rendered = await renderTypstSvgBackend(request);
  return { svg: rendered.svg };
}
