import { generateLicenseKeyMutation } from '@madoc/graphql';
import { Store } from '@madoc/infra';

import type { GraphQLService } from '../services/graphql';

export class SelfhostGenerateLicenseStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async generateKey(sessionId: string, signal?: AbortSignal): Promise<string> {
    const data = await this.gqlService.gql({
      query: generateLicenseKeyMutation,
      variables: {
        sessionId: sessionId,
      },
      context: {
        signal,
      },
    });

    return data.generateLicenseKey;
  }
}
