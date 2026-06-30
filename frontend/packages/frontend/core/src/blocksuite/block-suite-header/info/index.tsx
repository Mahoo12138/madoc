import { IconButton } from '@madoc/component';
import { WorkspaceDialogService } from '@madoc/core/modules/dialogs';
import { useI18n } from '@madoc/i18n';
import { track } from '@madoc/track';
import { InformationIcon } from '@blocksuite/icons/rc';
import { useService } from '@madoc/infra';
import { useCallback } from 'react';

export const InfoButton = ({ docId }: { docId: string }) => {
  const workspaceDialogService = useService(WorkspaceDialogService);
  const t = useI18n();

  const onOpenInfoModal = useCallback(() => {
    track.$.header.actions.openDocInfo();
    workspaceDialogService.open('doc-info', { docId });
  }, [docId, workspaceDialogService]);

  return (
    <IconButton
      size="20"
      tooltip={t['com.affine.page-properties.page-info.view']()}
      data-testid="header-info-button"
      onClick={onOpenInfoModal}
    >
      <InformationIcon />
    </IconButton>
  );
};
