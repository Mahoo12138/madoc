import { Scope } from '@madoc/infra';

import type { View } from '../entities/view';

export class ViewScope extends Scope<{
  view: View;
}> {}
