import {
  Avatar,
  Button,
  Center,
  Loader,
  Skeleton,
  Stack,
  Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link, Navigate } from '@tanstack/react-router';
import { ArrowRight, FolderOpen, Plus } from 'lucide-react';
import { useSession, useWorkspaces } from '@/api/hooks';
import { APIError } from '@/api/types';
import { AccountMenu } from '@/features/account/account-menu';
import { touchRow } from '@/styles/interaction.css';
import { CreateWorkspaceDialog } from './workspace-create-dialog';
import { roleLabels } from './role-labels';
import { WorkspaceLoadNotice } from './workspace-load-notice';
import * as styles from './workspace-list-page.css';

export function WorkspaceListPage() {
  const session = useSession();
  const workspaces = useWorkspaces();
  const [creating, createDialog] = useDisclosure(false);
  const sessionUnauthorized =
    session.error instanceof APIError && session.error.status === 401;

  if (session.isPending)
    return (
      <Center mih="100dvh">
        <Stack align="center" role="status">
          <Loader aria-hidden />
          <Text>正在加载工作区列表…</Text>
        </Stack>
      </Center>
    );
  if (sessionUnauthorized) return <Navigate to="/sign-in" replace />;
  if (session.isError)
    return (
      <Center mih="100dvh" p="xl">
        <Stack maw={420}>
          <WorkspaceLoadNotice
            resource="工作区列表"
            error={session.error}
            cached={false}
            pending={session.isFetching}
            onRetry={() => void session.refetch()}
            showReturn={false}
          />
        </Stack>
      </Center>
    );
  if (!session.data?.user) return <Navigate to="/sign-in" replace />;

  const user = session.data.user;
  const denied =
    workspaces.error instanceof APIError &&
    [401, 403].includes(workspaces.error.status);
  const list = denied ? [] : (workspaces.data ?? []);
  return (
    <main className={styles.page} aria-label="工作区">
      <header>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img
              src="/logo.svg"
              alt=""
              aria-hidden
              className={styles.brandMark}
            />
            Madoc
          </div>
          <div className={styles.account}>
            <AccountMenu user={user} compact />
          </div>
        </div>
      </header>
      <div className={styles.content}>
        <div className={styles.intro}>
          <div className={styles.titleRow}>
            <h1 className={styles.pageTitle}>工作区</h1>
            {workspaces.data && !denied && (
              <span className={styles.count}>{list.length} 个</span>
            )}
          </div>
          <Button
            className={styles.createButton}
            leftSection={<Plus size={16} aria-hidden />}
            onClick={createDialog.open}
            disabled={denied}
          >
            新建工作区
          </Button>
        </div>
        <p className={styles.lead}>你的文档与白板，都在这里。</p>
        {workspaces.error && (
          <div className={styles.notice}>
            <WorkspaceLoadNotice
              resource="工作区列表"
              error={workspaces.error}
              cached={false}
              pending={workspaces.isFetching}
              onRetry={() => void workspaces.refetch()}
              showReturn={false}
            />
          </div>
        )}
        {workspaces.isPending ? (
          <div
            role="status"
            aria-label="正在加载工作区列表"
            className={styles.list}
          >
            {[0, 1, 2].map((row) => (
              <div key={row} className={styles.loadingCard} aria-hidden>
                <Skeleton
                  height={40}
                  width={40}
                  radius="md"
                  className={styles.workspaceMark}
                />
                <div className={styles.loadingIdentity}>
                  <Skeleton height={20} width={`${84 - row * 12}%`} />
                  <Skeleton height={12} width={40} radius="xs" />
                </div>
                <Skeleton
                  height={16}
                  width={16}
                  radius="xs"
                  className={styles.cardArrow}
                />
              </div>
            ))}
          </div>
        ) : list.length ? (
          <ul className={styles.list} aria-label="工作区列表">
            {list.map((workspace) => (
              <li key={workspace.id} className={styles.listItem}>
                <Link
                  to="/workspace/$workspaceId"
                  params={{ workspaceId: workspace.id }}
                  aria-label={`打开工作区 ${workspace.name}`}
                  className={styles.workspaceLink}
                >
                  <Avatar
                    size={40}
                    radius="md"
                    color="blue"
                    className={styles.workspaceMark}
                    aria-hidden
                  >
                    {[...workspace.name][0]}
                  </Avatar>
                  <div className={styles.cardIdentity}>
                    <h2 className={styles.workspaceName}>
                      <bdi>{workspace.name}</bdi>
                    </h2>
                    <p className={styles.workspaceRole}>
                      {roleLabels[workspace.role]}
                    </p>
                  </div>
                  <ArrowRight
                    size={16}
                    strokeWidth={1.7}
                    className={styles.cardArrow}
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          !workspaces.error && (
            <section className={styles.empty} aria-label="暂无工作区">
              <div className={styles.emptyMark}>
                <FolderOpen size={30} strokeWidth={1.5} aria-hidden />
              </div>
              <h2 className={styles.emptyTitle}>你的第一个工作区</h2>
              <p className={styles.emptyDescription}>
                创建后，即可添加文档和白板，也可以邀请成员一起协作。
              </p>
              <Button
                className={touchRow}
                leftSection={<Plus size={16} aria-hidden />}
                onClick={createDialog.open}
              >
                创建工作区
              </Button>
            </section>
          )
        )}
      </div>
      <CreateWorkspaceDialog opened={creating} onClose={createDialog.close} />
    </main>
  );
}
