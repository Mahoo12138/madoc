import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  AiOutlineIcon,
  AllDocsIcon,
  ArrowLeftSmallIcon,
  BackwardPanelIcon,
  CloseIcon,
  CommentIcon,
  DeleteIcon,
  EdgelessIcon,
  FavoriteIcon,
  ForwardPanelIcon,
  InfoIcon,
  JournalIcon,
  MoreHorizontalIcon,
  PageIcon,
  PlusIcon,
  PresentationIcon,
  SearchIcon,
  ShareIcon,
  SidebarIcon,
} from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '@/api/hooks';
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
  getDocFavorite,
  getDocDisplayTitle,
  isDocTrashed,
  loadWorkspaceDocMetadata,
  reconcileWorkspaceDocMetadata,
  updateDocMetadata,
  type DocMetadataMap,
} from '@/utils/doc-metadata';
import { Editor, initEditorEffects } from '@madoc/editor';
import type { Store } from '@blocksuite/affine/store';
import {
  createEmptyDoc,
  createMadocWorkspace,
  createNewDoc,
  getDoc,
  getDocYjsUpdate,
  initializeDocContent,
  setDocTitle,
  DocFrontend,
  SocketProvider,
  IDBDocStorage,
  type DocSyncStatus,
} from '@madoc/doc';

import {
  editorActions,
  editorAppHeaderButton,
  editorAppMeta,
  editorAppTab,
  editorAppTabActive,
  editorAppTabAdd,
  editorAppTabClose,
  editorAppTabFavorite,
  editorAppTabFavoriteActive,
  editorAppTabIcon,
  editorAppTabLabel,
  editorAppTabsCenter,
  editorAppTabsHeader,
  editorAppTabsLeft,
  editorAppTabsRight,
  editorAppViewMain,
  editorBackLink,
  editorContainer,
  editorDocInfo,
  editorDocTitle,
  editorDocTitleInput,
  editorError,
  editorHeaderDivider,
  editorHeaderIconButton,
  editorHeaderIconButtonActive,
  editorLayout,
  editorLoading,
  editorMain,
  editorModeButton,
  editorModeButtonActive,
  editorModeSwitch,
  editorNav,
  editorNavIcon,
  editorNavItem,
  editorNavItemActive,
  editorNavLabel,
  editorNavMeta,
  editorNavSectionActions,
  editorNavSection,
  editorNavSectionAction,
  editorNavSectionChevron,
  editorNavSectionContent,
  editorNavSectionRoot,
  editorNavSectionTitle,
  editorNavSectionTrigger,
  editorQuickNewButton,
  editorQuickSearchButton,
  editorQuickSearchRow,
  editorRecentDocItem,
  editorRecentDocMeta,
  editorRecentDocTitle,
  editorQuietButton,
  editorRightInfoCard,
  editorRightInfoLabel,
  editorRightInfoValue,
  editorRightPanelBody,
  editorRightPanelClose,
  editorRightPanelHeader,
  editorRightPanelKicker,
  editorRightPanelMeta,
  editorRightPanelTitle,
  editorRightSidebarPanel,
  editorRightSidebarRail,
  editorRightSidebarShell,
  editorRightSidebarTab,
  editorRightSidebarTabActive,
  editorRightSidebarTabIcon,
  editorRightSidebarTabLabel,
  editorRightTimeline,
  editorRightTimelineItem,
  editorRightTimelineMeta,
  editorRightTimelineTitle,
  editorShareButton,
  editorSidebar,
  editorSidebarClosed,
  editorSidebarHeader,
  editorSidebarMeta,
  editorSidebarPrimary,
  editorSidebarScrollable,
  editorSidebarText,
  editorSidebarTitle,
  editorSidebarFooter,
  editorSidebarUserButton,
  editorSidebarWorkspaceBar,
  editorSyncStatus,
  editorTopbar,
  editorTopbarPrimary,
  editorUserAvatar,
  editorUserEmail,
  editorUserInfo,
  editorUserName,
  editorUserText,
  editorWorkspaceMark,
} from './workspace.$workspaceId.$docId.css';

initEditorEffects();

export const Route = createFileRoute('/workspace/$workspaceId/$docId')({
  component: DocEditorPage,
});

type EditorSidebarSectionId =
  | 'favorites'
  | 'organize'
  | 'recently-updated'
  | 'tags'
  | 'collections'
  | 'others';

type EditorRightSidebarTab = 'outline' | 'comments' | 'info';
type EditorMode = 'page' | 'edgeless';

type StoreRootTitle = {
  props?: {
    title?: {
      length?: number;
      clear?: () => void;
      insert?: (content: string, index: number) => void;
      replace?: (index: number, length: number, content: string) => void;
      toString?: () => string;
    };
  };
};

const fallbackDocTitle = 'Untitled';

function normalizeDocTitle(title?: string): string {
  const next = title?.trim();
  return next || fallbackDocTitle;
}

function getStoreRootTitle(store: Store): string {
  const rootTitle = (store.root as StoreRootTitle | null)?.props?.title;
  return rootTitle?.toString?.().trim() ?? '';
}

function setStoreRootTitle(store: Store, title: string): void {
  const rootTitle = (store.root as StoreRootTitle | null)?.props?.title;
  if (!rootTitle) return;

  const nextTitle = normalizeDocTitle(title);
  const currentTitle = rootTitle.toString?.() ?? '';
  if (normalizeDocTitle(currentTitle) === nextTitle) return;

  if (rootTitle.replace) {
    rootTitle.replace(0, rootTitle.length ?? currentTitle.length, nextTitle);
    return;
  }

  if (rootTitle.clear && rootTitle.insert) {
    rootTitle.clear();
    rootTitle.insert(nextTitle, 0);
  }
}

function DocEditorPage() {
  const navigate = useNavigate();
  const { workspaceId, docId } = Route.useParams();
  const session = useSession();

  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [showQuickSearch, setShowQuickSearch] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [editorMode, setEditorMode] = useState<EditorMode>('page');
  const [syncStatus, setSyncStatus] = useState<DocSyncStatus>('connecting');
  const [activeRightTab, setActiveRightTab] =
    useState<EditorRightSidebarTab>('outline');
  const [collapsedSections, setCollapsedSections] = useState<
    Record<EditorSidebarSectionId, boolean>
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

  const title = getDocDisplayTitle(docMetadata, docId);
  const [titleDraft, setTitleDraft] = useState(title);
  const getTitle = (id: string) => getDocDisplayTitle(docMetadata, id);
  const isDocFavorite = (id: string) => getDocFavorite(docMetadata, id);
  const syncStatusLabel =
    syncStatus === 'connecting'
      ? 'Connecting'
      : syncStatus === 'loading'
        ? 'Loading'
        : syncStatus === 'syncing'
          ? 'Saving'
          : syncStatus === 'error'
            ? 'Save failed'
            : 'Saved';

  useEffect(() => {
    setDocMetadata(loadWorkspaceDocMetadata(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    setTitleDraft(title);
  }, [title]);

  const applyTitle = (rawTitle: string, options?: { updateDraft?: boolean }) => {
    const nextTitle = normalizeDocTitle(rawTitle);
    if (store) {
      setStoreRootTitle(store, nextTitle);
    }
    if (collectionRef.current) {
      setDocTitle(collectionRef.current, docId, nextTitle);
    }
    const next = updateDocMetadata(workspaceId, docId, {
      title: nextTitle,
      updatedAt: Date.now(),
    });
    setDocMetadata(next);
    if (options?.updateDraft !== false) {
      setTitleDraft(getDocDisplayTitle(next, docId));
    }
  };

  const commitTitle = () => {
    applyTitle(titleDraft);
  };

  const handleTitleDraftChange = (value: string) => {
    setTitleDraft(value);
    if (value.trim()) {
      applyTitle(value, { updateDraft: false });
    }
  };

  const goWorkspace = () => {
    navigate({
      to: '/workspace/$workspaceId',
      params: { workspaceId },
    });
  };

  const handleCreateDoc = async () => {
    if (!collectionRef.current || !socketRef.current || isCreating) {
      return;
    }

    setShowQuickSearch(false);
    setQuickSearchQuery('');
    setIsCreating(true);
    try {
      const nextDocId = createNewDoc(collectionRef.current);
      setDocTitle(collectionRef.current, nextDocId, 'Untitled');
      const yjsUpdate = getDocYjsUpdate(collectionRef.current, nextDocId);

      if (yjsUpdate) {
        await socketRef.current.pushDocUpdate(workspaceId, nextDocId, yjsUpdate);
      }

      const now = Date.now();
      setDocTimestamps((prev) => ({
        ...prev,
        [nextDocId]: now,
      }));
      setDocMetadata(
        updateDocMetadata(workspaceId, nextDocId, {
          title: 'Untitled',
          createdAt: now,
          updatedAt: now,
        })
      );

      navigate({
        to: '/workspace/$workspaceId/$docId',
        params: { workspaceId, docId: nextDocId },
      });
    } catch (err) {
      console.error('[DocEditor] Failed to create document:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const docIds = Object.keys(docTimestamps).filter(
    (id) => !isDocTrashed(docMetadata, id)
  ).sort(
    (a, b) => (docTimestamps[b] ?? 0) - (docTimestamps[a] ?? 0)
  );
  const favoriteDocIds = docIds.filter(isDocFavorite);
  const currentDocFavorite = isDocFavorite(docId);
  const recentDocIds = docIds.filter((id) => id !== docId).slice(0, 5);
  const formatDocTime = (id: string) => {
    const timestamp = docTimestamps[id];
    if (!timestamp) {
      return 'Unknown';
    }

    return new Date(timestamp).toLocaleString();
  };
  const quickSearchDocs: WorkspaceQuickSearchDoc[] = docIds.map((searchDocId) => ({
    id: searchDocId,
    title: getTitle(searchDocId),
    updatedLabel: `Updated ${formatDocTime(searchDocId)}`,
  }));
  const openDocument = (nextDocId: string) => {
    setShowQuickSearch(false);
    setQuickSearchQuery('');
    navigate({
      to: '/workspace/$workspaceId/$docId',
      params: { workspaceId, docId: nextDocId },
    });
  };
  const toggleCurrentDocFavorite = () => {
    setDocMetadata(
      updateDocMetadata(workspaceId, docId, {
        favorite: !currentDocFavorite,
      })
    );
  };
  const openRightSidebar = (tab: EditorRightSidebarTab) => {
    setActiveRightTab(tab);
    setRightSidebarOpen(true);
  };
  const user = session.data?.user;
  const initials =
    user?.name
      .split(' ')
      .map((s) => s[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'M';
  const rightSidebarTabs: WorkspaceRightSidebarTab<EditorRightSidebarTab>[] = [
    {
      id: 'outline',
      icon: <AiOutlineIcon />,
      label: 'Outline',
      title: 'Outline',
      content: (
        <>
          <div className={editorRightTimeline}>
            <button type="button" className={editorRightTimelineItem}>
              <span className={editorRightTimelineTitle}>{title}</span>
              <span className={editorRightTimelineMeta}>Top level document</span>
            </button>
          </div>
          <div className={editorRightPanelMeta}>
            Headings will appear here as the document grows.
          </div>
        </>
      ),
    },
    {
      id: 'comments',
      icon: <CommentIcon />,
      label: 'Comments',
      title: 'Comments',
      content: (
        <>
          <div className={editorRightInfoCard}>
            <div className={editorRightInfoLabel}>No comments</div>
            <div className={editorRightInfoValue}>
              Comment threads will appear here.
            </div>
          </div>
          <div className={editorRightPanelMeta}>
            Select text in the editor to start a discussion.
          </div>
        </>
      ),
    },
    {
      id: 'info',
      icon: <InfoIcon />,
      label: 'Info',
      title: 'Document info',
      content: (
        <>
          <div className={editorRightInfoCard}>
            <div className={editorRightInfoLabel}>Document</div>
            <div className={editorRightInfoValue}>{docId}</div>
          </div>
          <div className={editorRightInfoCard}>
            <div className={editorRightInfoLabel}>Workspace</div>
            <div className={editorRightInfoValue}>{workspaceId}</div>
          </div>
          <div className={editorRightInfoCard}>
            <div className={editorRightInfoLabel}>Updated</div>
            <div className={editorRightInfoValue}>{formatDocTime(docId)}</div>
          </div>
          <div className={editorRightInfoCard}>
            <div className={editorRightInfoLabel}>Signed in as</div>
            <div className={editorRightInfoValue}>
              {user?.email ?? 'Unknown user'}
            </div>
          </div>
        </>
      ),
    },
  ];
  const toggleSection = (section: EditorSidebarSectionId) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };
  const sidebarNavItems: WorkspaceSidebarNavItem[] = [
    {
      id: 'all-docs',
      icon: <AllDocsIcon />,
      label: 'All Documents',
      onClick: goWorkspace,
    },
    {
      id: 'journals',
      icon: <JournalIcon />,
      label: 'Journals',
      disabled: true,
    },
    {
      id: 'current-doc',
      icon: <PageIcon />,
      label: title,
      title,
      active: true,
    },
  ];
  const sidebarSections: WorkspaceSidebarSection[] = [
    {
      id: 'favorites',
      title: 'Favorites',
      collapsed: collapsedSections.favorites,
      onToggle: () => toggleSection('favorites'),
      action: (
        <span
          className={editorNavSectionAction}
          title="Add favorite"
          aria-hidden="true"
        >
          <FavoriteIcon />
        </span>
      ),
      children:
        favoriteDocIds.length === 0 ? (
          <div className={editorNavMeta}>No favorite documents</div>
        ) : (
          favoriteDocIds.slice(0, 5).map((favoriteDocId) => (
            <button
              key={favoriteDocId}
              type="button"
              className={editorRecentDocItem}
              onClick={() => openDocument(favoriteDocId)}
            >
              <span className={editorNavIcon}>
                <FavoriteIcon />
              </span>
              <span className={editorRecentDocTitle}>
                {getTitle(favoriteDocId)}
              </span>
              <span className={editorRecentDocMeta}>
                {docTimestamps[favoriteDocId]
                  ? new Date(docTimestamps[favoriteDocId]).toLocaleDateString()
                  : 'Unknown'}
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
        <span
          className={editorNavSectionAction}
          title="New folder"
          aria-hidden="true"
        >
          <PlusIcon />
        </span>
      ),
      children: <div className={editorNavMeta}>No folders yet</div>,
    },
    {
      id: 'recently-updated',
      title: 'Recently updated',
      collapsed: collapsedSections['recently-updated'],
      onToggle: () => toggleSection('recently-updated'),
      children:
        recentDocIds.length === 0 ? (
          <div className={editorNavMeta}>No other recent documents</div>
        ) : (
          recentDocIds.map((recentDocId) => (
            <button
              key={recentDocId}
              type="button"
              className={editorRecentDocItem}
              onClick={() => {
                navigate({
                  to: '/workspace/$workspaceId/$docId',
                  params: { workspaceId, docId: recentDocId },
                });
              }}
            >
              <span className={editorNavIcon}>
                <PageIcon />
              </span>
              <span className={editorRecentDocTitle}>
                {getTitle(recentDocId)}
              </span>
              <span className={editorRecentDocMeta}>
                {docTimestamps[recentDocId]
                  ? new Date(docTimestamps[recentDocId]).toLocaleDateString()
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
        <span
          className={editorNavSectionAction}
          title="New tag"
          aria-hidden="true"
        >
          <PlusIcon />
        </span>
      ),
      children: <div className={editorNavMeta}>No tags yet</div>,
    },
    {
      id: 'collections',
      title: 'Collections',
      collapsed: collapsedSections.collections,
      onToggle: () => toggleSection('collections'),
      action: (
        <span
          className={editorNavSectionAction}
          title="New collection"
          aria-hidden="true"
        >
          <PlusIcon />
        </span>
      ),
      children: <div className={editorNavMeta}>No collections yet</div>,
    },
    {
      id: 'others',
      title: 'Others',
      collapsed: collapsedSections.others,
      onToggle: () => toggleSection('others'),
      children: (
        <button type="button" className={editorNavItem} disabled>
          <span className={editorNavIcon}>
            <DeleteIcon />
          </span>
          <span className={editorNavLabel}>Trash</span>
        </button>
      ),
    },
  ];

  const sidebar = (
    <WorkspaceLeftSidebar
      open={sidebarOpen}
      workspaceId={workspaceId}
      initials={initials}
      userName={user?.name}
      userEmail={user?.email}
      userTitle={user ? user.email : 'User'}
      backHref={`/workspace/${workspaceId}`}
      backTitle="All documents"
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
      onBack={goWorkspace}
      onQuickSearch={() => setShowQuickSearch(true)}
      onCreateDocument={handleCreateDoc}
      classes={{
        root: editorSidebar,
        closed: editorSidebarClosed,
        header: editorSidebarHeader,
        workspaceBar: editorSidebarWorkspaceBar,
        backLink: editorBackLink,
        mark: editorWorkspaceMark,
        headerText: editorSidebarText,
        headerTitle: editorSidebarTitle,
        headerMeta: editorSidebarMeta,
        userButton: editorSidebarUserButton,
        avatar: editorUserAvatar,
        primary: editorSidebarPrimary,
        quickSearchRow: editorQuickSearchRow,
        quickSearchButton: editorQuickSearchButton,
        quickNewButton: editorQuickNewButton,
        nav: editorNav,
        navItem: editorNavItem,
        navItemActive: editorNavItemActive,
        navIcon: editorNavIcon,
        navLabel: editorNavLabel,
        scrollable: editorSidebarScrollable,
        sectionRoot: editorNavSectionRoot,
        sectionTrigger: editorNavSectionTrigger,
        sectionTitle: editorNavSectionTitle,
        sectionLabel: editorNavSection,
        sectionChevron: editorNavSectionChevron,
        sectionActions: editorNavSectionActions,
        sectionContent: editorNavSectionContent,
        footer: editorSidebarFooter,
        userInfo: editorUserInfo,
        userText: editorUserText,
        userName: editorUserName,
        userEmail: editorUserEmail,
      }}
    />
  );

  const rightSidebar = (
    <WorkspaceRightSidebar
      tabs={rightSidebarTabs}
      activeTab={activeRightTab}
      open={rightSidebarOpen}
      kicker="Document sidebar"
      railLabel="Document sidebar tabs"
      closeIcon={<CloseIcon />}
      classes={{
        shell: editorRightSidebarShell,
        panel: editorRightSidebarPanel,
        rail: editorRightSidebarRail,
        tab: editorRightSidebarTab,
        tabActive: editorRightSidebarTabActive,
        tabIcon: editorRightSidebarTabIcon,
        tabLabel: editorRightSidebarTabLabel,
        header: editorRightPanelHeader,
        kicker: editorRightPanelKicker,
        title: editorRightPanelTitle,
        close: editorRightPanelClose,
        body: editorRightPanelBody,
      }}
      onActiveTabChange={setActiveRightTab}
      onOpenChange={setRightSidebarOpen}
    />
  );

  const renderShell = (children: ReactNode, showSidebar = true) => (
    <div className={editorLayout}>
      <div className={editorAppTabsHeader}>
        <div className={editorAppTabsLeft}>
          <button
            type="button"
            className={editorAppHeaderButton}
            onClick={() => setSidebarOpen((open) => !open)}
            aria-pressed={sidebarOpen}
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <SidebarIcon />
          </button>
          <button type="button" className={editorAppHeaderButton} onClick={goWorkspace}>
            <BackwardPanelIcon />
          </button>
          <button type="button" className={editorAppHeaderButton} disabled>
            <ForwardPanelIcon />
          </button>
        </div>
        <div className={editorAppTabsCenter}>
          <button type="button" className={editorAppTab} onClick={goWorkspace}>
            <span className={editorAppTabIcon}>
              <AllDocsIcon />
            </span>
            <span className={editorAppTabLabel}>All Documents</span>
          </button>
          <div className={`${editorAppTab} ${editorAppTabActive}`}>
            <span className={editorAppTabIcon}>
              <PageIcon />
            </span>
            <span className={editorAppTabLabel}>{title}</span>
            <button
              type="button"
              className={`${editorAppTabFavorite} ${
                currentDocFavorite ? editorAppTabFavoriteActive : ''
              }`}
              aria-pressed={currentDocFavorite}
              title={
                currentDocFavorite ? 'Remove from Favorites' : 'Add to Favorites'
              }
              onClick={toggleCurrentDocFavorite}
            >
              <FavoriteIcon />
            </button>
            <button
              type="button"
              className={editorAppTabClose}
              onClick={goWorkspace}
              title="Close document tab"
            >
              <CloseIcon />
            </button>
          </div>
          <button
            type="button"
            className={editorAppTabAdd}
            onClick={handleCreateDoc}
            disabled={isCreating}
            title="New document"
          >
            <PlusIcon />
          </button>
        </div>
        <div className={editorAppTabsRight}>
          <span className={editorAppMeta}>{workspaceId.slice(0, 8)}...</span>
        </div>
      </div>
      <div className={editorAppViewMain}>
        {showSidebar ? sidebar : null}
        <div className={editorMain}>{children}</div>
        {showSidebar ? rightSidebar : null}
        {showSidebar ? (
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
        ) : null}
      </div>
    </div>
  );

  useEffect(() => {
    const socket = new SocketProvider();
    const idb = new IDBDocStorage();
    const collection = createMadocWorkspace(workspaceId);
    let mounted = true;
    let metaSubscription: { unsubscribe?: () => void } | null = null;
    const frontend = new DocFrontend(socket, idb, {
      onSyncStatusChange: status => {
        if (mounted) {
          setSyncStatus(status);
        }
      },
    });

    socketRef.current = socket;
    collectionRef.current = collection;

    const init = async () => {
      try {
        setError(null);
        setStore(null);
        setSyncStatus('connecting');

        await frontend.start(workspaceId);
        const timestamps = await socket.loadDocTimestamps(workspaceId);
        if (mounted) {
          const reconciledMetadata = reconcileWorkspaceDocMetadata(
            workspaceId,
            timestamps
          );
          setDocTimestamps(timestamps);
          setDocMetadata(
            reconciledMetadata[docId]
              ? reconciledMetadata
              : updateDocMetadata(workspaceId, docId, {
                  title: 'Untitled',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                })
          );
        }

        // Ensure doc exists locally
        const existingDoc = getDoc(collection, docId);
        if (!existingDoc) {
          createEmptyDoc(collection, docId);
        }

        // Get the Yjs doc and connect to sync
        const currentDoc = getDoc(collection, docId);
        if (!currentDoc) throw new Error('Failed to get doc');

        const yDoc = currentDoc.spaceDoc;
        if (!yDoc) throw new Error('Doc has no Yjs document');

        // Load from server and start sync
        await frontend.connectDoc(docId, yDoc);
        initializeDocContent(currentDoc);

        // Get store for editor
        const docStore = currentDoc.getStore();
        const localMetadata = loadWorkspaceDocMetadata(workspaceId);
        const localTitle = getDocDisplayTitle(localMetadata, docId);
        const rootTitle = getStoreRootTitle(docStore);
        const syncedTitle = normalizeDocTitle(rootTitle || localTitle);

        if (!rootTitle) {
          setStoreRootTitle(docStore, syncedTitle);
        }
        setDocTitle(collection, docId, syncedTitle);
        setDocMetadata(
          updateDocMetadata(workspaceId, docId, {
            title: syncedTitle,
            updatedAt: timestamps[docId] ?? Date.now(),
          })
        );

        metaSubscription = collection.meta.docMetaUpdated.subscribe(() => {
          if (!mounted) return;

          const nextTitle = normalizeDocTitle(
            collection.meta.getDocMeta(docId)?.title
          );
          const currentTitle = getDocDisplayTitle(
            loadWorkspaceDocMetadata(workspaceId),
            docId
          );
          if (nextTitle === currentTitle) return;

          setDocMetadata(
            updateDocMetadata(workspaceId, docId, {
              title: nextTitle,
              updatedAt: Date.now(),
            })
          );
          setDocTimestamps(prev => ({
            ...prev,
            [docId]: Date.now(),
          }));
        });

        if (mounted) {
          setStore(docStore);
        }
      } catch (err) {
        console.error('[DocEditor] Failed to initialize:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      metaSubscription?.unsubscribe?.();
      socketRef.current = null;
      collectionRef.current = null;
      frontend.disconnectDoc(docId);
      frontend.stop();
      idb.destroy();
    };
  }, [workspaceId, docId]);

  if (session.isLoading || !session.data?.user) {
    return renderShell(<div className={editorLoading}>Loading...</div>, false);
  }

  if (error) {
    return renderShell(
      <div className={editorError}>
        <div>Error: {error}</div>
        <button type="button" className={editorQuietButton} onClick={goWorkspace}>
          Back to Workspace
        </button>
      </div>
    );
  }

  if (!store) {
    return renderShell(
      <>
        <div className={editorTopbar}>
          <div className={editorTopbarPrimary}>
            <div className={editorDocInfo}>
              <div className={editorDocTitle}>{title}</div>
            </div>
          </div>
        </div>
        <div className={editorLoading}>Loading document...</div>
      </>
    );
  }

  return renderShell(
    <>
      <div className={editorTopbar}>
        <div className={editorTopbarPrimary}>
          <span className={editorHeaderIconButton} title={editorMode}>
            {editorMode === 'page' ? <PageIcon /> : <EdgelessIcon />}
          </span>
          <input
            className={editorDocTitleInput}
            value={titleDraft}
            aria-label="Document title"
            onChange={(event) => handleTitleDraftChange(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
              if (event.key === 'Escape') {
                setTitleDraft(title);
                event.currentTarget.blur();
              }
            }}
          />
          <div className={editorModeSwitch} aria-label="Editor mode">
            <button
              type="button"
              className={`${editorModeButton} ${
                editorMode === 'page' ? editorModeButtonActive : ''
              }`}
              onClick={() => setEditorMode('page')}
              aria-pressed={editorMode === 'page'}
              title="Page mode"
            >
              <PageIcon />
            </button>
            <button
              type="button"
              className={`${editorModeButton} ${
                editorMode === 'edgeless' ? editorModeButtonActive : ''
              }`}
              onClick={() => setEditorMode('edgeless')}
              aria-pressed={editorMode === 'edgeless'}
              title="Edgeless mode"
            >
              <EdgelessIcon />
            </button>
          </div>
          <div className={editorActions}>
            <button
              type="button"
              className={`${editorHeaderIconButton} ${
                currentDocFavorite ? editorHeaderIconButtonActive : ''
              }`}
              aria-pressed={currentDocFavorite}
              title={
                currentDocFavorite ? 'Remove from Favorites' : 'Add to Favorites'
              }
              onClick={toggleCurrentDocFavorite}
            >
              <FavoriteIcon />
            </button>
            <button
              type="button"
              className={editorHeaderIconButton}
              title="Document info"
              onClick={() => openRightSidebar('info')}
            >
              <InfoIcon />
            </button>
            <button
              type="button"
              className={editorHeaderIconButton}
              title="More actions"
            >
              <MoreHorizontalIcon />
            </button>
          </div>
        </div>
        <div className={editorActions}>
          <span className={editorSyncStatus} data-status={syncStatus}>
            {syncStatusLabel}
          </span>
          <button
            type="button"
            className={editorHeaderIconButton}
            title="Present"
          >
            <PresentationIcon />
          </button>
          <div className={editorHeaderDivider} />
          <button type="button" className={editorShareButton}>
            <ShareIcon />
            Share
          </button>
        </div>
      </div>
      <div className={editorContainer}>
        <Editor store={store} mode={editorMode} />
      </div>
    </>
  );
}
