import { useRegisterFindInPageCommands } from '@madoc/core/components/hooks/affine/use-register-find-in-page-commands';
import { useRegisterWorkspaceCommands } from '@madoc/core/components/hooks/use-register-workspace-commands';
import { useRegisterNavigationCommands } from '@madoc/core/modules/navigation/view/use-register-navigation-commands';
import { QuickSearchContainer } from '@madoc/core/modules/quicksearch';
import { useServices } from '@madoc/infra';

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
