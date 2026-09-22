import { ActionIcon, Text, Tooltip, UnstyledButton } from '@mantine/core';
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  buildOutlineTree,
  outlineParentPositions,
  type MarkdownOutline as Outline,
  type OutlineBranch,
} from './markdown-outline-model';
import * as styles from './markdown-outline.css';

type Props = {
  title: string;
  outline: Outline | null;
  onNavigate: (position: number) => void;
};

function containsActive(
  branch: OutlineBranch,
  position: number | null,
): boolean {
  return (
    branch.position === position ||
    branch.children.some((child) => containsActive(child, position))
  );
}

export function MarkdownOutline({ title, outline, onNavigate }: Props) {
  const branches = useMemo(
    () => buildOutlineTree(outline?.headings ?? []),
    [outline?.headings],
  );
  const parents = useMemo(
    () => outlineParentPositions(outline?.headings ?? []),
    [outline?.headings],
  );
  const render = (entries: OutlineBranch[]) => (
    <ol className={styles.list}>
      {entries.map((heading) => {
        const hasChildren = heading.children.length > 0;
        const closed = outline!.collapsed.has(heading.position);
        const activeWithin =
          closed && containsActive(heading, outline!.activePosition);
        return (
          <li key={heading.position}>
            <div
              className={styles.row}
              data-active={
                outline!.activePosition === heading.position || activeWithin
              }
            >
              {hasChildren ? (
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={26}
                  className={styles.toggle}
                  aria-label={`${closed ? '展开' : '折叠'} ${heading.text}`}
                  aria-expanded={!closed}
                  onClick={() => outline!.toggleCollapsed(heading.position)}
                >
                  {closed ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </ActionIcon>
              ) : (
                <span className={styles.spacer} />
              )}
              <UnstyledButton
                className={styles.heading}
                aria-current={
                  outline!.activePosition === heading.position
                    ? 'location'
                    : undefined
                }
                aria-label={`${heading.text}，${heading.level} 级标题${activeWithin && outline!.activePosition !== heading.position ? '，包含当前章节' : ''}`}
                title={heading.text}
                onClick={() => onNavigate(heading.position)}
              >
                {heading.text}
              </UnstyledButton>
            </div>
            {hasChildren && !closed && (
              <div className={styles.children}>{render(heading.children)}</div>
            )}
          </li>
        );
      })}
    </ol>
  );

  return (
    <nav aria-label="文档大纲" className={styles.outline}>
      <div className={styles.header}>
        <Text
          size="xs"
          fw={600}
          c="gray.7"
          className={styles.documentTitle}
          title={title}
        >
          {title}
        </Text>
        {parents.length > 0 && (
          <div className={styles.tools}>
            <Tooltip label="全部展开">
              <ActionIcon
                aria-label="全部展开"
                variant="subtle"
                color="gray"
                size={26}
                disabled={!outline?.collapsed.size}
                onClick={() => outline?.setAllCollapsed(false)}
              >
                <ChevronsUpDown size={15} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="全部折叠">
              <ActionIcon
                aria-label="全部折叠"
                variant="subtle"
                color="gray"
                size={26}
                disabled={parents.every((position) =>
                  outline?.collapsed.has(position),
                )}
                onClick={() => outline?.setAllCollapsed(true)}
              >
                <ChevronsDownUp size={15} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>
      {!outline ? (
        <Text size="sm" c="gray.7" p="xs" role="status">
          正在读取大纲…
        </Text>
      ) : outline.headings.length === 0 ? (
        <div className={styles.empty}>
          <Text size="sm">暂无标题</Text>
          <Text size="xs" c="gray.7" mt={4}>
            正文中的 H1–H6 标题会显示在这里。
          </Text>
        </div>
      ) : (
        render(branches)
      )}
    </nav>
  );
}
