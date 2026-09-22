import { lazy, Suspense, useRef, useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Burger,
  Button,
  Center,
  Drawer,
  Group,
  Loader,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useNavigate, useParams } from '@tanstack/react-router';
import {
  ChevronDown as IconChevronDown,
  FileText as IconFileText,
  Home as IconHome,
  Settings as IconSettings,
  Trash2 as IconTrash,
  Users as IconUsers,
  PenTool as IconWhiteboard,
} from 'lucide-react';
import {
  useItems,
  useSession,
  useWorkspace,
  useWorkspaceMutations,
} from '@/api/hooks';
import type { Item, ItemType } from '@/api/types';
import { WorkspaceNavigation } from './workspace-navigation';
import type { MarkdownOutline } from '@/features/markdown/markdown-outline-model';
import { MemberDrawer } from './member-drawer';
import { AccountMenu } from '@/features/account/account-menu';
import { WorkspaceTrash } from './workspace-trash';
import { WorkspaceSettings } from './workspace-settings';
import * as styles from './workspace-shell.css';

const MarkdownEditor = lazy(() =>
  import('@/features/markdown/markdown-editor').then((module) => ({
    default: module.MarkdownEditor,
  })),
);
const WhiteboardEditor = lazy(() =>
  import('@/features/whiteboard/whiteboard-editor').then((module) => ({
    default: module.WhiteboardEditor,
  })),
);

export function WorkspacePage() {
  const params = useParams({ strict: false }) as {
    workspaceId: string;
    itemId?: string;
  };
  const { workspaceId, itemId } = params;
  const navigate = useNavigate();
  const session = useSession();
  const workspace = useWorkspace(workspaceId);
  const items = useItems(workspaceId);
  const mutations = useWorkspaceMutations(workspaceId);
  const [membersOpened, membersDrawer] = useDisclosure(false);
  const [trashOpened, trashModal] = useDisclosure(false);
  const [settingsOpened, settingsModal] = useDisclosure(false);
  const [itemModal, itemActions] = useDisclosure(false);
  const [mobileOpened, mobileDrawer] = useDisclosure(false);
  const [navigationPanel, setNavigationPanel] = useState('files');
  const [returnNavigationFocus, setReturnNavigationFocus] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [outline, setOutline] = useState<MarkdownOutline | null>(null);
  const pendingHeading = useRef<(() => void) | null>(null);
  const [moveOpened, moveModal] = useDisclosure(false);
  const [movingItem, setMovingItem] = useState<Item>();
  const [moveParent, setMoveParent] = useState('root');
  const [draft, setDraft] = useState<{
    mode: 'create' | 'rename';
    type: ItemType;
    parentId: string | null;
    item?: Item;
    title: string;
  }>({ mode: 'create', type: 'markdown', parentId: null, title: '' });
  if (session.isLoading || workspace.isLoading || items.isLoading)
    return (
      <Center mih="100vh">
        <Loader />
      </Center>
    );
  if (!session.data?.user) {
    void navigate({ to: '/sign-in', replace: true });
    return null;
  }
  const active = items.data?.find((item) => item.id === itemId);
  const openCreate = (type: ItemType, parentId: string | null = null) => {
    setDraft({ mode: 'create', type, parentId, title: '' });
    itemActions.open();
  };
  const openRename = (item: Item) => {
    setDraft({
      mode: 'rename',
      type: item.type,
      parentId: item.parentId,
      item,
      title: item.title,
    });
    itemActions.open();
  };
  const saveItem = async () => {
    if (draft.mode === 'rename' && draft.item)
      await mutations.renameItem.mutateAsync({
        id: draft.item.id,
        title: draft.title,
      });
    else {
      const created = await mutations.createItem.mutateAsync({
        type: draft.type,
        title: draft.title,
        parentId: draft.parentId,
      });
      if (created.type !== 'folder')
        await navigate({
          to: '/workspace/$workspaceId/$itemId',
          params: { workspaceId, itemId: created.id },
        });
    }
    itemActions.close();
  };
  const deleteItem = async (item: Item) => {
    if (!confirm(`将“${item.title}”及其包含的内容移入回收站？`)) return;
    await mutations.deleteItem.mutateAsync(item.id);
    if (item.id === itemId)
      await navigate({
        to: '/workspace/$workspaceId',
        params: { workspaceId },
      });
  };
  const openMove = (item: Item) => {
    setMovingItem(item);
    setMoveParent(item.parentId ?? 'root');
    moveModal.open();
  };
  const moveItem = async () => {
    if (!movingItem) return;
    const parentId = moveParent === 'root' ? null : moveParent;
    const index = (items.data ?? []).filter(
      (item) => item.parentId === parentId && item.id !== movingItem.id,
    ).length;
    await mutations.moveItem.mutateAsync({
      id: movingItem.id,
      parentId,
      index,
    });
    moveModal.close();
  };
  const isMoveTarget = (candidate: Item) => {
    if (candidate.type !== 'folder' || candidate.id === movingItem?.id)
      return false;
    let current: Item | undefined = candidate;
    while (current?.parentId) {
      if (current.parentId === movingItem?.id) return false;
      current = items.data?.find((item) => item.id === current?.parentId);
    }
    return true;
  };
  const navigationProps = {
    workspaceId,
    items: items.data ?? [],
    activeId: itemId,
    active,
    role: workspace.data?.role ?? ('viewer' as const),
    onCreate: openCreate,
    onRename: openRename,
    onMove: openMove,
    onDelete: deleteItem,
    collapsed: collapsedFolders,
    onCollapsedChange: setCollapsedFolders,
    panel: navigationPanel,
    onPanelChange: setNavigationPanel,
    outline,
  };
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Menu width={250}>
          <Menu.Target>
            <button
              className={styles.workspaceButton}
              aria-label="Workspace 菜单"
            >
              <Group gap="sm" wrap="nowrap">
                <Avatar size={26} radius="md" color="blue">
                  {workspace.data?.name.slice(0, 1)}
                </Avatar>
                <Text fw={650} size="sm" truncate>
                  {workspace.data?.name}
                </Text>
              </Group>
              <IconChevronDown size={14} />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconHome size={15} />}
              onClick={() => navigate({ to: '/workspaces' })}
            >
              所有 Workspaces
            </Menu.Item>
            <Menu.Item
              leftSection={<IconUsers size={15} />}
              onClick={membersDrawer.open}
            >
              成员管理
            </Menu.Item>
            {workspace.data && workspace.data.role !== 'viewer' && (
              <Menu.Item
                leftSection={<IconTrash size={15} />}
                onClick={trashModal.open}
              >
                回收站
              </Menu.Item>
            )}
            {workspace.data?.role === 'owner' && (
              <Menu.Item
                leftSection={<IconSettings size={15} />}
                onClick={settingsModal.open}
              >
                设置
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
        <WorkspaceNavigation
          {...navigationProps}
          onNavigateHeading={(position) => outline?.navigate(position)}
        />
        <AccountMenu user={session.data.user} />
      </aside>
      <main className={styles.main}>
        <header className={styles.topbar}>
          <Group gap="xs">
            <span className={styles.mobileMenu}>
              <Burger
                size="sm"
                opened={mobileOpened}
                onClick={() => {
                  setReturnNavigationFocus(true);
                  mobileDrawer.toggle();
                }}
                aria-label="打开内容导航"
              />
            </span>
            <Text size="sm" c="dimmed">
              {workspace.data?.name}
            </Text>
            {active && (
              <>
                <Text c="dimmed">/</Text>
                <Text size="sm" fw={600}>
                  {active.title}
                </Text>
              </>
            )}
          </Group>
          <Group>
            {workspace.data && workspace.data.role !== 'viewer' && (
              <span className={styles.mobileMenu}>
                <ActionIcon aria-label="回收站" onClick={trashModal.open}>
                  <IconTrash size={17} />
                </ActionIcon>
              </span>
            )}
            {workspace.data?.role === 'owner' && (
              <span className={styles.mobileMenu}>
                <ActionIcon
                  aria-label="Workspace 设置"
                  onClick={settingsModal.open}
                >
                  <IconSettings size={17} />
                </ActionIcon>
              </span>
            )}
            <Tooltip label="成员">
              <ActionIcon aria-label="成员管理" onClick={membersDrawer.open}>
                <IconUsers size={17} />
              </ActionIcon>
            </Tooltip>
            {active && workspace.data?.role !== 'viewer' && (
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                onClick={() => openRename(active)}
              >
                重命名
              </Button>
            )}
          </Group>
        </header>
        <section className={styles.content}>
          {!active ? (
            <div className={styles.empty}>
              <div>
                <Title order={2}>从一个文档或白板开始</Title>
                <Text c="dimmed" mt="xs">
                  左侧内容树是这个 Workspace 的唯一结构来源。
                </Text>
                {workspace.data?.role !== 'viewer' && (
                  <Group justify="center" mt="xl">
                    <Button
                      leftSection={<IconFileText size={16} />}
                      onClick={() => openCreate('markdown')}
                    >
                      新建文档
                    </Button>
                    <Button
                      variant="light"
                      leftSection={<IconWhiteboard size={16} />}
                      onClick={() => openCreate('whiteboard')}
                    >
                      新建白板
                    </Button>
                  </Group>
                )}
              </div>
            </div>
          ) : (
            <Suspense
              fallback={
                <Center mih="60vh">
                  <Loader />
                </Center>
              }
            >
              {active.type === 'markdown' ? (
                <MarkdownEditor
                  key={active.id}
                  item={active}
                  role={workspace.data!.role}
                  user={session.data.user}
                  onOutlineChange={setOutline}
                />
              ) : active.type === 'whiteboard' ? (
                <WhiteboardEditor
                  key={`${session.data.user.id}:${active.id}`}
                  item={active}
                  role={workspace.data!.role}
                  user={session.data.user}
                />
              ) : null}
            </Suspense>
          )}
        </section>
      </main>
      <Drawer
        opened={mobileOpened}
        onClose={mobileDrawer.close}
        title={workspace.data?.name}
        size="min(86vw, 320px)"
        returnFocus={returnNavigationFocus}
        onExitTransitionEnd={() => {
          pendingHeading.current?.();
          pendingHeading.current = null;
        }}
      >
        <WorkspaceNavigation
          {...navigationProps}
          onSelect={mobileDrawer.close}
          onNavigateHeading={(position) => {
            setReturnNavigationFocus(false);
            pendingHeading.current = () => outline?.navigate(position);
            mobileDrawer.close();
          }}
        />
        <AccountMenu
          user={session.data.user}
          onAction={(action) => {
            setReturnNavigationFocus(false);
            pendingHeading.current = action;
            mobileDrawer.close();
          }}
        />
      </Drawer>
      {trashOpened && workspace.data && workspace.data.role !== 'viewer' && (
        <WorkspaceTrash
          key={workspaceId}
          workspace={workspace.data}
          onClose={trashModal.close}
        />
      )}
      <MemberDrawer
        opened={membersOpened}
        onClose={membersDrawer.close}
        workspaceId={workspaceId}
        currentRole={workspace.data?.role ?? 'viewer'}
      />
      {workspace.data && (
        <WorkspaceSettings
          key={workspaceId}
          opened={settingsOpened}
          workspace={workspace.data}
          onClose={settingsModal.close}
        />
      )}
      <Modal
        opened={itemModal}
        onClose={itemActions.close}
        title={
          draft.mode === 'rename'
            ? '重命名'
            : `新建${draft.type === 'markdown' ? '文档' : draft.type === 'whiteboard' ? '白板' : '文件夹'}`
        }
      >
        <Stack>
          <TextInput
            autoFocus
            label="名称"
            value={draft.title}
            onChange={(e) => {
              const title = e.currentTarget.value;
              setDraft((v) => ({ ...v, title }));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && draft.title.trim()) void saveItem();
            }}
          />
          <Button
            onClick={saveItem}
            loading={
              mutations.createItem.isPending || mutations.renameItem.isPending
            }
            disabled={!draft.title.trim()}
          >
            保存
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={moveOpened}
        onClose={moveModal.close}
        title={`移动“${movingItem?.title ?? ''}”`}
      >
        <Stack>
          <Select
            label="目标位置"
            value={moveParent}
            onChange={(value) => setMoveParent(value ?? 'root')}
            data={[
              { value: 'root', label: 'Workspace 根目录' },
              ...(items.data ?? [])
                .filter(isMoveTarget)
                .map((item) => ({ value: item.id, label: item.title })),
            ]}
            searchable
          />
          <Button onClick={moveItem} loading={mutations.moveItem.isPending}>
            移动
          </Button>
        </Stack>
      </Modal>
    </div>
  );
}
