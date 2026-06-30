import type { WorkerInitOptions } from '@madoc/nbstore/worker/client';
import { Scope } from '@madoc/infra';

import type { WorkspaceOpenOptions } from '../open-options';

export class WorkspaceScope extends Scope<{
  openOptions: WorkspaceOpenOptions;
  engineWorkerInitOptions: WorkerInitOptions;
}> {}
