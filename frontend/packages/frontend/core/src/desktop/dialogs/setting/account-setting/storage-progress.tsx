import { Skeleton } from '@madoc/component';
import { useI18n } from '@madoc/i18n';
import { cssVar } from '@toeverything/theme';

import * as styles from './storage-progress.css';

export interface StorageProgressProgress {
  upgradable?: boolean;
  onUpgrade: () => void;
}

export const StorageProgress = (_props: StorageProgressProgress) => {
  const t = useI18n();

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            <Skeleton height={16} width={120} />
          </span>
        </div>
        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{
              width: '0%',
              backgroundColor: cssVar('processingColor'),
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
