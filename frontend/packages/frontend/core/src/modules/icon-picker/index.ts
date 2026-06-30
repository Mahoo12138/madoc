import { type Framework } from '@madoc/infra';

import { IconPickerService } from './services/icon-picker';

export { IconPickerService } from './services/icon-picker';

export function configureIconPickerModule(framework: Framework) {
  framework.service(IconPickerService);
}
