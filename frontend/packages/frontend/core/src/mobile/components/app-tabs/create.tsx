import { usePageHelper } from '@madoc/core/blocksuite/block-suite-page-list/utils';
import { useAsyncCallback } from '@madoc/core/components/hooks/affine-async-hooks';
import { DocsService } from '@madoc/core/modules/doc';
import { TemplateDocService } from '@madoc/core/modules/template-doc';
import { WorkbenchService } from '@madoc/core/modules/workbench';
import { WorkspaceService } from '@madoc/core/modules/workspace';
import track from '@madoc/track';
import { EditIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@madoc/infra';

import { TabItem } from './tab-item';
import type { AppTabCustomFCProps } from './type';

export const AppTabCreate = ({ tab }: AppTabCustomFCProps) => {
  const workbench = useService(WorkbenchService).workbench;
  const workspaceService = useService(WorkspaceService);
  const templateDocService = useService(TemplateDocService);
  const docsService = useService(DocsService);

  const currentWorkspace = workspaceService.workspace;
  const pageHelper = usePageHelper(currentWorkspace.docCollection);
  const enablePageTemplate = useLiveData(
    templateDocService.setting.enablePageTemplate$
  );
  const pageTemplateDocId = useLiveData(
    templateDocService.setting.pageTemplateDocId$
  );

  const createPage = useAsyncCallback(
    async (isActive: boolean) => {
      if (isActive) return;
      if (enablePageTemplate && pageTemplateDocId) {
        const docId =
          await docsService.duplicateFromTemplate(pageTemplateDocId);
        workbench.openDoc({ docId, fromTab: 'true' });
      } else {
        const doc = pageHelper.createPage(undefined, { show: false });
        workbench.openDoc({ docId: doc.id, fromTab: 'true' });
      }
      track.$.navigationPanel.$.createDoc();
    },
    [docsService, enablePageTemplate, pageHelper, pageTemplateDocId, workbench]
  );

  return (
    <TabItem id={tab.key} onClick={createPage} label="New Page">
      <EditIcon />
    </TabItem>
  );
};
