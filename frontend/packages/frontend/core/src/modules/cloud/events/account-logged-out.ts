import { createEvent } from '@madoc/infra';

import type { AuthAccountInfo } from '../entities/session';

export const AccountLoggedOut =
  createEvent<AuthAccountInfo>('AccountLoggedOut');
