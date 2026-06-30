import type { OpSchema } from '@madoc/infra/op';

export interface WorkerOps extends OpSchema {
  renderWorkspaceProfile: [Uint8Array[], { name?: string; avatar?: string }];
}
