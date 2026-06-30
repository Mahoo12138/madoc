import { getPublicUserByIdQuery } from '@madoc/graphql';
import { Store } from '@madoc/infra';

import type { GraphQLService } from '../services/graphql';

export class PublicUserStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async getPublicUserById(id: string, signal?: AbortSignal) {
    const result = await this.gqlService.gql({
      query: getPublicUserByIdQuery,
      variables: {
        id,
      },
      context: {
        signal,
      },
    });

    return result.publicUserById;
  }
}
