import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  LocalWorkspaceIcon,
  PlusIcon,
  SearchIcon,
} from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

export interface WorkspaceLeftSidebarClasses {
  root: string;
  closed: string;
  header: string;
  workspaceBar: string;
  backLink: string;
  mark: string;
  headerText: string;
  headerTitle: string;
  headerMeta: string;
  userButton: string;
  avatar: string;
  primary: string;
  quickSearchRow: string;
  quickSearchButton: string;
  quickNewButton: string;
  nav: string;
  navItem: string;
  navItemActive: string;
  navIcon: string;
  navLabel: string;
  scrollable: string;
  sectionRoot: string;
  sectionTrigger: string;
  sectionTitle: string;
  sectionLabel: string;
  sectionChevron: string;
  sectionActions: string;
  sectionContent: string;
  footer?: string;
  userInfo?: string;
  userText?: string;
  userName?: string;
  userEmail?: string;
}

export interface WorkspaceSidebarNavItem<T extends string = string> {
  id: T;
  icon: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: () => void;
}

export interface WorkspaceSidebarSection {
  id: string;
  title: string;
  collapsed: boolean;
  action?: ReactNode;
  children: ReactNode;
  onToggle: () => void;
}

interface WorkspaceLeftSidebarProps<T extends string = string> {
  open: boolean;
  workspaceId: string;
  workspaceTitle?: string;
  initials: string;
  userName?: string;
  userEmail?: string;
  userTitle?: string;
  backHref: string;
  backTitle: string;
  backIcon?: ReactNode;
  workspaceIcon?: ReactNode;
  workspaceSwitcher?: ReactNode;
  quickSearchIcon?: ReactNode;
  newDocumentIcon?: ReactNode;
  quickSearchLabel?: string;
  newDocumentTitle?: string;
  isCreating?: boolean;
  navItems: WorkspaceSidebarNavItem<T>[];
  sections: WorkspaceSidebarSection[];
  classes: WorkspaceLeftSidebarClasses;
  showFooterUser?: boolean;
  onBack: () => void;
  onQuickSearch?: () => void;
  onCreateDocument: () => void;
  onUserClick?: () => void;
}

export function WorkspaceLeftSidebar<T extends string = string>({
  open,
  workspaceId,
  workspaceTitle = 'Workspace',
  initials,
  userName,
  userEmail,
  userTitle,
  backHref,
  backTitle,
  backIcon,
  workspaceIcon,
  workspaceSwitcher,
  quickSearchIcon,
  newDocumentIcon,
  quickSearchLabel = 'Quick search',
  newDocumentTitle = 'New document',
  isCreating = false,
  navItems,
  sections,
  classes,
  showFooterUser = false,
  onBack,
  onQuickSearch,
  onCreateDocument,
  onUserClick,
}: WorkspaceLeftSidebarProps<T>) {
  return (
    <div className={`${classes.root} ${open ? '' : classes.closed}`}>
      <div className={classes.header}>
        {workspaceSwitcher ?? (
          <div className={classes.workspaceBar}>
            <a
              href={backHref}
              className={classes.backLink}
              onClick={(event) => {
                event.preventDefault();
                onBack();
              }}
              title={backTitle}
            >
              {backIcon ?? <ArrowLeftSmallIcon />}
            </a>
            <div className={classes.mark}>
              {workspaceIcon ?? <LocalWorkspaceIcon />}
            </div>
            <div className={classes.headerText}>
              <div className={classes.headerTitle}>{workspaceTitle}</div>
              <div className={classes.headerMeta}>
                {workspaceId.slice(0, 8)}
              </div>
            </div>
          </div>
        )}
        {!showFooterUser ? (
          <button
            type="button"
            className={classes.userButton}
            onClick={onUserClick}
            title={userTitle ?? userEmail ?? 'User'}
            disabled={!onUserClick}
          >
            <div className={classes.avatar}>{initials}</div>
          </button>
        ) : null}
      </div>

      <div className={classes.primary}>
        <div className={classes.quickSearchRow}>
          <button
            type="button"
            className={classes.quickSearchButton}
            onClick={onQuickSearch}
          >
            <span className={classes.navIcon}>
              {quickSearchIcon ?? <SearchIcon />}
            </span>
            <span className={classes.navLabel}>{quickSearchLabel}</span>
          </button>
          <button
            type="button"
            className={classes.quickNewButton}
            onClick={onCreateDocument}
            disabled={isCreating}
            title={newDocumentTitle}
          >
            {newDocumentIcon ?? <PlusIcon />}
          </button>
        </div>
        <div className={classes.nav}>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${classes.navItem} ${
                item.active ? classes.navItemActive : ''
              }`}
              onClick={item.onClick}
              disabled={item.disabled}
              title={item.title ?? item.label}
            >
              <span className={classes.navIcon}>{item.icon}</span>
              <span className={classes.navLabel}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={classes.scrollable}>
        {sections.map((section) => (
          <div
            key={section.id}
            className={classes.sectionRoot}
            data-collapsed={section.collapsed}
          >
            <button
              type="button"
              className={classes.sectionTrigger}
              onClick={section.onToggle}
              aria-expanded={!section.collapsed}
            >
              <span className={classes.sectionTitle}>
                <span className={classes.sectionLabel}>{section.title}</span>
                <span className={classes.sectionChevron} aria-hidden="true">
                  <ArrowRightSmallIcon />
                </span>
              </span>
              {section.action ? (
                <span
                  className={classes.sectionActions}
                  onClick={(event) => event.stopPropagation()}
                >
                  {section.action}
                </span>
              ) : null}
            </button>
            {!section.collapsed ? (
              <div className={classes.sectionContent}>{section.children}</div>
            ) : null}
          </div>
        ))}
      </div>

      {showFooterUser &&
      classes.footer &&
      classes.userInfo &&
      classes.userText &&
      classes.userName &&
      classes.userEmail ? (
        <div className={classes.footer}>
          <div className={classes.userInfo} onClick={onUserClick} title={userTitle}>
            <div className={classes.avatar}>{initials}</div>
            <div className={classes.userText}>
              <div className={classes.userName}>{userName}</div>
              <div className={classes.userEmail}>{userEmail}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
