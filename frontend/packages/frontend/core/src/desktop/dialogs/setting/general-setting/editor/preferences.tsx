import { Button } from '@madoc/component';
import {
  SettingRow,
  SettingWrapper,
} from '@madoc/component/setting-components';
import { useI18n } from '@madoc/i18n';

export const Preferences = () => {
  const t = useI18n();
  return (
    <SettingWrapper
      title={t['com.affine.settings.editorSettings.preferences']()}
    >
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.preferences.export.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.preferences.export.description'
        ]()}
      >
        <Button>Export</Button>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.preferences.import.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.preferences.import.description'
        ]()}
      >
        <Button>Import</Button>
      </SettingRow>
    </SettingWrapper>
  );
};
