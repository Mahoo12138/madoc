import type { Workspace } from '@madoc-tools/utils/workspace';
import type { BaseContext } from 'clipanion';

export interface CliContext extends BaseContext {
  workspace: Workspace;
}
