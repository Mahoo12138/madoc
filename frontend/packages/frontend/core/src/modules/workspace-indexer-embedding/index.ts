import { WorkspaceServerService } from '@madoc/core/modules/cloud';
import { NbstoreService } from '@madoc/core/modules/storage';
import {
  WorkspaceScope,
  WorkspaceService,
} from '@madoc/core/modules/workspace';
import { type Framework } from '@madoc/infra';

import { AdditionalAttachments } from './entities/additional-attachments';
import { EmbeddingEnabled } from './entities/embedding-enabled';
import { EmbeddingProgress } from './entities/embedding-progress';
import { IgnoredDocs } from './entities/ignored-docs';
import { EmbeddingService } from './services/embedding';
import { EmbeddingStore } from './stores/embedding';

export function configureIndexerEmbeddingModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(EmbeddingService)
    .store(EmbeddingStore, [WorkspaceServerService, NbstoreService])
    .entity(EmbeddingEnabled, [WorkspaceService, EmbeddingStore])
    .entity(AdditionalAttachments, [WorkspaceService, EmbeddingStore])
    .entity(IgnoredDocs, [WorkspaceService, EmbeddingStore])
    .entity(EmbeddingProgress, [WorkspaceService, EmbeddingStore]);
}

export { EmbeddingSettings } from './view';
