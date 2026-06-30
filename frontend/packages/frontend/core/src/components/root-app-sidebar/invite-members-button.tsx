import { MenuItem } from '@madoc/core/modules/app-sidebar/views';
import { WorkspaceDialogService } from '@madoc/core/modules/dialogs';
import { WorkspaceService } from '@madoc/core/modules/workspace';
import { useI18n } from '@madoc/i18n';
import { CollaborationIcon } from '@blocksuite/icons/rc';
import { useService } from '@madoc/infra';
import { useCallback } from 'react';

export const InviteMembersButton = () => {
  const workspace = useService(WorkspaceService).workspace;

  const isLocal = workspace.flavour === 'local';

  const dialogService = useService(WorkspaceDialogService);
  const onOpenInviteMembersModal = useCallback(() => {
    dialogService.open('setting', {
      activeTab: `workspace:members`,
    });
  }, [dialogService]);

  const t = useI18n();

  if (isLocal) {
    return null;
  }

  return (
    <MenuItem
      data-testid="slider-bar-invite-members-button"
      icon={<CollaborationIcon />}
      onClick={onOpenInviteMembersModal}
    >
      {t['Invite Members']()}
    </MenuItem>
  );
};
