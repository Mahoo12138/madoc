import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import * as styles from './index.css';

export const AIUsage = () => {
  const t = useI18n();
  const workspaceDialogService = useService(WorkspaceDialogService);

  const goToAccountSetting = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'account',
    });
  }, [workspaceDialogService]);

  return (
    <div
      onClick={goToAccountSetting}
      className={styles.usageBlock}
    >
      <div className={styles.usageLabel}>
        <div className={styles.usageLabelTitle}>
          {t['com.affine.user-info.usage.ai']()}
        </div>
      </div>
    </div>
  );
};
