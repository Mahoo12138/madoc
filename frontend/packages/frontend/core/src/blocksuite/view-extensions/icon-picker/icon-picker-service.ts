import { type ExtensionType } from '@blocksuite/affine/store';
import type { FrameworkProvider } from '@madoc/infra';

export function patchIconPickerService(
  _framework: FrameworkProvider
): ExtensionType {
  return {
    setup: () => {},
  };
}
