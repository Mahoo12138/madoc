import { Crepe } from '@milkdown/crepe';
import { inlineCodeSchema, remarkInlineLinkPlugin, remarkLineBreak } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import { $prose } from '@milkdown/kit/utils';
import { collab } from '@milkdown/plugin-collab';
import { configureFootnotes, footnotes, preserveFootnoteReferences } from './markdown-footnote';
import { footnoteDefinitionView } from './markdown-footnote-view';
import { blockMathNavigation } from './markdown-block-math';
import { codeHighlights, codeHighlightSchema } from './markdown-code-highlights';
import { configureEscapes, escapedText, preserveEscapes } from './markdown-escape';
import { activeBlockDecoration, comfortableMarkdownInput } from './markdown-input';
import { inlineSourceEditing } from './markdown-inline-source';
import type { InlineMathPreview } from './markdown-inline-presentation';
import './markdown-code-block.css';
import { markdownOutline } from './markdown-outline-plugin';
import type { MarkdownOutline } from './markdown-outline-model';
import { hardbreakIndicators } from './markdown-break';
import { asymmetricEmphasisInput } from './markdown-emphasis';
import { configureReferences, preserveReferences, referenceDefinition, resolveReferences } from './markdown-reference';
import { blockImageSource, inlineImageSource, configureImageSource } from './markdown-image-source';

// Keep the single-backtick input rule from consuming a literal backtick inside a double-delimited span.
const doubleBacktickInput = $prose((ctx) => {
  const inlineCodeMark = inlineCodeSchema.type(ctx);
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        if (text !== '`' || from !== to) return false;
        const $from = view.state.doc.resolve(from);
        if ($from.parent.type.spec.code) return false;
        const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n');
        const openingIndex = textBefore.indexOf('``');
        if (openingIndex < 0) return false;
        if (view.state.doc.rangeHasMark($from.start() + openingIndex, from, escapedText.type(ctx))) return false;

        const transaction = view.state.tr.insertText(text, from, to);
        const cursor = transaction.selection.from;
        const $cursor = transaction.doc.resolve(cursor);
        const blockText = $cursor.parent.textBetween(0, $cursor.parentOffset, '\n', '\n');
        if (!blockText.endsWith('``')) {
          view.dispatch(transaction);
          return true;
        }

        const content = blockText.slice(openingIndex + 2, -2);
        if (!content.trim()) {
          view.dispatch(transaction);
          return true;
        }

        const blockStart = $cursor.start($cursor.depth);
        const spanFrom = blockStart + openingIndex;
        transaction.replaceWith(spanFrom, cursor, transaction.doc.type.schema.text(content, [inlineCodeMark.create()]));
        transaction.setSelection(TextSelection.create(transaction.doc, spanFrom + content.length));
        view.dispatch(transaction);
        return true;
      },
    },
  });
});

export function createMarkdownCrepe({ root, itemId, uploadImage, onInlinePreviewChange, onOutlineChange }: {
  root: HTMLElement;
  itemId: string;
  uploadImage: (file: File) => Promise<string>;
  onInlinePreviewChange: (preview: InlineMathPreview | null) => void;
  onOutlineChange: (outline: MarkdownOutline | null) => void;
}) {
  const crepe = new Crepe({
    root,
    defaultValue: '',
    featureConfigs: {
      [Crepe.Feature.Cursor]: { virtual: false },
      [Crepe.Feature.CodeMirror]: {
        copyText: '复制代码',
        searchPlaceholder: '搜索语言',
        noResultText: '没有匹配的语言',
      },
      [Crepe.Feature.ImageBlock]: {
        onUpload: uploadImage,
        inlineOnUpload: uploadImage,
        blockOnUpload: uploadImage,
      },
      [Crepe.Feature.Placeholder]: { text: '输入 / 插入内容…', mode: 'block' },
      [Crepe.Feature.Toolbar]: {
        boldLabel: '加粗',
        italicLabel: '斜体',
        strikethroughLabel: '删除线',
        codeLabel: '行内代码',
        latexLabel: '行内公式',
        linkLabel: '链接',
      },
      [Crepe.Feature.BlockEdit]: {
        textGroup: {
          label: '文本',
          text: { label: '正文' },
          h1: { label: '一级标题' },
          h2: { label: '二级标题' },
          h3: { label: '三级标题' },
          h4: { label: '四级标题' },
          h5: { label: '五级标题' },
          h6: { label: '六级标题' },
          quote: { label: '引用' },
          divider: { label: '分隔线' },
        },
        listGroup: {
          label: '列表',
          bulletList: { label: '无序列表' },
          orderedList: { label: '有序列表' },
          taskList: { label: '任务列表' },
        },
        advancedGroup: {
          label: '插入',
          image: { label: '图片' },
          codeBlock: { label: '代码块' },
          table: { label: '表格' },
          math: { label: '公式' },
        },
      },
    },
  });
  void crepe.editor.remove(remarkInlineLinkPlugin);
  // Preserve escapes before line-break normalization discards text positions.
  void crepe.editor.remove(remarkLineBreak);
  crepe.editor
    .use(codeHighlightSchema)
    .use(codeHighlights)
    .use(blockMathNavigation)
    .config(configureEscapes)
    .use(escapedText)
    .use(preserveFootnoteReferences)
    .use(preserveEscapes)
    .use(remarkLineBreak)
    .config(configureFootnotes)
    .use(footnotes)
    .use(footnoteDefinitionView)
    .config(configureReferences)
    .config(configureImageSource)
    .use(referenceDefinition)
    .use(preserveReferences)
    .use(resolveReferences)
    .use(hardbreakIndicators)
    .use(blockImageSource)
    .use(inlineImageSource)
    // Keep Crepe's math schema and renderer, replacing only its floating editor.
    .config((ctx) => {
      ctx.set('INLINE_LATEX_TOOLTIP_SPEC', {});
      // Existing links edit in place; keep the toolbar's add-link dialog.
      ctx.set('LINK_PREVIEW_TOOLTIP_SPEC', {});
    })
    .use(comfortableMarkdownInput)
    .use(asymmetricEmphasisInput)
    .use(inlineSourceEditing(onInlinePreviewChange))
    .use(markdownOutline(itemId, onOutlineChange))
    .use(activeBlockDecoration)
    .use(doubleBacktickInput)
    .use(collab);

  return crepe;
}
