import { type ExtensionType } from '@blocksuite/affine/store';
import type { FrameworkProvider } from '@toeverything/infra';

export function patchIconPickerService(
  _framework: FrameworkProvider
): ExtensionType {
  return {
    setup: () => {},
  };
}
