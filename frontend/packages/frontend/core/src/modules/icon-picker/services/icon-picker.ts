import { IconPicker, uniReactRoot } from '@madoc/component';
// Import the identifier for internal use
import { type IconPickerService as IIconPickerService } from '@blocksuite/affine-shared/services';
import { Service } from '@madoc/infra';

// Re-export types from BlockSuite shared services
export type {
  IconData,
  IconPickerService as IIconPickerService,
} from '@blocksuite/affine-shared/services';

export class IconPickerService extends Service implements IIconPickerService {
  public readonly iconPickerComponent =
    uniReactRoot.createUniComponent(IconPicker);
}
