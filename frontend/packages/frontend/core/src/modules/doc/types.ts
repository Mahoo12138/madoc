import type { DocProps } from '@madoc/core/blocksuite/initialization';
import type { DocMode } from '@blocksuite/affine/model';

export interface DocCreateOptions {
  id?: string;
  title?: string;
  primaryMode?: DocMode;
  skipInit?: boolean;
  docProps?: DocProps;
  isTemplate?: boolean;
}
