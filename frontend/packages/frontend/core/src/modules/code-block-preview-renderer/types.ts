import type {
  MermaidRenderRequest,
  MermaidRenderResult,
} from '@madoc/core/modules/mermaid/renderer';
import type {
  TypstRenderRequest,
  TypstRenderResult,
} from '@madoc/core/modules/typst/renderer';

export type PreviewRenderRequestMap = {
  mermaid: MermaidRenderRequest;
  typst: TypstRenderRequest;
};

export type PreviewRenderResultMap = {
  mermaid: MermaidRenderResult;
  typst: TypstRenderResult;
};
