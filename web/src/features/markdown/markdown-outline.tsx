import { ActionIcon, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { useMemo } from "react";
import { EmptyState } from "@/features/shared/empty-state";
import {
  buildOutlineTree,
  outlineParentPositions,
  type MarkdownOutline as Outline,
  type OutlineBranch,
} from "./markdown-outline-model";
import * as styles from "./markdown-outline.css";
import { touchAction } from "@/styles/interaction.css";

type Props = {
  title: string;
  outline: Outline | null;
  onNavigate: (position: number) => void;
  onClose?: () => void;
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

export function MarkdownOutline({
  title,
  outline,
  onNavigate,
  onClose,
  showTitle = true,
}: Props & { showTitle?: boolean }) {
  const branches = useMemo(
    () => buildOutlineTree(outline?.headings ?? []),
    [outline?.headings],
  );
  const parents = useMemo(
    () => outlineParentPositions(outline?.headings ?? []),
    [outline?.headings],
  );
  const render = (entries: OutlineBranch[], root = false) => (
    <ol
      className={root ? `${styles.list} ${styles.rootList}` : styles.list}
    >
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
                  className={`${styles.toggle} ${touchAction}`}
                  aria-label={`${closed ? "展开" : "折叠"} ${heading.text}`}
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
                    ? "location"
                    : undefined
                }
                aria-label={`${heading.text}，${heading.level} 级标题${activeWithin && outline!.activePosition !== heading.position ? "，包含当前章节" : ""}`}
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
    <nav
      aria-label="文档大纲"
      className={styles.outline}
      data-desktop={!showTitle}
    >
      <div className={styles.header}>
        {showTitle ? (
          <Text
            size="xs"
            fw={600}
            c="gray.7"
            className={styles.documentTitle}
            title={title}
          >
            {title}
          </Text>
        ) : (
          <Text size="sm" fw={650} className={styles.documentTitle}>
            大纲
          </Text>
        )}
        {(parents.length > 0 || onClose) && (
          <div className={styles.tools}>
            {parents.length > 0 && (
              <>
                <Tooltip label="全部展开">
                  <ActionIcon
                    className={touchAction}
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
                    className={touchAction}
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
              </>
            )}
            {onClose && (
              <Tooltip label="隐藏大纲">
                <ActionIcon
                  className={touchAction}
                  aria-label="隐藏大纲"
                  variant="subtle"
                  color="gray"
                  size={26}
                  onClick={onClose}
                >
                  <X size={15} aria-hidden />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        )}
      </div>
      {!outline ? (
        <Text size="sm" c="gray.7" p="xs" role="status">
          正在读取大纲…
        </Text>
      ) : outline.headings.length === 0 ? (
        <EmptyState
          size="inline"
          title="正文还没有标题"
          description="使用 H1–H6 标题组织内容后，会在这里生成可点击的大纲。"
        />
      ) : (
        render(branches, true)
      )}
    </nav>
  );
}
