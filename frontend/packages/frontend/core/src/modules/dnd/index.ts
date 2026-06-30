import { type Framework } from '@madoc/infra';

import { DocsService } from '../doc';
import { EditorSettingService } from '../editor-setting';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DndService } from './services';

export function configureDndModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DndService, [DocsService, WorkspaceService, EditorSettingService]);
}
