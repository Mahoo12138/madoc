export { Server } from './entities/server';
export type { AuthAccountInfo } from './entities/session';
export { AccountChanged } from './events/account-changed';
export { AccountLoggedIn } from './events/account-logged-in';
export { AccountLoggedOut } from './events/account-logged-out';
export { AuthProvider } from './provider/auth';
export { ValidatorProvider } from './provider/validator';
export {
  RealtimeLiveQuery,
  type RealtimeLiveQueryEventResult,
  type RealtimeLiveQueryOptions,
} from './realtime/live-query';
export { ServerScope } from './scopes/server';
export { AccessTokenService } from './services/access-token';
export { AuthService } from './services/auth';
export { CaptchaService } from './services/captcha';
export { DefaultServerService } from './services/default-server';
export { EventSourceService } from './services/eventsource';
export { FetchService } from './services/fetch';
export { GraphQLService } from './services/graphql';
export { InvitationService } from './services/invitation';
export type { PublicUserInfo } from './services/public-user';
export { PublicUserService } from './services/public-user';
export { RealtimeService } from './services/realtime';
export { SelfhostGenerateLicenseService } from './services/selfhost-generate-license';
export { SelfhostLicenseService } from './services/selfhost-license';
export { ServerService } from './services/server';
export { ServersService } from './services/servers';
export { WorkspaceServerService } from './services/workspace-server';
export type { ServerConfig } from './types';

// oxlint-disable-next-line simple-import-sort/imports
import { type Framework } from '@toeverything/infra';

import { GlobalCache, GlobalState } from '../storage/providers/global';
import { GlobalStateService } from '../storage/services/global';
import { GlobalContextService } from '../global-context';
import { UrlService } from '../url';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { CloudDocMeta } from './entities/cloud-doc-meta';
import { Server } from './entities/server';
import { AuthSession } from './entities/session';
import { configureDefaultAuthProvider } from './impl/auth';
import { AuthProvider } from './provider/auth';
import { ValidatorProvider } from './provider/validator';
import { ServerScope } from './scopes/server';
import { InvitationService } from './services/invitation';
import { AuthService } from './services/auth';
import { BlocksuiteWriterInfoService } from './services/blocksuite-writer-info';
import { CaptchaService } from './services/captcha';
import { CloudDocMetaService } from './services/cloud-doc-meta';
import { DefaultServerService } from './services/default-server';
import { EventSourceService } from './services/eventsource';
import { FetchService } from './services/fetch';
import { GraphQLService } from './services/graphql';
import { PublicUserService } from './services/public-user';
import { RealtimeService } from './services/realtime';
import { SelfhostGenerateLicenseService } from './services/selfhost-generate-license';
import { SelfhostLicenseService } from './services/selfhost-license';
import { ServerService } from './services/server';
import { ServersService } from './services/servers';
import { WorkspaceServerService } from './services/workspace-server';
import { AcceptInviteStore } from './stores/accept-invite';
import { AuthStore } from './stores/auth';
import { CloudDocMetaStore } from './stores/cloud-doc-meta';
import { InviteInfoStore } from './stores/invite-info';
import { PublicUserStore } from './stores/public-user';
import { SelfhostGenerateLicenseStore } from './stores/selfhost-generate-license';
import { SelfhostLicenseStore } from './stores/selfhost-license';
import { ServerConfigStore } from './stores/server-config';
import { ServerListStore } from './stores/server-list';
import { DocCreatedByService } from './services/doc-created-by';
import { DocUpdatedByService } from './services/doc-updated-by';
import { NbstoreService } from '../storage';
import { DocScope, DocService } from '../doc';
import { GlobalDialogService } from '../dialogs';
import { AccessTokenService } from './services/access-token';
import { AccessTokenStore } from './stores/access-token';

export function configureCloudModule(framework: Framework) {
  configureDefaultAuthProvider(framework);

  framework
    .service(ServersService, [ServerListStore, ServerConfigStore])
    .service(RealtimeService, [
      GlobalContextService,
      ServersService,
      NbstoreService,
    ])
    .service(DefaultServerService, [ServersService])
    .store(ServerListStore, [GlobalStateService])
    .store(ServerConfigStore)
    .entity(Server, [ServerListStore])
    .scope(ServerScope)
    .service(ServerService, [ServerScope])
    .service(FetchService, [ServerService])
    .service(EventSourceService, [ServerService])
    .service(GraphQLService, [FetchService])
    .service(CaptchaService, f => {
      return new CaptchaService(
        f.get(ServerService),
        f.get(FetchService),
        f.getOptional(ValidatorProvider)
      );
    })
    .service(AuthService, [
      FetchService,
      AuthStore,
      UrlService,
      GlobalDialogService,
      NbstoreService,
    ])
    .store(AuthStore, [
      FetchService,
      GraphQLService,
      GlobalState,
      ServerService,
      AuthProvider,
      NbstoreService,
    ])
    .entity(AuthSession, [AuthStore])
    .service(SelfhostGenerateLicenseService, [SelfhostGenerateLicenseStore])
    .store(SelfhostGenerateLicenseStore, [GraphQLService])
    .store(InviteInfoStore, [GraphQLService])
    .service(InvitationService, [AcceptInviteStore, InviteInfoStore])
    .store(AcceptInviteStore, [GraphQLService])
    .service(PublicUserService, [PublicUserStore])
    .store(PublicUserStore, [GraphQLService])
    .service(AccessTokenService, [AccessTokenStore])
    .store(AccessTokenStore, [GraphQLService, NbstoreService]);

  framework
    .scope(WorkspaceScope)
    .service(WorkspaceServerService)
    .service(DocCreatedByService, [WorkspaceServerService])
    .scope(DocScope)
    .service(DocUpdatedByService, [WorkspaceServerService])
    .service(CloudDocMetaService)
    .entity(CloudDocMeta, [CloudDocMetaStore, DocService, GlobalCache])
    .store(CloudDocMetaStore, [WorkspaceServerService]);
  framework
    .scope(WorkspaceScope)
    .service(SelfhostLicenseService, [SelfhostLicenseStore, WorkspaceService])
    .store(SelfhostLicenseStore, [WorkspaceServerService])
    .service(BlocksuiteWriterInfoService, [WorkspaceServerService]);
}
