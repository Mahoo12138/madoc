import { IconEditor, IconRenderer } from '@madoc/component';
import { EditorSettingService } from '@madoc/core/modules/editor-setting';
import { ExplorerIconService } from '@madoc/core/modules/explorer-icon/services/explorer-icon';
import { useI18n } from '@madoc/i18n';
import { SmileSolidIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@madoc/infra';

import * as styles from './doc-icon-picker.css';

const TitleContainer = ({
  children,
  hasIcon,
}: {
  children: React.ReactNode;
  hasIcon: boolean;
}) => {
  return (
    <div
      className="doc-icon-container"
      data-has-icon={hasIcon ? 'true' : 'false'}
      style={{
        paddingBottom: 8,
      }}
    >
      {children}
    </div>
  );
};

export const DocIconPicker = ({
  docId,
  readonly,
}: {
  docId: string;
  readonly?: boolean;
}) => {
  const t = useI18n();
  const explorerIconService = useService(ExplorerIconService);
  const editorSetting = useService(EditorSettingService).editorSetting;

  const icon = useLiveData(explorerIconService.icon$('doc', docId));
  const settings = useLiveData(editorSetting.settings$);

  const isPlaceholder = !icon?.icon;
  const shouldShowAddIconOption = settings.displayAddIconOption;

  if (readonly) {
    return isPlaceholder ? null : (
      <div
        className={styles.docIconPickerTrigger}
        data-icon-type={icon?.icon?.type}
      >
        <IconRenderer data={icon.icon} />
      </div>
    );
  }

  if (isPlaceholder && !shouldShowAddIconOption) {
    return null;
  }

  return (
    <TitleContainer hasIcon={!isPlaceholder}>
      <IconEditor
        icon={icon?.icon}
        onIconChange={data => {
          explorerIconService.setIcon({
            where: 'doc',
            id: docId,
            icon: data,
          });
        }}
        closeAfterSelect={true}
        triggerVariant="plain"
        triggerClassName={
          isPlaceholder ? styles.placeholder : styles.docIconPickerTrigger
        }
        iconPlaceholder={
          <div className={styles.placeholderContent}>
            <SmileSolidIcon className={styles.placeholderContentIcon} />
            <span className={styles.placeholderContentText}>
              {t['com.affine.docIconPicker.placeholder']()}
            </span>
          </div>
        }
      />
    </TitleContainer>
  );
};
