import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { ServerService } from '@affine/core/modules/cloud';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { EmbeddingSettings } from '@affine/core/modules/workspace-indexer-embedding';
import { useI18n } from '@affine/i18n';
import {
  AiEmbeddingIcon,
  IntegrationsIcon,
  PropertyIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useMemo } from 'react';

import type { SettingSidebarItem, SettingState } from '../types';
import { IntegrationSetting } from './integration';
import { WorkspaceSettingDetail } from './preference';
import { WorkspaceSettingProperties } from './properties';

export const WorkspaceSetting = ({
  activeTab,
  scrollAnchor,
  onCloseSetting,
}: {
  activeTab: SettingTab;
  scrollAnchor?: string;
  onCloseSetting: () => void;
  onChangeSettingState: (settingState: SettingState) => void;
}) => {
  switch (activeTab) {
    case 'workspace:preference':
      return <WorkspaceSettingDetail onCloseSetting={onCloseSetting} />;
    case 'workspace:properties':
      return <WorkspaceSettingProperties />;
    case 'workspace:integrations':
      return <IntegrationSetting scrollAnchor={scrollAnchor} />;
    case 'workspace:embedding':
      return <EmbeddingSettings />;
    default:
      return null;
  }
};

export const useWorkspaceSettingList = (): SettingSidebarItem[] => {
  const workspaceService = useService(WorkspaceService);
  const t = useI18n();

  const items = useMemo<SettingSidebarItem[]>(() => {
    return [
      {
        key: 'workspace:preference',
        title: t['com.affine.settings.workspace.preferences'](),
        icon: <SettingsIcon />,
        testId: 'workspace-setting:preference',
      },
      {
        key: 'workspace:properties',
        title: t['com.affine.settings.workspace.properties'](),
        icon: <PropertyIcon />,
        testId: 'workspace-setting:properties',
      },
      {
        key: 'workspace:integrations',
        title: t['com.affine.integration.integrations'](),
        icon: <IntegrationsIcon />,
        testId: 'workspace-setting:integrations',
      },
      {
        key: 'workspace:embedding',
        title:
          t[
            'com.affine.settings.workspace.indexer-embedding.embedding.title'
          ](),
        icon: <AiEmbeddingIcon />,
        testId: 'workspace-setting:embedding',
      },
    ];
  }, [t]);

  return items;
};
