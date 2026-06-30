import { ServerService } from '@madoc/core/modules/cloud';
import { FeatureFlagService } from '@madoc/core/modules/feature-flag';
import { useLiveData, useService } from '@madoc/infra';

export const useEnableAI = () => {
  const featureFlagService = useService(FeatureFlagService);
  const aiFeature = useLiveData(featureFlagService.flags.enable_ai.$);

  const serverService = useService(ServerService);
  const serverConfig = useLiveData(serverService.server.features$);
  const aiConfig = serverConfig.copilot;

  return aiFeature && aiConfig;
};
