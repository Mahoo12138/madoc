import { uniReactRoot } from '@madoc/component';
import { useResponsiveSidebar } from '@madoc/core/components/hooks/use-responsive-siedebar';
import { SWRConfigProvider } from '@madoc/core/components/providers/swr-config-provider';
import { WorkspaceSideEffects } from '@madoc/core/components/providers/workspace-side-effects';
import { AppContainer } from '@madoc/core/desktop/components/app-container';
import { DocumentTitle } from '@madoc/core/desktop/components/document-title';
import { WorkspaceDialogs } from '@madoc/core/desktop/dialogs';
import { PeekViewManagerModal } from '@madoc/core/modules/peek-view';
import { WorkbenchService } from '@madoc/core/modules/workbench';
import { LiveData, useLiveData, useService } from '@madoc/infra';
import type { PropsWithChildren } from 'react';

export const WorkspaceLayout = function WorkspaceLayout({
  children,
}: PropsWithChildren) {
  return (
    <SWRConfigProvider>
      <WorkspaceDialogs />

      {/* ---- some side-effect components ---- */}
      <WorkspaceSideEffects />
      <PeekViewManagerModal />
      <DocumentTitle />

      <WorkspaceLayoutInner>{children}</WorkspaceLayoutInner>
      {/* should show after workspace loaded */}
      <uniReactRoot.Root />
    </SWRConfigProvider>
  );
};

/**
 * Wraps the workspace layout main router view
 */
const WorkspaceLayoutUIContainer = ({ children }: PropsWithChildren) => {
  const workbench = useService(WorkbenchService).workbench;
  const currentPath = useLiveData(
    LiveData.computed(get => {
      return get(workbench.basename$) + get(workbench.location$).pathname;
    })
  );
  useResponsiveSidebar();

  return (
    <AppContainer data-current-path={currentPath}>{children}</AppContainer>
  );
};
const WorkspaceLayoutInner = ({ children }: PropsWithChildren) => {
  return <WorkspaceLayoutUIContainer>{children}</WorkspaceLayoutUIContainer>;
};
