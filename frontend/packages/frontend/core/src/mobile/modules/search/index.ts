import { WorkspaceScope } from '@madoc/core/modules/workspace';
import { type Framework } from '@madoc/infra';

import { MobileSearchService } from './service/search';

export { MobileSearchService };

export function configureMobileSearchModule(framework: Framework) {
  framework.scope(WorkspaceScope).service(MobileSearchService);
}
