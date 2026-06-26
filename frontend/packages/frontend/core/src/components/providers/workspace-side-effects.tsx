import { useRegisterFindInPageCommands } from '@affine/core/components/hooks/affine/use-register-find-in-page-commands';
import { useRegisterWorkspaceCommands } from '@affine/core/components/hooks/use-register-workspace-commands';
import { useRegisterNavigationCommands } from '@affine/core/modules/navigation/view/use-register-navigation-commands';
import { QuickSearchContainer } from '@affine/core/modules/quicksearch';
import { useServices } from '@toeverything/infra';

export const WorkspaceSideEffects = () => {
  useRegisterWorkspaceCommands();
  useRegisterNavigationCommands();
  useRegisterFindInPageCommands();

  return (
    <>
      <QuickSearchContainer />
    </>
  );
};
