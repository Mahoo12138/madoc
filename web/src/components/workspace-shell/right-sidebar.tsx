import { CloseIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

export interface WorkspaceRightSidebarTab<T extends string> {
  id: T;
  icon: ReactNode;
  label: string;
  title: string;
  content: ReactNode;
}

export interface WorkspaceRightSidebarClasses {
  shell: string;
  panel: string;
  rail: string;
  tab: string;
  tabActive: string;
  tabIcon: string;
  tabLabel: string;
  header: string;
  kicker: string;
  title: string;
  close: string;
  body: string;
}

interface WorkspaceRightSidebarProps<T extends string> {
  tabs: WorkspaceRightSidebarTab<T>[];
  activeTab: T;
  open: boolean;
  kicker: string;
  railLabel: string;
  closeIcon?: ReactNode;
  classes: WorkspaceRightSidebarClasses;
  onActiveTabChange: (tab: T) => void;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceRightSidebar<T extends string>({
  tabs,
  activeTab,
  open,
  kicker,
  railLabel,
  closeIcon,
  classes,
  onActiveTabChange,
  onOpenChange,
}: WorkspaceRightSidebarProps<T>) {
  const activePanel = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];

  return (
    <div className={classes.shell} data-open={open}>
      {open && activePanel ? (
        <aside className={classes.panel} aria-label={activePanel.title}>
          <div className={classes.header}>
            <div>
              <div className={classes.kicker}>{kicker}</div>
              <div className={classes.title}>{activePanel.title}</div>
            </div>
            <button
              type="button"
              className={classes.close}
              onClick={() => onOpenChange(false)}
              title="Close sidebar"
            >
              {closeIcon ?? <CloseIcon />}
            </button>
          </div>

          <div className={classes.body}>{activePanel.content}</div>
        </aside>
      ) : null}

      <div className={classes.rail} aria-label={railLabel}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${classes.tab} ${
              open && activeTab === tab.id ? classes.tabActive : ''
            }`}
            onClick={() => {
              onActiveTabChange(tab.id);
              onOpenChange(true);
            }}
            title={tab.label}
            aria-pressed={open && activeTab === tab.id}
          >
            <span className={classes.tabIcon}>{tab.icon}</span>
            <span className={classes.tabLabel}>{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
