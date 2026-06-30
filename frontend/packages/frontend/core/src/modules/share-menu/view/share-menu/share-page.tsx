import { Divider, Skeleton } from '@madoc/component';
import { Button } from '@madoc/component/ui/button';
import { ServerService } from '@madoc/core/modules/cloud';
import { ShareInfoService } from '@madoc/core/modules/share-doc';
import { useI18n } from '@madoc/i18n';
import { useLiveData, useService } from '@madoc/infra';
import { Suspense, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { CloudSvg } from '../cloud-svg';
import { CopyLinkButton } from './copy-link-button';
import { PublicDoc } from './general-access';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const LocalSharePage = (props: ShareMenuProps) => {
  const t = useI18n();
  const {
    workspaceMetadata: { id: workspaceId },
  } = props;
  return (
    <>
      <div className={styles.localSharePage}>
        <div className={styles.columnContainerStyle} style={{ gap: '12px' }}>
          <div
            className={styles.descriptionStyle}
            style={{ maxWidth: '230px' }}
          >
            {t['com.affine.share-menu.EnableCloudDescription']()}
          </div>
          <div>
            <Button
              onClick={props.onEnableAffineCloud}
              variant="primary"
              data-testid="share-menu-enable-affine-cloud-button"
            >
              {t['Enable AFFiNE Cloud']()}
            </Button>
          </div>
        </div>
        <div className={styles.cloudSvgContainer}>
          <CloudSvg />
        </div>
      </div>
      <CopyLinkButton workspaceId={workspaceId} secondary />
    </>
  );
};

export const AFFiNESharePage = (props: ShareMenuProps) => {
  const {
    workspaceMetadata: { id: workspaceId },
  } = props;
  const shareInfoService = useService(ShareInfoService);
  const serverService = useService(ServerService);

  useEffect(() => {
    shareInfoService.shareInfo.revalidate();
  }, [shareInfoService]);

  const isSharedPage = useLiveData(shareInfoService.shareInfo.isShared$);
  const sharedMode = useLiveData(shareInfoService.shareInfo.sharedMode$);
  const baseUrl = serverService.server.baseUrl;
  const isLoading =
    isSharedPage === null || sharedMode === null || baseUrl === null;

  if (isLoading) {
    return (
      <>
        <Skeleton height={100} />
        <Skeleton height={40} />
      </>
    );
  }

  return (
    <div className={styles.content}>
      <div className={styles.columnContainerStyle}>
        <PublicDoc />
      </div>
      <Divider className={styles.divider} />
      <CopyLinkButton workspaceId={workspaceId} />
    </div>
  );
};

export const SharePage = (props: ShareMenuProps) => {
  if (props.workspaceMetadata.flavour === 'local') {
    return <LocalSharePage {...props} />;
  } else {
    return (
      <ErrorBoundary fallback={null}>
        <Suspense>
          <AFFiNESharePage {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  }
};
