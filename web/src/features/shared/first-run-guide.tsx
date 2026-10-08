import { useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { FileText, PencilRuler, Search, X } from 'lucide-react';
import { dismissGuide, isGuideDismissed } from './guide-store';
import { shortcutModifier } from './platform';
import * as styles from './first-run-guide.css';

/**
 * Guidance for a workspace that has never held content.
 *
 * It sits below the empty state's own actions on purpose: the empty state
 * already owns the one primary action, so this card only carries the three
 * things a new owner would otherwise have to discover by clicking around. It
 * teaches by naming real affordances — the shortcut key actually opens search —
 * and it is dismissible, because being told things twice is worse than not
 * being told them at all.
 */

const GUIDE_KEY = 'workspace.first-run';

/**
 * Built at render time so the shortcut glyph follows the platform rather than
 * promising a Mac key to everyone.
 */
function notes(): { Icon: typeof Search; label: string; hint?: string; detail: string }[] {
  return [
    {
      Icon: Search,
      label: '搜索',
      hint: `${shortcutModifier()} K`,
      detail: '按标题与正文查找',
    },
    { Icon: PencilRuler, label: '白板', detail: '与文档共用同一目录' },
    { Icon: FileText, label: '导出', detail: '随时取回标准 .md' },
  ];
}

export function WorkspaceFirstRun() {
  // read once on mount: the guide only appears while the workspace is empty,
  // so there is nothing to keep in sync afterwards.
  const [open, setOpen] = useState(() => !isGuideDismissed(GUIDE_KEY));
  if (!open) return null;
  const close = () => {
    setOpen(false);
    dismissGuide(GUIDE_KEY);
  };
  return (
    <aside className={styles.guide} aria-label="开始使用提示">
      <div className={styles.headingRow}>
        <p className={styles.heading}>顺便知道三件事</p>
        <Tooltip label="不再提示">
          <ActionIcon
            className={styles.dismiss}
            variant="subtle"
            color="gray"
            size="xs"
            aria-label="关闭开始使用提示"
            onClick={close}
          >
            <X size={14} aria-hidden />
          </ActionIcon>
        </Tooltip>
      </div>
      <ul className={styles.list}>
        {notes().map(({ Icon, label, hint, detail }) => (
          <li key={label} className={styles.item}>
            <Icon size={14} className={styles.icon} aria-hidden />
            <span className={styles.label}>
              {label}
              {hint ? <kbd className={styles.hint}>{hint}</kbd> : null}
            </span>
            <span className={styles.detail}>{detail}</span>
          </li>
        ))}
      </ul>
      <p className={styles.footnote}>
        邀请成员可在工作区菜单的「管理」中完成 · 正文改动会自动保存
      </p>
    </aside>
  );
}