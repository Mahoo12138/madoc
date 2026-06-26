import { editorEffects } from '@affine/core/blocksuite/editors';

import { registerTemplates } from './register-templates';

editorEffects();
registerTemplates();

export * from './blocksuite-editor';
