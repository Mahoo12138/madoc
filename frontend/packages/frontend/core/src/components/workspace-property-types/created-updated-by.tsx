import { PropertyValue } from '@madoc/component';
import type { FilterParams } from '@madoc/core/modules/collection-rules';
import { type DocRecord, DocService } from '@madoc/core/modules/doc';
import { WorkspaceService } from '@madoc/core/modules/workspace';
import { useI18n } from '@madoc/i18n';
import { useLiveData, useService } from '@madoc/infra';
import type { ReactNode } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import type { GroupHeaderProps } from '../explorer/types';
import * as styles from './created-updated-by.css';

const CreatedByUpdatedByAvatar = (props: {
  type: 'CreatedBy' | 'UpdatedBy';
  doc: DocRecord;
  emptyFallback?: ReactNode;
}) => {
  const doc = props.doc;

  const userId = useLiveData(
    props.type === 'CreatedBy' ? doc?.createdBy$ : doc?.updatedBy$
  );

  if (userId) {
    return (
      <div className={styles.userWrapper}>
        <span>{userId}</span>
      </div>
    );
  }
  return props.emptyFallback === undefined ? (
    <NoRecordValue />
  ) : (
    props.emptyFallback
  );
};

const NoRecordValue = () => {
  const t = useI18n();
  return (
    <span>
      {t['com.affine.page-properties.property-user-avatar-no-record']()}
    </span>
  );
};

const LocalUserValue = () => {
  const t = useI18n();
  return <span>{t['com.affine.page-properties.local-user']()}</span>;
};

export const CreatedByValue = () => {
  const doc = useService(DocService).doc.record;
  const workspaceService = useService(WorkspaceService);
  const isCloud = workspaceService.workspace.flavour !== 'local';

  if (!isCloud) {
    return (
      <PropertyValue readonly>
        <LocalUserValue />
      </PropertyValue>
    );
  }

  return (
    <PropertyValue readonly>
      <CreatedByUpdatedByAvatar type="CreatedBy" doc={doc} />
    </PropertyValue>
  );
};

export const UpdatedByValue = () => {
  const doc = useService(DocService).doc.record;
  const workspaceService = useService(WorkspaceService);
  const isCloud = workspaceService.workspace.flavour !== 'local';

  if (!isCloud) {
    return (
      <PropertyValue readonly>
        <LocalUserValue />
      </PropertyValue>
    );
  }

  return (
    <PropertyValue readonly>
      <CreatedByUpdatedByAvatar type="UpdatedBy" doc={doc} />
    </PropertyValue>
  );
};

export const CreatedByUpdatedByFilterValue = ({
  filter,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  const t = useI18n();

  const selected = filter.value?.split(',').filter(Boolean) ?? [];

  return (
    <span>
      {selected.length > 0
        ? selected.join(', ')
        : t['com.affine.filter.empty']()}
    </span>
  );
};

export const CreatedByDocListInlineProperty = ({ doc }: { doc: DocRecord }) => {
  return (
    <CreatedByUpdatedByAvatar
      doc={doc}
      type="CreatedBy"
      emptyFallback={null}
    />
  );
};

export const UpdatedByDocListInlineProperty = ({ doc }: { doc: DocRecord }) => {
  return (
    <CreatedByUpdatedByAvatar
      type="UpdatedBy"
      doc={doc}
      emptyFallback={null}
    />
  );
};

export const ModifiedByGroupHeader = ({
  groupId,
  docCount,
}: GroupHeaderProps) => {
  const userId = groupId;

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      <div className={styles.userLabelContainer}>
        <span>{userId}</span>
      </div>
    </PlainTextDocGroupHeader>
  );
};
