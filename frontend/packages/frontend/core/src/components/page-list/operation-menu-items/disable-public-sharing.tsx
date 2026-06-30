import type { MenuItemProps } from '@madoc/component';
import { MenuItem } from '@madoc/component';
import { useI18n } from '@madoc/i18n';
import { ShareIcon } from '@blocksuite/icons/rc';

export const DisablePublicSharing = (props: MenuItemProps) => {
  const t = useI18n();
  return (
    <MenuItem type="danger" prefixIcon={<ShareIcon />} {...props}>
      {t['Disable Public Sharing']()}
    </MenuItem>
  );
};
