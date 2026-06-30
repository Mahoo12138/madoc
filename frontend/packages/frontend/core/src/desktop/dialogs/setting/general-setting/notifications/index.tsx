import { SettingHeader, SettingWrapper } from '@madoc/component/setting-components';
import { useI18n } from '@madoc/i18n';

export const NotificationSettings = () => {
  const t = useI18n();

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.notifications.header.title']()}
        subtitle={t['com.affine.setting.notifications.header.description']()}
      />
      <SettingWrapper
        title={t['com.affine.setting.notifications.email.title']()}
      >
      </SettingWrapper>
    </>
  );
};
