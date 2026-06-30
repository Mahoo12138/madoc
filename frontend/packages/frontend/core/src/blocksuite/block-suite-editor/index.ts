import { editorEffects } from '@madoc/core/blocksuite/editors';

import { registerTemplates } from './register-templates';

editorEffects();
registerTemplates();

export * from './blocksuite-editor';
