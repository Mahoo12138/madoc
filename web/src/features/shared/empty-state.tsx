import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import * as styles from './empty-state.css';

/**
 * Every surface that can legitimately hold nothing routes through here, so an
 * empty screen always answers three questions in order: what belongs here, why
 * it is worth having, and what to do next.
 *
 * `size` picks the frame; `tone` picks the copy shape. The component never
 * invents an action the caller cannot perform — permission-limited surfaces
 * pass `note` instead of `actions`.
 */
export type EmptyStateSize = 'page' | 'section' | 'inline';

export type EmptyStateProps = {
  /**
   * Which context the emptiness belongs to. Drives the frame, the presence of
   * an icon plate and the heading weight.
   */
  size?: EmptyStateSize;
  /** Omit for inline surfaces: a sidebar list reads better as one sentence. */
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** The one primary path forward. Keep it to a single action. */
  actions?: ReactNode;
  /** Secondary, quieter affordances such as "start from a template". */
  secondaryActions?: ReactNode;
  /** Read-only explanation, used where the viewer role cannot act. */
  note?: ReactNode;
  /**
   * Heading element for the title. Page-level emptiness sits inside a section
   * that already owns the page heading, so it passes the next level down
   * instead of inventing a competing `h1`.
   */
  headingLevel?: 2 | 3 | 4;
  /**
   * Drops the page variant's own padding for hosts that already provide a
   * centred frame — the shell, where a note may stack underneath.
   */
  flush?: boolean;
  className?: string;
};

export function EmptyState({
  size = 'section',
  icon: Icon,
  title,
  description,
  actions,
  secondaryActions,
  note,
  headingLevel,
  flush,
  className,
}: EmptyStateProps) {
  if (size === 'inline') {
    return (
      <div className={[styles.emptyState.inline, className].filter(Boolean).join(' ')}>
        <p className={styles.emptyState.inlineTitle}>{title}</p>
        {description ? (
          <p className={styles.emptyState.inlineDescription}>{description}</p>
        ) : null}
        {actions || secondaryActions ? (
          <div className={styles.emptyState.inlineActions}>
            {actions}
            {secondaryActions}
          </div>
        ) : null}
        {note ? <p className={styles.emptyState.restricted}>{note}</p> : null}
      </div>
    );
  }

  const page = size === 'page';
  // Map to the tag name itself: passing the numeric level straight through
  // would hand React a number where it expects a component.
  const Heading = (headingLevel
    ? ({ 2: 'h2', 3: 'h3', 4: 'h4' } as const)[headingLevel]
    : page
      ? 'h2'
      : 'p') as 'h2' | 'h3' | 'h4' | 'p';
  return (
    <div
      className={[
        page
          ? flush
            ? styles.emptyState.pageFlush
            : styles.emptyState.page
          : styles.emptyState.section,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {Icon ? (
        <span
          className={
            page ? styles.emptyState.plate : styles.emptyState.plateSection
          }
          aria-hidden
        >
          <Icon
            size={page ? 30 : 20}
            strokeWidth={page ? 1.5 : 1.8}
            className={styles.emptyState.icon}
          />
        </span>
      ) : null}
      <Heading
        className={
          page
            ? styles.emptyState.titlePage
            : styles.emptyState.titleSection
        }
      >
        {title}
      </Heading>
      {description ? (
        <p
          className={
            page
              ? styles.emptyState.description
              : styles.emptyState.descriptionSection
          }
        >
          {description}
        </p>
      ) : null}
      {actions || secondaryActions ? (
        <div
          className={
            page
              ? styles.emptyState.actions
              : styles.emptyState.actionsSection
          }
        >
          {actions}
          {secondaryActions}
        </div>
      ) : null}
      {note ? <p className={styles.emptyState.restricted}>{note}</p> : null}
    </div>
  );
}