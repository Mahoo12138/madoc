import { IconButton } from '@madoc/component';
import { EditorService } from '@madoc/core/modules/editor';
import { PresentationIcon } from '@blocksuite/icons/rc';
import { useService } from '@madoc/infra';

export const DetailPageHeaderPresentButton = () => {
  const editorService = useService(EditorService);

  return (
    <IconButton
      style={{ flexShrink: 0 }}
      size="24"
      onClick={() => editorService.editor.togglePresentation()}
    >
      <PresentationIcon />
    </IconButton>
  );
};
