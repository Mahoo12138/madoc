import { Button } from '@madoc/component/ui/button';
import { GlobalDialogService } from '@madoc/core/modules/dialogs';
import { useI18n } from '@madoc/i18n';
import { useService } from '@madoc/infra';
import { useCallback } from 'react';

import * as styles from './styles.css';

export const SignIn = () => {
  const globalDialogService = useService(GlobalDialogService);

  const t = useI18n();

  const onClickSignIn = useCallback(() => {
    globalDialogService.open('sign-in', {});
  }, [globalDialogService]);

  return (
    <Button
      className={styles.editButton}
      onClick={onClickSignIn}
      data-testid="share-page-sign-in-button"
    >
      {t['com.affine.share-page.header.login']()}
    </Button>
  );
};
