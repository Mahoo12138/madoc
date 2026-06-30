import { acceptInviteByInviteIdMutation } from '@madoc/graphql';
import { Store } from '@madoc/infra';

import type { GraphQLService } from '../services/graphql';

export class AcceptInviteStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async acceptInvite(
    workspaceId: string,
    inviteId: string,
    signal?: AbortSignal
  ) {
    const data = await this.gqlService.gql({
      query: acceptInviteByInviteIdMutation,

      variables: {
        workspaceId,
        inviteId,
      },
      context: { signal },
    });

    return data.acceptInviteById;
  }
}
