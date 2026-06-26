import { I18n } from '@affine/i18n';
import type { AffineInlineEditor } from '@blocksuite/affine/shared/types';
import type {
  LinkedMenuItem,
  LinkedWidgetConfig,
} from '@blocksuite/affine/widgets/linked-doc';
import { computed } from '@preact/signals-core';
import type { FrameworkProvider } from '@toeverything/infra';

export const createCommentLinkedWidgetConfig = (
  framework: FrameworkProvider
): Partial<LinkedWidgetConfig> | undefined => {
  const memberGroup = (
    _query: string,
    _close: () => void,
    _inlineEditor: AffineInlineEditor
  ) => {
    return {
      name: I18n.t('com.affine.editor.at-menu.mention-members'),
      items: computed<LinkedMenuItem[]>(() => []),
      loading: computed(() => false),
      hidden: computed(() => true),
      maxDisplay: 3,
    };
  };

  return {
    getMenus: (query, close, _editorHost, inlineEditor) => {
      return [memberGroup(query, close, inlineEditor)];
    },
  };
};
