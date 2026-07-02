import '@blocksuite/affine/effects';

import { effects as testEffects } from '@blocksuite/integration-test/effects';

let initialized = false;

export function initEditorEffects(): void {
  if (initialized) return;
  initialized = true;
  testEffects();
}
