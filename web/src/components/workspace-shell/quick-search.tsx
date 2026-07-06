import { PageIcon, PlusIcon, SearchIcon } from '@blocksuite/icons/rc';

import * as classes from './quick-search.css';

export interface WorkspaceQuickSearchDoc {
  id: string;
  title: string;
  updatedLabel?: string;
}

interface WorkspaceQuickSearchProps {
  open: boolean;
  query: string;
  docs: WorkspaceQuickSearchDoc[];
  isCreating?: boolean;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenDoc: (docId: string) => void;
  onCreateDocument: () => void | Promise<void>;
}

export function WorkspaceQuickSearch({
  open,
  query,
  docs,
  isCreating = false,
  onQueryChange,
  onClose,
  onOpenDoc,
  onCreateDocument,
}: WorkspaceQuickSearchProps) {
  if (!open) {
    return null;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleDocs = docs
    .filter((doc) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        doc.title.toLowerCase().includes(normalizedQuery) ||
        doc.id.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 10);
  const emptyTitle = docs.length === 0 ? 'No documents yet' : 'No matches';
  const emptyMeta =
    docs.length === 0
      ? 'Create a document to start writing in this workspace.'
      : 'Try another title or create a new document.';

  return (
    <div
      className={classes.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={classes.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Quick search"
      >
        <label className={classes.field}>
          <span className={classes.fieldIcon}>
            <SearchIcon />
          </span>
          <input
            autoFocus
            className={classes.input}
            value={query}
            placeholder="Search documents"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onClose();
              }
            }}
          />
        </label>

        <div className={classes.body}>
          {visibleDocs.length > 0 ? (
            <>
              <div className={classes.sectionTitle}>Documents</div>
              {visibleDocs.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className={classes.item}
                  onClick={() => onOpenDoc(doc.id)}
                >
                  <span className={classes.itemIcon}>
                    <PageIcon />
                  </span>
                  <span className={classes.itemMain}>
                    <span className={classes.itemTitle}>{doc.title}</span>
                    <span className={classes.itemMeta}>
                      {doc.updatedLabel ?? doc.id}
                    </span>
                  </span>
                </button>
              ))}
            </>
          ) : (
            <div className={classes.empty}>
              <div className={classes.emptyTitle}>{emptyTitle}</div>
              <div className={classes.emptyMeta}>{emptyMeta}</div>
              <button
                type="button"
                className={classes.createButton}
                onClick={onCreateDocument}
                disabled={isCreating}
              >
                <PlusIcon />
                {isCreating ? 'Creating...' : 'New doc'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
