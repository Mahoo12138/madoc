import { type Framework } from '@madoc/infra';

import { ServersService } from '../cloud/services/servers';
import { GlobalState } from '../storage';
import { WorkspaceFlavoursProvider } from '../workspace';
import { CloudWorkspaceFlavoursProvider } from './impls/cloud';

export { base64ToUint8Array, uint8ArrayToBase64 } from './utils/base64';

export function configureBrowserWorkspaceFlavours(framework: Framework) {
  framework
    .impl(WorkspaceFlavoursProvider('CLOUD'), CloudWorkspaceFlavoursProvider, [
      GlobalState,
      ServersService,
    ]);
}
