import { createEvent } from '@madoc/infra';

import type { AuthAccountInfo } from '../entities/session';

export const AccountChanged = createEvent<AuthAccountInfo | null>(
  'AccountChanged'
);
