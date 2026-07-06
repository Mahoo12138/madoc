import {
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import {
  AllDocsIcon,
  AddCollectionIcon,
  AddTagIcon,
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  AutoTidyUpIcon,
  BackwardPanelIcon,
  CloseIcon,
  CollectionsIcon,
  DatabaseListViewIcon,
  DeleteIcon,
  FavoriteIcon,
  FilterIcon,
  ForwardPanelIcon,
  ImportIcon,
  JournalIcon,
  LocalDataIcon,
  MemberIcon,
  MoreHorizontalIcon,
  PageIcon,
  PlusIcon,
  PropertyIcon,
  ResizeTidyUpIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  TagsIcon,
  TodayIcon,
  UpdatedIcon,
} from '@blocksuite/icons/rc';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useSession, useSignOut } from '@/api/hooks';
import {
  WorkspaceLeftSidebar,
  type WorkspaceSidebarNavItem,
  type WorkspaceSidebarSection,
} from '@/components/workspace-shell/left-sidebar';
import {
  WorkspaceQuickSearch,
  type WorkspaceQuickSearchDoc,
} from '@/components/workspace-shell/quick-search';
import { WorkspaceSwitcher } from '@/components/workspace-shell/workspace-switcher';
import {
  WorkspaceRightSidebar,
  type WorkspaceRightSidebarTab,
} from '@/components/workspace-shell/right-sidebar';
import {
  getDocCreatedAt,
  getDocDisplayTitle,
  getDocFavorite,
  getDocTrashedAt,
  getDocUpdatedAt,
  isDocTrashed,
  loadWorkspaceDocMetadata,
  reconcileWorkspaceDocMetadata,
  updateDocMetadata,
  type DocMetadataMap,
} from '@/utils/doc-metadata';
import {
  createMadocWorkspace,
  createNewDoc,
  getDocYjsUpdate,
  SocketProvider,
  IDBDocStorage,
} from '@madoc/doc';

import {
  appHeaderButton,
  appMeta,
  appTabsCenter,
  appTabsHeader,
  appTabsLeft,
  appTabsRight,
  appViewMain,
  avatar,
  backLink,
  displayMenu,
  displayMenuDivider,
  displayMenuLabel,
  displayMenuRow,
  displayMenuSection,
  displayMenuTitle,
  displayMenuValue,
  docActionMenu,
  docActionMenuDanger,
  docActionMenuDivider,
  docActionMenuIcon,
  docActionMenuItem,
  docActionMenuLabel,
  docActionMenuWrap,
  docsExplorer,
  docsExplorerScroll,
  docAction,
  docActionGroup,
  docGrid,
  docGridCard,
  docGridMeta,
  docCount,
  docFavoriteButton,
  docFavoriteButtonActive,
  docIcon,
  docList,
  docListHeader,
  docListHeaderCell,
  docCard,
  docMasonry,
  docMasonryCardMedium,
  docMasonryCardTall,
  docMoreButton,
  docMoreButtonActive,
  docTitle,
  docTitleGroup,
  docMeta,
  docPreview,
  docPropertyPill,
  docSelectBox,
  docSelectBoxActive,
  docSelectionBar,
  docSelectionButton,
  docSelectionMeta,
  docGroup,
  docGroupHeader,
  docGroupTitle,
  emptyState,
  emptyIcon,
  emptySubtitle,
  emptyTitle,
  headerActionGroup,
  headerActions,
  headerPrimary,
  headerTabs,
  headerTab,
  headerTabActive,
  headerTabIcon,
  infoList,
  infoRow,
  infoRowIcon,
  infoRowMeta,
  infoRowTitle,
  infoRowValue,
  layout,
  loadingContainer,
  main,
  mainContent,
  mainHeader,
  mainHeaderTitle,
  navItem,
  navItemActive,
  navItemIcon,
  navItemLabel,
  navMeta,
  navSectionActions,
  navSectionAction,
  navSectionChevron,
  navSectionContent,
  navSectionLabel,
  navSectionRoot,
  navSectionTitle,
  navSectionTrigger,
  quickNewButton,
  quickSearchButton,
  quickSearchRow,
  panelAction,
  panelEmptyHint,
  panelList,
  panelRow,
  panelRowAction,
  panelRowButton,
  panelRowContent,
  panelRowIcon,
  panelRowMeta,
  panelRowTitle,
  pinnedCollectionAdd,
  pinnedCollectionArea,
  pinnedCollectionItem,
  pinnedCollectionItemActive,
  pinnedCollectionList,
  filterArea,
  filterInnerArea,
  filterLabel,
  filterMeta,
  filterToken,
  filterTokenIcon,
  filterTokens,
  recentDocItem,
  recentDocMeta,
  recentDocTitle,
  rightCalendar,
  rightCalendarDay,
  rightCalendarDayActive,
  rightCalendarGrid,
  rightCalendarHeader,
  rightCalendarWeekday,
  rightInfoCard,
  rightInfoLabel,
  rightInfoValue,
  rightPanelBody,
  rightPanelClose,
  rightPanelHeader,
  rightPanelKicker,
  rightPanelMeta,
  rightPanelTitle,
  rightSidebarPanel,
  rightSidebarRail,
  rightSidebarShell,
  rightSidebarTab,
  rightSidebarTabActive,
  rightSidebarTabIcon,
  rightSidebarTabLabel,
  newDocButton,
  quietButton,
  displayMenuButton,
  propertyToggle,
  propertyToggleActive,
  sectionTitle,
  sectionToolbar,
  sidebar,
  sidebarClosed,
  sidebarFooter,
  sidebarHeader,
  sidebarHeaderMeta,
  sidebarHeaderText,
  sidebarHeaderTitle,
  sidebarPrimary,
  sidebarScrollable,
  sidebarNav,
  sidebarUserButton,
  sidebarWorkspaceBar,
  userEmail,
  userInfo,
  userName,
  userText,
  viewToggle,
  viewToggleButton,
  viewToggleButtonActive,
  workspaceMark,
} from './workspace.$workspaceId.css';

export const Route = createFileRoute('/workspace/$workspaceId')({
  component: WorkspacePage,
});

type SidebarSectionId =
  | 'favorites'
  | 'organize'
  | 'recently-updated'
  | 'tags'
  | 'collections'
  | 'others';

type WorkspaceTab =
  | 'all'
  | 'collections'
  | 'tags'
  | 'journal'
  | 'favorites'
  | 'trash'
  | 'settings';

type DocOrderBy = 'updated' | 'created' | 'title';
type DocFilter = 'all' | 'recent' | 'favorites';
type DocViewMode = 'list' | 'grid' | 'masonry';
type WorkspaceSidebarTab = 'journal' | 'activity' | 'info';
type DocActionMenuState = {
  docId: string;
  left: number;
  top: number;
};

const DOC_ACTION_MENU_WIDTH = 204;
const DOC_ACTION_MENU_HEIGHT = 122;
const DOC_ACTION_MENU_GUTTER = 8;

function WorkspacePage() {
  const { workspaceId } = Route.useParams();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const workspacePath = `/workspace/${workspaceId}`;
  const isDocRoute =
    pathname !== workspacePath && pathname.startsWith(`${workspacePath}/`);

  if (isDocRoute) {
    return <Outlet />;
  }

  return <WorkspaceHomePage workspaceId={workspaceId} />;
}

function WorkspaceHomePage({ workspaceId }: { workspaceId: string }) {
  const navigate = useNavigate();
  const session = useSession();
  const signOut = useSignOut();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('all');
  const [viewMode, setViewMode] = useState<DocViewMode>('list');
  const [orderBy, setOrderBy] = useState<DocOrderBy>('updated');
  const [docFilter, setDocFilter] = useState<DocFilter>('all');
  const [showDisplayMenu, setShowDisplayMenu] = useState(false);
  const [openDocMenu, setOpenDocMenu] = useState<DocActionMenuState | null>(
    null
  );
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [showDocIcon, setShowDocIcon] = useState(true);
  const [showDocPreview, setShowDocPreview] = useState(true);
  const [showUpdatedAt, setShowUpdatedAt] = useState(true);
  const [showCreatedAt, setShowCreatedAt] = useState(true);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] =
    useState<WorkspaceSidebarTab>('journal');
  const [collapsedSections, setCollapsedSections] = useState<
    Record<SidebarSectionId, boolean>
  >({
    favorites: false,
    organize: false,
    'recently-updated': false,
    tags: false,
    collections: false,
    others: false,
  });
  const [docTimestamps, setDocTimestamps] = useState<Record<string, number>>({});
  const [docMetadata, setDocMetadata] = useState<DocMetadataMap>(() =>
    loadWorkspaceDocMetadata(workspaceId)
  );
  const [isCreating, setIsCreating] = useState(false);

  const socketRef = useRef<SocketProvider | null>(null);
  const collectionRef = useRef<ReturnType<typeof createMadocWorkspace> | null>(null);

  const user = session.data?.user;

  useEffect(() => {
    localStorage.setItem('last_workspace_id', workspaceId);
    setDocMetadata(loadWorkspaceDocMetadata(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    if (!showDisplayMenu) {
      return;
    }

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowDisplayMenu(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showDisplayMenu]);

  useEffect(() => {
    if (!openDocMenu) {
      return;
    }

    const closeDocMenu = () => setOpenDocMenu(null);
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDocMenu();
      }
    };

    document.addEventListener('pointerdown', closeDocMenu);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', closeDocMenu);
    window.addEventListener('scroll', closeDocMenu, true);
    return () => {
      document.removeEventListener('pointerdown', closeDocMenu);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', closeDocMenu);
      window.removeEventListener('scroll', closeDocMenu, true);
    };
  }, [openDocMenu]);

  useEffect(() => {
    const socket = new SocketProvider();
    const idb = new IDBDocStorage();
    const collection = createMadocWorkspace(workspaceId);

    socketRef.current = socket;
    collectionRef.current = collection;

    let mounted = true;

    const init = async () => {
      try {
        await idb.init();
        await socket.connect();
        await socket.joinWorkspace(workspaceId);

        const timestamps = await socket.loadDocTimestamps(workspaceId);
        if (mounted) {
          setDocTimestamps(timestamps);
          setDocMetadata(reconcileWorkspaceDocMetadata(workspaceId, timestamps));
        }
      } catch (err) {
        console.error('[WorkspacePage] Failed to initialize:', err);
      }
    };

    init();

    return () => {
      mounted = false;
      socket.leaveWorkspace(workspaceId);
      socket.disconnect();
      idb.destroy();
    };
  }, [workspaceId]);

  if (session.isLoading || !user) {
    return <div className={loadingContainer}>Loading...</div>;
  }

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    navigate({ to: '/sign-in', replace: true });
  };

  const handleCreateDoc = async () => {
    if (!collectionRef.current || !socketRef.current || isCreating) {
      return;
    }

    setShowQuickSearch(false);
    setQuickSearchQuery('');
    setIsCreating(true);
    try {
      const docId = createNewDoc(collectionRef.current);
      const yjsUpdate = getDocYjsUpdate(collectionRef.current, docId);

      if (yjsUpdate) {
        await socketRef.current.pushDocUpdate(workspaceId, docId, yjsUpdate);
      }

      const now = Date.now();
      setDocTimestamps((prev) => ({
        ...prev,
        [docId]: now,
      }));
      setDocMetadata(
        updateDocMetadata(workspaceId, docId, {
          title: 'Untitled',
          createdAt: now,
          updatedAt: now,
        })
      );

      navigate({
        to: '/workspace/$workspaceId/$docId',
        params: { workspaceId, docId },
      });
    } catch (err) {
      console.error('[WorkspacePage] Failed to create document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const initials = user.name
    .split(' ')
    .map((s) => s[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tabs: { id: WorkspaceTab; label: string; icon: ReactNode }[] = [
    { id: 'all' as const, label: 'All Documents', icon: <AllDocsIcon /> },
    { id: 'journal' as const, label: 'Journals', icon: <JournalIcon /> },
    { id: 'favorites' as const, label: 'Favorites', icon: <FavoriteIcon /> },
    { id: 'settings' as const, label: 'Settings', icon: <SettingsIcon /> },
    { id: 'trash' as const, label: 'Trash', icon: <DeleteIcon /> },
  ];

  const viewTabs: { id: WorkspaceTab; label: string; icon: ReactNode }[] = [
    { id: 'all', label: 'Docs', icon: <AllDocsIcon /> },
    { id: 'collections', label: 'Collections', icon: <CollectionsIcon /> },
    { id: 'tags', label: 'Tags', icon: <TagsIcon /> },
  ];
  const workspaceViews: { id: WorkspaceTab; label: string; icon: ReactNode }[] = [
    ...tabs,
    {
      id: 'collections' as const,
      label: 'Collections',
      icon: <CollectionsIcon />,
    },
    {
      id: 'tags' as const,
      label: 'Tags',
      icon: <TagsIcon />,
    },
  ];
  const activeView =
    workspaceViews.find((tab) => tab.id === activeTab) ?? workspaceViews[0];
  const activeTitle = activeView.label;
  const getTitle = (id: string) => getDocDisplayTitle(docMetadata, id);
  const isDocFavorite = (id: string) => getDocFavorite(docMetadata, id);
  const allDocIds = Object.keys(docTimestamps).sort((a, b) => {
    if (orderBy === 'title') {
      return getTitle(a).localeCompare(getTitle(b));
    }

    if (orderBy === 'created') {
      const createdA = getDocCreatedAt(docMetadata, a) ?? docTimestamps[a] ?? 0;
      const createdB = getDocCreatedAt(docMetadata, b) ?? docTimestamps[b] ?? 0;
      return createdB - createdA;
    }

    return (docTimestamps[b] ?? 0) - (docTimestamps[a] ?? 0);
  });
  const docIds = allDocIds.filter((id) => !isDocTrashed(docMetadata, id));
  const trashedDocIds = allDocIds.filter((id) => isDocTrashed(docMetadata, id));
  const recentDocIds = docIds.slice(0, 6);
  const favoriteDocIds = docIds.filter(isDocFavorite);
  const visibleDocIds =
    docFilter === 'recent'
      ? recentDocIds
      : docFilter === 'favorites'
        ? favoriteDocIds
        : docIds;
  const selectedVisibleDocIds = selectedDocIds.filter((docId) =>
    visibleDocIds.includes(docId)
  );
  const selectedDocIdSet = new Set(selectedVisibleDocIds);
  const getDocGroupTimestamp = (docId: string) =>
    orderBy === 'created'
      ? getDocCreatedAt(docMetadata, docId) ?? docTimestamps[docId]
      : docTimestamps[docId] ?? getDocUpdatedAt(docMetadata, docId);
  const getDocGroupLabel = (docId: string) => {
    if (orderBy === 'title') {
      return 'All documents';
    }

    const timestamp = getDocGroupTimestamp(docId);
    if (!timestamp) {
      return 'Unknown time';
    }

    const date = new Date(timestamp);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const docStart = new Date(date);
    docStart.setHours(0, 0, 0, 0);
    const dayDiff = Math.round(
      (todayStart.getTime() - docStart.getTime()) / 86_400_000
    );

    if (dayDiff === 0) {
      return 'Today';
    }
    if (dayDiff === 1) {
      return 'Yesterday';
    }
    if (dayDiff < 7) {
      return 'Previous 7 days';
    }

    return date.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    });
  };
  const visibleDocGroups = visibleDocIds.reduce<
    { id: string; label: string; docIds: string[] }[]
  >((groups, docId) => {
    const label = getDocGroupLabel(docId);
    const group = groups.find((item) => item.label === label);

    if (group) {
      group.docIds.push(docId);
      return groups;
    }

    groups.push({
      id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      label,
      docIds: [docId],
    });
    return groups;
  }, []);
  const docFilterTitle =
    docFilter === 'recent'
      ? 'Recently updated'
      : docFilter === 'favorites'
        ? 'Favorite documents'
        : 'All documents';
  const docFilterEmptyTitle =
    docFilter === 'favorites'
      ? 'No favorite documents'
      : docIds.length === 0
        ? 'No documents yet'
        : 'No documents in this view';
  const docFilterEmptySubtitle =
    docFilter === 'favorites'
      ? 'Star important documents to keep them close.'
      : docIds.length === 0
        ? 'Create a document and it opens directly in the editor.'
        : 'Adjust the current filter to see more documents.';
  const pinnedCollectionOptions: {
    id: DocFilter;
    label: string;
  }[] = [
    { id: 'all', label: 'All' },
    { id: 'recent', label: 'Recent' },
    { id: 'favorites', label: 'Favorites' },
  ];
  const activeFilterTokens =
    docFilter === 'recent'
      ? ['Trash is false', 'Updated recently']
      : docFilter === 'favorites'
        ? ['Trash is false', 'Favorite is true']
        : ['Trash is false'];
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const calendarCells = [
    ...Array.from({ length: monthStart.getDay() }, () => null),
    ...Array.from({ length: monthEnd.getDate() }, (_, index) => index + 1),
  ];
  const formatDocTime = (
    docId: string,
    format: 'short' | 'long',
    kind: 'created' | 'updated' = 'updated'
  ) => {
    const timestamp =
      kind === 'created'
        ? getDocCreatedAt(docMetadata, docId) ?? docTimestamps[docId]
        : docTimestamps[docId] ?? getDocUpdatedAt(docMetadata, docId);
    if (!timestamp) {
      return 'Unknown';
    }

    return format === 'short'
      ? new Date(timestamp).toLocaleDateString()
      : new Date(timestamp).toLocaleString();
  };
  const openDoc = (docId: string) => {
    navigate({
      to: '/workspace/$workspaceId/$docId',
      params: { workspaceId, docId },
    });
  };
  const toggleDocSelection = (docId: string) => {
    setSelectedDocIds((current) =>
      current.includes(docId)
        ? current.filter((id) => id !== docId)
        : [...current, docId]
    );
  };
  const toggleDocFavorite = (docId: string) => {
    setDocMetadata(
      updateDocMetadata(workspaceId, docId, {
        favorite: !isDocFavorite(docId),
      })
    );
  };
  const moveDocsToTrash = (targetDocIds: string[]) => {
    const now = Date.now();
    let nextMetadata = docMetadata;

    for (const targetDocId of targetDocIds) {
      nextMetadata = updateDocMetadata(workspaceId, targetDocId, {
        trashedAt: now,
      });
    }

    setDocMetadata(nextMetadata);
    setSelectedDocIds((current) =>
      current.filter((selectedId) => !targetDocIds.includes(selectedId))
    );
  };
  const restoreDocsFromTrash = (targetDocIds: string[]) => {
    let nextMetadata = docMetadata;

    for (const targetDocId of targetDocIds) {
      nextMetadata = updateDocMetadata(workspaceId, targetDocId, {
        trashedAt: undefined,
      });
    }

    setDocMetadata(nextMetadata);
  };
  const handleDocClick = (
    docId: string,
    event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>
  ) => {
    if (selectedVisibleDocIds.length > 0 || event.shiftKey) {
      toggleDocSelection(docId);
      return;
    }

    openDoc(docId);
  };
  const renderDocActionMenu = (docId: string, favorite: boolean) => {
    const title = getTitle(docId);
    const menuOpen = openDocMenu?.docId === docId;

    return (
      <span
        className={docActionMenuWrap}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`${docMoreButton} ${menuOpen ? docMoreButtonActive : ''}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-label={`More actions for ${title}`}
          title="More actions"
          onClick={(event) => {
            event.stopPropagation();
            if (menuOpen) {
              setOpenDocMenu(null);
              return;
            }

            const rect = event.currentTarget.getBoundingClientRect();
            const preferredTop = rect.bottom + 4;
            const top =
              preferredTop + DOC_ACTION_MENU_HEIGHT >
              window.innerHeight - DOC_ACTION_MENU_GUTTER
                ? Math.max(
                    DOC_ACTION_MENU_GUTTER,
                    rect.top - DOC_ACTION_MENU_HEIGHT - 4
                  )
                : preferredTop;
            const maxLeft = Math.max(
              DOC_ACTION_MENU_GUTTER,
              window.innerWidth - DOC_ACTION_MENU_WIDTH - DOC_ACTION_MENU_GUTTER
            );
            const left = Math.min(
              maxLeft,
              Math.max(DOC_ACTION_MENU_GUTTER, rect.right - DOC_ACTION_MENU_WIDTH)
            );

            setOpenDocMenu({ docId, left, top });
          }}
        >
          <MoreHorizontalIcon />
        </button>
        {menuOpen ? (
          <div
            className={docActionMenu}
            role="menu"
            style={{
              left: openDocMenu.left,
              top: openDocMenu.top,
            }}
          >
            <button
              type="button"
              className={docActionMenuItem}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpenDocMenu(null);
                openDoc(docId);
              }}
            >
              <span className={docActionMenuIcon}>
                <ArrowRightSmallIcon />
              </span>
              <span className={docActionMenuLabel}>Open document</span>
            </button>
            <button
              type="button"
              className={docActionMenuItem}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpenDocMenu(null);
                toggleDocFavorite(docId);
              }}
            >
              <span className={docActionMenuIcon}>
                <FavoriteIcon />
              </span>
              <span className={docActionMenuLabel}>
                {favorite ? 'Remove from Favorites' : 'Add to Favorites'}
              </span>
            </button>
            <div className={docActionMenuDivider} />
            <button
              type="button"
              className={`${docActionMenuItem} ${docActionMenuDanger}`}
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                setOpenDocMenu(null);
                moveDocsToTrash([docId]);
              }}
            >
              <span className={docActionMenuIcon}>
                <DeleteIcon />
              </span>
              <span className={docActionMenuLabel}>Move to Trash</span>
            </button>
          </div>
        ) : null}
      </span>
    );
  };
  const quickSearchDocs: WorkspaceQuickSearchDoc[] = docIds.map((docId) => ({
    id: docId,
    title: getTitle(docId),
    updatedLabel: `Updated ${formatDocTime(docId, 'short')}`,
  }));
  const rightSidebarTabs: WorkspaceRightSidebarTab<WorkspaceSidebarTab>[] = [
    {
      id: 'journal',
      icon: <TodayIcon />,
      label: 'Journal',
      title: 'Journal',
      content: (
        <>
          <div className={rightCalendar}>
            <div className={rightCalendarHeader}>
              {today.toLocaleString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <div className={rightCalendarGrid}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => (
                <div key={`${day}-${index}`} className={rightCalendarWeekday}>
                  {day}
                </div>
              ))}
              {calendarCells.map((day, index) =>
                day ? (
                  <button
                    key={day}
                    type="button"
                    className={`${rightCalendarDay} ${
                      day === today.getDate() ? rightCalendarDayActive : ''
                    }`}
                  >
                    {day}
                  </button>
                ) : (
                  <div key={`blank-${index}`} />
                )
              )}
            </div>
          </div>
          <div className={rightInfoCard}>
            <div className={rightInfoLabel}>Today</div>
            <div className={rightInfoValue}>
              {docIds.length === 0
                ? 'No document activity yet'
                : `${docIds.length} workspace document${
                    docIds.length === 1 ? '' : 's'
                  }`}
            </div>
          </div>
          <div className={rightPanelMeta}>
            Daily notes and document activity will appear here.
          </div>
        </>
      ),
    },
  ];
  const toggleSection = (section: SidebarSectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };
  const openDocument = (docId: string) => {
    setShowQuickSearch(false);
    setQuickSearchQuery('');
    navigate({
      to: '/workspace/$workspaceId/$docId',
      params: { workspaceId, docId },
    });
  };
  const selectTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (tab === 'all') {
      setDocFilter('all');
    }
  };
  const sidebarNavItems: WorkspaceSidebarNavItem<WorkspaceTab>[] = tabs
    .filter((tab) => tab.id !== 'trash')
    .map((tab) => ({
      id: tab.id,
      icon: tab.icon,
      label: tab.label,
      active: activeTab === tab.id,
      onClick: () => selectTab(tab.id),
    }));
  const sidebarSections: WorkspaceSidebarSection[] = [
    {
      id: 'favorites',
      title: 'Favorites',
      collapsed: collapsedSections.favorites,
      onToggle: () => toggleSection('favorites'),
      action: (
        <span className={navSectionAction} title="Add favorite" aria-hidden="true">
          <FavoriteIcon />
        </span>
      ),
      children:
        favoriteDocIds.length === 0 ? (
          <div className={navMeta}>No favorite documents</div>
        ) : (
          favoriteDocIds.slice(0, 5).map((docId) => (
            <button
              key={docId}
              type="button"
              className={recentDocItem}
              onClick={() => openDocument(docId)}
            >
              <span className={navItemIcon}>
                <FavoriteIcon />
              </span>
              <span className={recentDocTitle}>{getTitle(docId)}</span>
              <span className={recentDocMeta}>
                Updated {formatDocTime(docId, 'short')}
              </span>
            </button>
          ))
        ),
    },
    {
      id: 'organize',
      title: 'Organize',
      collapsed: collapsedSections.organize,
      onToggle: () => toggleSection('organize'),
      action: (
        <span className={navSectionAction} title="New folder" aria-hidden="true">
          <PlusIcon />
        </span>
      ),
      children: <div className={navMeta}>No folders yet</div>,
    },
    {
      id: 'recently-updated',
      title: 'Recently updated',
      collapsed: collapsedSections['recently-updated'],
      onToggle: () => toggleSection('recently-updated'),
      action: (
        <span className={navSectionAction} title="Recent documents" aria-hidden="true">
          <UpdatedIcon />
        </span>
      ),
      children:
        recentDocIds.length === 0 ? (
          <div className={navMeta}>Create a document to start</div>
        ) : (
          recentDocIds.map((docId) => (
            <button
              key={docId}
              type="button"
              className={recentDocItem}
              onClick={() => {
                navigate({
                  to: '/workspace/$workspaceId/$docId',
                  params: { workspaceId, docId },
                });
              }}
            >
              <span className={navItemIcon}>
                <PageIcon />
              </span>
              <span className={recentDocTitle}>{getTitle(docId)}</span>
              <span className={recentDocMeta}>
                {docTimestamps[docId]
                  ? new Date(docTimestamps[docId]).toLocaleDateString()
                  : 'Unknown'}
              </span>
            </button>
          ))
        ),
    },
    {
      id: 'tags',
      title: 'Tags',
      collapsed: collapsedSections.tags,
      onToggle: () => toggleSection('tags'),
      action: (
        <span className={navSectionAction} title="New tag" aria-hidden="true">
          <AddTagIcon />
        </span>
      ),
      children: (
        <>
          <button
            type="button"
            className={`${navItem} ${activeTab === 'tags' ? navItemActive : ''}`}
            onClick={() => selectTab('tags')}
          >
            <span className={navItemIcon}>
              <TagsIcon />
            </span>
            <span className={navItemLabel}>All tags</span>
          </button>
          <div className={navMeta}>No tags yet</div>
        </>
      ),
    },
    {
      id: 'collections',
      title: 'Collections',
      collapsed: collapsedSections.collections,
      onToggle: () => toggleSection('collections'),
      action: (
        <span className={navSectionAction} title="New collection" aria-hidden="true">
          <AddCollectionIcon />
        </span>
      ),
      children: (
        <>
          <button
            type="button"
            className={`${navItem} ${
              activeTab === 'collections' ? navItemActive : ''
            }`}
            onClick={() => selectTab('collections')}
          >
            <span className={navItemIcon}>
              <CollectionsIcon />
            </span>
            <span className={navItemLabel}>All collections</span>
          </button>
          <div className={navMeta}>No collections yet</div>
        </>
      ),
    },
    {
      id: 'others',
      title: 'Others',
      collapsed: collapsedSections.others,
      onToggle: () => toggleSection('others'),
      children: (
        <>
          {tabs
            .filter((tab) => tab.id === 'trash')
            .map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${navItem} ${
                  activeTab === tab.id ? navItemActive : ''
                }`}
                onClick={() => selectTab(tab.id)}
                title={tab.label}
              >
                <span className={navItemIcon}>{tab.icon}</span>
                <span className={navItemLabel}>{tab.label}</span>
              </button>
            ))}
          <button type="button" className={navItem} disabled>
            <span className={navItemIcon}>
              <ImportIcon />
            </span>
            <span className={navItemLabel}>Import</span>
          </button>
        </>
      ),
    },
  ];

  return (
    <div className={layout}>
      <div className={appTabsHeader}>
        <div className={appTabsLeft}>
          <button
            type="button"
            className={appHeaderButton}
            onClick={() => setSidebarOpen((open) => !open)}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <SidebarIcon />
          </button>
          <button type="button" className={appHeaderButton} disabled>
            <BackwardPanelIcon />
          </button>
          <button type="button" className={appHeaderButton} disabled>
            <ForwardPanelIcon />
          </button>
        </div>
        <div className={appTabsCenter} />
        <div className={appTabsRight}>
          <div className={headerActions}>
            <div className={viewToggle} aria-label="Display mode">
              {[
                {
                  mode: 'masonry' as const,
                  title: 'Masonry view',
                  icon: <AutoTidyUpIcon />,
                },
                {
                  mode: 'grid' as const,
                  title: 'Grid view',
                  icon: <ResizeTidyUpIcon />,
                },
                {
                  mode: 'list' as const,
                  title: 'List view',
                  icon: <PropertyIcon />,
                },
              ].map((item) => (
                <button
                  key={item.mode}
                  type="button"
                  className={`${viewToggleButton} ${
                    viewMode === item.mode ? viewToggleButtonActive : ''
                  }`}
                  onClick={() => setViewMode(item.mode)}
                  aria-pressed={viewMode === item.mode}
                  title={item.title}
                >
                  {item.icon}
                </button>
              ))}
            </div>
            <div className={headerActionGroup}>
              <button
                type="button"
                className={displayMenuButton}
                title="Display options"
                aria-expanded={showDisplayMenu}
                onClick={() => setShowDisplayMenu((open) => !open)}
              >
                Display
              </button>
              {showDisplayMenu ? (
                <div className={displayMenu} role="menu">
                  <div className={displayMenuSection}>
                    <div className={displayMenuTitle}>Display</div>
                    <button
                      type="button"
                      className={displayMenuRow}
                      onClick={() => setOrderBy('updated')}
                    >
                      <span className={displayMenuLabel}>Updated time</span>
                      <span className={displayMenuValue}>
                        {orderBy === 'updated' ? 'Updated time' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={displayMenuRow}
                      onClick={() => setOrderBy('created')}
                    >
                      <span className={displayMenuLabel}>Created time</span>
                      <span className={displayMenuValue}>
                        {orderBy === 'created' ? 'Selected' : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className={displayMenuRow}
                      onClick={() => setOrderBy('title')}
                    >
                      <span className={displayMenuLabel}>Title</span>
                      <span className={displayMenuValue}>
                        {orderBy === 'title' ? 'Selected' : ''}
                      </span>
                    </button>
                  </div>
                  <div className={displayMenuDivider} />
                  <div className={displayMenuSection}>
                    <div className={displayMenuTitle}>Properties</div>
                    {[
                      ['Icon', showDocIcon, setShowDocIcon],
                      ['Preview', showDocPreview, setShowDocPreview],
                      ['Updated time', showUpdatedAt, setShowUpdatedAt],
                      ['Created time', showCreatedAt, setShowCreatedAt],
                    ].map(([label, checked, setChecked]) => (
                      <button
                        key={label as string}
                        type="button"
                        className={`${propertyToggle} ${
                          checked ? propertyToggleActive : ''
                        }`}
                        onClick={() =>
                          (setChecked as (value: boolean) => void)(
                            !(checked as boolean)
                          )
                        }
                      >
                        <span>{checked ? '✓' : ''}</span>
                        {label as string}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className={newDocButton}
              onClick={handleCreateDoc}
              disabled={isCreating}
            >
              <span>
                <PlusIcon />
              </span>
              {isCreating ? 'Creating...' : 'New doc'}
            </button>
          </div>
          <span className={appMeta}>{workspaceId.slice(0, 8)}...</span>
        </div>
      </div>

      <div className={appViewMain}>
        <WorkspaceLeftSidebar
          open={sidebarOpen}
          workspaceId={workspaceId}
          initials={initials}
          userName={user.name}
          userEmail={user.email}
          userTitle={`Sign out ${user.email}`}
          backHref="/"
          backTitle="All workspaces"
          backIcon={<ArrowLeftSmallIcon />}
          workspaceIcon={<PageIcon />}
          workspaceSwitcher={
            <WorkspaceSwitcher
              currentWorkspaceId={workspaceId}
              user={user}
              initials={initials}
            />
          }
          quickSearchIcon={<SearchIcon />}
          newDocumentIcon={<PlusIcon />}
          isCreating={isCreating}
          navItems={sidebarNavItems}
          sections={sidebarSections}
          showFooterUser
          onBack={() => navigate({ to: '/', replace: true })}
          onQuickSearch={() => setShowQuickSearch(true)}
          onCreateDocument={handleCreateDoc}
          onUserClick={handleSignOut}
          classes={{
            root: sidebar,
            closed: sidebarClosed,
            header: sidebarHeader,
            workspaceBar: sidebarWorkspaceBar,
            backLink,
            mark: workspaceMark,
            headerText: sidebarHeaderText,
            headerTitle: sidebarHeaderTitle,
            headerMeta: sidebarHeaderMeta,
            userButton: sidebarUserButton,
            avatar,
            primary: sidebarPrimary,
            quickSearchRow,
            quickSearchButton,
            quickNewButton,
            nav: sidebarNav,
            navItem,
            navItemActive,
            navIcon: navItemIcon,
            navLabel: navItemLabel,
            scrollable: sidebarScrollable,
            sectionRoot: navSectionRoot,
            sectionTrigger: navSectionTrigger,
            sectionTitle: navSectionTitle,
            sectionLabel: navSectionLabel,
            sectionChevron: navSectionChevron,
            sectionActions: navSectionActions,
            sectionContent: navSectionContent,
            footer: sidebarFooter,
            userInfo,
            userText,
            userName,
            userEmail,
          }}
        />

        <div className={main} data-side-bar-open={sidebarOpen}>
          <div className={mainHeader}>
            <div className={headerPrimary}>
              {viewTabs.some((tab) => tab.id === activeTab) ? (
                <div className={headerTabs} aria-label="Workspace explorer">
                  {viewTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`${headerTab} ${
                        activeTab === tab.id ? headerTabActive : ''
                      }`}
                      onClick={() => selectTab(tab.id)}
                    >
                      <span className={headerTabIcon}>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={mainHeaderTitle}>{activeTitle}</div>
              )}
            </div>
          </div>

          <div className={mainContent}>
            <div className={docsExplorer}>
              {activeTab === 'all' && (
                <>
                  <div className={pinnedCollectionArea}>
                    <div
                      className={pinnedCollectionList}
                      aria-label="Pinned collections"
                    >
                      {pinnedCollectionOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${pinnedCollectionItem} ${
                            docFilter === item.id
                              ? pinnedCollectionItemActive
                              : ''
                          }`}
                          data-active={
                            docFilter === item.id ? 'true' : undefined
                          }
                          onClick={() => setDocFilter(item.id)}
                        >
                          {item.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={pinnedCollectionAdd}
                        title="Pin collection"
                        disabled
                      >
                        <PlusIcon />
                      </button>
                    </div>
                  </div>
                <div className={filterArea}>
                  <div className={filterInnerArea}>
                    <div className={filterLabel}>
                      <span className={filterTokenIcon}>
                        <FilterIcon />
                      </span>
                      Filter
                    </div>
                    <div className={filterTokens}>
                      {activeFilterTokens.map((token) => (
                        <span key={token} className={filterToken}>
                          {token}
                        </span>
                      ))}
                    </div>
                    <div className={filterMeta}>
                      {visibleDocIds.length} of {docIds.length} document
                      {docIds.length === 1 ? '' : 's'} sorted by{' '}
                      {orderBy === 'title'
                        ? 'title'
                        : orderBy === 'created'
                          ? 'created time'
                          : 'updated time'}
                    </div>
                  </div>
                </div>
                <div className={sectionToolbar}>
                  <div>
                    <h2 className={sectionTitle}>{docFilterTitle}</h2>
                    <div className={docCount}>
                      {visibleDocIds.length === 0
                        ? docIds.length === 0
                          ? 'No documents in this workspace'
                          : 'No documents in this view'
                        : `${visibleDocIds.length} document${
                            visibleDocIds.length === 1 ? '' : 's'
                          }`}
                    </div>
                  </div>
                  {selectedVisibleDocIds.length > 0 ? (
                    <div className={docSelectionBar}>
                      <span className={docSelectionMeta}>
                        {selectedVisibleDocIds.length} selected
                      </span>
                      <button
                        type="button"
                        className={docSelectionButton}
                        onClick={() => setSelectedDocIds([])}
                      >
                        Clear selection
                      </button>
                      <button
                        type="button"
                        className={docSelectionButton}
                        onClick={() => moveDocsToTrash(selectedVisibleDocIds)}
                      >
                        Move to Trash
                      </button>
                    </div>
                  ) : (
                    <button type="button" className={quietButton}>
                      <FilterIcon />
                      Add filter
                    </button>
                  )}
                </div>

                {visibleDocIds.length === 0 ? (
                  <div className={emptyState}>
                    <div className={emptyIcon}>
                      {docFilter === 'favorites' ? <FavoriteIcon /> : <PageIcon />}
                    </div>
                    <h2 className={emptyTitle}>{docFilterEmptyTitle}</h2>
                    <p className={emptySubtitle}>{docFilterEmptySubtitle}</p>
                    {docFilter === 'favorites' && docIds.length > 0 ? (
                      <button
                        type="button"
                        className={quietButton}
                        onClick={() => setDocFilter('all')}
                      >
                        <AllDocsIcon />
                        Show all documents
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={newDocButton}
                        onClick={handleCreateDoc}
                        disabled={isCreating}
                      >
                        <span>
                          <PlusIcon />
                        </span>
                        {isCreating ? 'Creating...' : 'New doc'}
                      </button>
                    )}
                  </div>
                ) : viewMode !== 'list' ? (
                  <div className={docsExplorerScroll}>
                    {visibleDocGroups.map((group) => (
                      <section key={group.id} className={docGroup}>
                        <div className={docGroupHeader}>
                          <span className={docGroupTitle}>{group.label}</span>
                          <span>{group.docIds.length}</span>
                        </div>
                        <div
                          className={viewMode === 'masonry' ? docMasonry : docGrid}
                        >
                          {group.docIds.map((docId, index) => {
                            const selected = selectedDocIdSet.has(docId);
                            const favorite = isDocFavorite(docId);
                            const masonrySizeClass =
                              viewMode !== 'masonry'
                                ? ''
                                : index % 5 === 1
                                  ? docMasonryCardTall
                                  : index % 5 === 3
                                    ? docMasonryCardMedium
                                    : '';

                            return (
                              <div
                                key={docId}
                                role="button"
                                tabIndex={0}
                                data-selected={selected}
                                className={`${docGridCard} ${masonrySizeClass}`}
                                onClick={(event) => handleDocClick(docId, event)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleDocClick(docId, event);
                                  }
                                }}
                              >
                                <button
                                  type="button"
                                  className={`${docSelectBox} ${
                                    selected ? docSelectBoxActive : ''
                                  }`}
                                  aria-pressed={selected}
                                  aria-label={
                                    selected
                                      ? `Deselect ${getTitle(docId)}`
                                      : `Select ${getTitle(docId)}`
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDocSelection(docId);
                                  }}
                                >
                                  {selected ? '✓' : ''}
                                </button>
                                <button
                                  type="button"
                                  className={`${docFavoriteButton} ${
                                    favorite ? docFavoriteButtonActive : ''
                                  }`}
                                  aria-pressed={favorite}
                                  aria-label={
                                    favorite
                                      ? `Remove ${getTitle(docId)} from favorites`
                                      : `Add ${getTitle(docId)} to favorites`
                                  }
                                  title={
                                    favorite
                                      ? 'Remove from Favorites'
                                      : 'Add to Favorites'
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDocFavorite(docId);
                                  }}
                                >
                                  <FavoriteIcon />
                                </button>
                                <div className={docTitleGroup}>
                                  {showDocIcon ? (
                                    <div className={docIcon}>
                                      <PageIcon />
                                    </div>
                                  ) : null}
                                  <div className={docTitle}>{getTitle(docId)}</div>
                                </div>
                                {showDocPreview ? (
                                  <div className={docPreview}>
                                    Empty page. Open it to start writing.
                                  </div>
                                ) : null}
                                <div className={docGridMeta}>
                                  {showUpdatedAt ? (
                                    <span className={docPropertyPill}>
                                      Updated {formatDocTime(docId, 'short')}
                                    </span>
                                  ) : null}
                                  {showCreatedAt ? (
                                    <span className={docPropertyPill}>
                                      Created{' '}
                                      {formatDocTime(docId, 'short', 'created')}
                                    </span>
                                  ) : null}
                                </div>
                                {renderDocActionMenu(docId, favorite)}
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className={`${docsExplorerScroll} ${docList}`}>
                    <div className={docListHeader}>
                      <div className={docListHeaderCell} />
                      <div className={docListHeaderCell}>Title</div>
                      <div className={docListHeaderCell}>
                        {showUpdatedAt ? 'Updated' : ''}
                      </div>
                      <div className={docListHeaderCell}>
                        {showCreatedAt ? 'Created' : ''}
                      </div>
                      <div className={docListHeaderCell}>Actions</div>
                    </div>
                    {visibleDocGroups.map((group) => (
                      <section key={group.id} className={docGroup}>
                        <div className={docGroupHeader}>
                          <span className={docGroupTitle}>{group.label}</span>
                          <span>{group.docIds.length}</span>
                        </div>
                        {group.docIds.map((docId) => {
                          const selected = selectedDocIdSet.has(docId);
                          const favorite = isDocFavorite(docId);

                          return (
                            <div
                              key={docId}
                              role="button"
                              tabIndex={0}
                              data-selected={selected}
                              className={docCard}
                              onClick={(event) => handleDocClick(docId, event)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  handleDocClick(docId, event);
                                }
                              }}
                            >
                              <button
                                type="button"
                                className={`${docSelectBox} ${
                                  selected ? docSelectBoxActive : ''
                                }`}
                                aria-pressed={selected}
                                aria-label={
                                  selected
                                    ? `Deselect ${getTitle(docId)}`
                                    : `Select ${getTitle(docId)}`
                                }
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleDocSelection(docId);
                                }}
                              >
                                {selected ? '✓' : ''}
                              </button>
                              <div className={docTitleGroup}>
                                {showDocIcon ? (
                                  <div className={docIcon}>
                                    <PageIcon />
                                  </div>
                                ) : null}
                                <div>
                                  <div className={docTitle}>{getTitle(docId)}</div>
                                  {showDocPreview ? (
                                    <div className={docPreview}>
                                      Empty page. Open it to start writing.
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <div className={docMeta}>
                                {showUpdatedAt ? formatDocTime(docId, 'long') : ''}
                              </div>
                              <div className={docMeta}>
                                {showCreatedAt
                                  ? formatDocTime(docId, 'long', 'created')
                                  : ''}
                              </div>
                              <div className={docActionGroup}>
                                <button
                                  type="button"
                                  className={`${docFavoriteButton} ${
                                    favorite ? docFavoriteButtonActive : ''
                                  }`}
                                  aria-pressed={favorite}
                                  aria-label={
                                    favorite
                                      ? `Remove ${getTitle(docId)} from favorites`
                                      : `Add ${getTitle(docId)} to favorites`
                                  }
                                  title={
                                    favorite
                                      ? 'Remove from Favorites'
                                      : 'Add to Favorites'
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggleDocFavorite(docId);
                                  }}
                                >
                                  <FavoriteIcon />
                                </button>
                                {renderDocActionMenu(docId, favorite)}
                                <span
                                  className={docAction}
                                  aria-label="Open document"
                                >
                                  <ArrowRightSmallIcon />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </section>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'favorites' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <FavoriteIcon />
                </div>
                <h2 className={emptyTitle}>
                  {favoriteDocIds.length === 0
                    ? 'No favorites yet'
                    : 'Favorite documents'}
                </h2>
                <p className={emptySubtitle}>
                  {favoriteDocIds.length === 0
                    ? 'Star important documents to keep them close.'
                    : `${favoriteDocIds.length} document${
                        favoriteDocIds.length === 1 ? '' : 's'
                      } kept close for this workspace.`}
                </p>
                {favoriteDocIds.length === 0 ? (
                  <div className={panelList}>
                    <button
                      type="button"
                      className={panelRowButton}
                      onClick={() => selectTab('all')}
                    >
                      <span className={panelRowIcon}>
                        <AllDocsIcon />
                      </span>
                      <span className={panelRowContent}>
                        <span className={panelRowTitle}>All documents</span>
                        <span className={panelRowMeta}>
                          {docIds.length} document
                          {docIds.length === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className={panelRowAction}>&gt;</span>
                    </button>
                  </div>
                ) : (
                  <div className={panelList}>
                    {favoriteDocIds.map((docId) => (
                      <button
                        key={docId}
                        type="button"
                        className={panelRowButton}
                        onClick={() => openDocument(docId)}
                      >
                        <span className={panelRowIcon}>
                          <PageIcon />
                        </span>
                        <span className={panelRowContent}>
                          <span className={panelRowTitle}>{getTitle(docId)}</span>
                          <span className={panelRowMeta}>
                            Updated {formatDocTime(docId, 'short')}
                          </span>
                        </span>
                        <span className={panelRowAction}>&gt;</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'journal' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <JournalIcon />
                </div>
                <h2 className={emptyTitle}>Journals</h2>
                <p className={emptySubtitle}>Daily workspace timeline.</p>
                <div className={panelList}>
                  <div className={panelRow}>
                    <span className={panelRowIcon}>
                      <TodayIcon />
                    </span>
                    <span className={panelRowContent}>
                      <span className={panelRowTitle}>
                        {today.toLocaleDateString(undefined, {
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      <span className={panelRowMeta}>
                        {recentDocIds.length === 0
                          ? 'No edits today'
                          : `${recentDocIds.length} recent update${
                              recentDocIds.length === 1 ? '' : 's'
                            }`}
                      </span>
                    </span>
                  </div>
                  {recentDocIds.slice(0, 3).map((docId) => (
                    <button
                      key={docId}
                      type="button"
                      className={panelRowButton}
                      onClick={() => openDocument(docId)}
                    >
                      <span className={panelRowIcon}>
                        <PageIcon />
                      </span>
                      <span className={panelRowContent}>
                        <span className={panelRowTitle}>{getTitle(docId)}</span>
                        <span className={panelRowMeta}>
                          Updated {formatDocTime(docId, 'short')}
                        </span>
                      </span>
                      <span className={panelRowAction}>&gt;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'collections' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <CollectionsIcon />
                </div>
                <h2 className={emptyTitle}>No collections yet</h2>
                <p className={emptySubtitle}>Saved document sets.</p>
                <div className={panelList}>
                  <button
                    type="button"
                    className={panelRowButton}
                    onClick={() => selectTab('all')}
                  >
                    <span className={panelRowIcon}>
                      <DatabaseListViewIcon />
                    </span>
                    <span className={panelRowContent}>
                      <span className={panelRowTitle}>All documents</span>
                      <span className={panelRowMeta}>
                        {docIds.length} matching item{docIds.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className={panelRowAction}>&gt;</span>
                  </button>
                  <button type="button" className={panelRowButton} disabled>
                    <span className={panelRowIcon}>
                      <AddCollectionIcon />
                    </span>
                    <span className={panelRowContent}>
                      <span className={panelRowTitle}>New collection</span>
                      <span className={panelRowMeta}>Rule builder pending</span>
                    </span>
                    <span className={panelAction}>Soon</span>
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'tags' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <TagsIcon />
                </div>
                <h2 className={emptyTitle}>No tags yet</h2>
                <p className={emptySubtitle}>Document labels.</p>
                <div className={panelList}>
                  <button type="button" className={panelRowButton} disabled>
                    <span className={panelRowIcon}>
                      <AddTagIcon />
                    </span>
                    <span className={panelRowContent}>
                      <span className={panelRowTitle}>New tag</span>
                      <span className={panelRowMeta}>Tag model pending</span>
                    </span>
                    <span className={panelAction}>Soon</span>
                  </button>
                  <div className={panelEmptyHint}>
                    Tags will appear in the sidebar after document properties are
                    wired.
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'trash' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <DeleteIcon />
                </div>
                <h2 className={emptyTitle}>
                  {trashedDocIds.length === 0 ? 'Trash is empty' : 'Trash'}
                </h2>
                <p className={emptySubtitle}>
                  {trashedDocIds.length === 0
                    ? 'Deleted documents will appear here.'
                    : `${trashedDocIds.length} document${
                        trashedDocIds.length === 1 ? '' : 's'
                      } can be restored.`}
                </p>
                {trashedDocIds.length > 0 ? (
                  <div className={panelList}>
                    {trashedDocIds.map((trashedDocId) => (
                      <div key={trashedDocId} className={panelRow}>
                        <span className={panelRowIcon}>
                          <PageIcon />
                        </span>
                        <span className={panelRowContent}>
                          <span className={panelRowTitle}>
                            {getTitle(trashedDocId)}
                          </span>
                          <span className={panelRowMeta}>
                            Moved to Trash{' '}
                            {getDocTrashedAt(docMetadata, trashedDocId)
                              ? new Date(
                                  getDocTrashedAt(docMetadata, trashedDocId) ?? 0
                                ).toLocaleDateString()
                              : 'recently'}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={docSelectionButton}
                          onClick={() => restoreDocsFromTrash([trashedDocId])}
                        >
                          Restore
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className={emptyState}>
                <div className={emptyIcon}>
                  <SettingsIcon />
                </div>
                <h2 className={emptyTitle}>Workspace Settings</h2>
                <p className={emptySubtitle}>Local workspace details.</p>
                <div className={infoList}>
                  <div className={infoRow}>
                    <span className={infoRowIcon}>
                      <LocalDataIcon />
                    </span>
                    <span>
                      <span className={infoRowTitle}>Workspace ID</span>
                      <span className={infoRowMeta}>Local identifier</span>
                    </span>
                    <span className={infoRowValue}>{workspaceId}</span>
                  </div>
                  <div className={infoRow}>
                    <span className={infoRowIcon}>
                      <MemberIcon />
                    </span>
                    <span>
                      <span className={infoRowTitle}>Account</span>
                      <span className={infoRowMeta}>{user.name}</span>
                    </span>
                    <span className={infoRowValue}>{user.email}</span>
                  </div>
                  <div className={infoRow}>
                    <span className={infoRowIcon}>
                      <DatabaseListViewIcon />
                    </span>
                    <span>
                      <span className={infoRowTitle}>Documents</span>
                      <span className={infoRowMeta}>Current workspace</span>
                    </span>
                    <span className={infoRowValue}>{docIds.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
        <WorkspaceRightSidebar
          tabs={rightSidebarTabs}
          activeTab={activeRightTab}
          open={rightSidebarOpen}
          kicker="Workspace sidebar"
          railLabel="Sidebar tabs"
          closeIcon={<CloseIcon />}
          classes={{
            shell: rightSidebarShell,
            panel: rightSidebarPanel,
            rail: rightSidebarRail,
            tab: rightSidebarTab,
            tabActive: rightSidebarTabActive,
            tabIcon: rightSidebarTabIcon,
            tabLabel: rightSidebarTabLabel,
            header: rightPanelHeader,
            kicker: rightPanelKicker,
            title: rightPanelTitle,
            close: rightPanelClose,
            body: rightPanelBody,
          }}
          onActiveTabChange={setActiveRightTab}
          onOpenChange={setRightSidebarOpen}
        />

        <WorkspaceQuickSearch
          open={showQuickSearch}
          query={quickSearchQuery}
          docs={quickSearchDocs}
          isCreating={isCreating}
          onQueryChange={setQuickSearchQuery}
          onClose={() => {
            setShowQuickSearch(false);
            setQuickSearchQuery('');
          }}
          onOpenDoc={openDocument}
          onCreateDocument={handleCreateDoc}
        />
      </div>
    </div>
  );
}
