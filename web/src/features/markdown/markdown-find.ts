import { TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { yUndoPluginKey } from 'y-prosemirror';

export type MarkdownFindMatch = {
  from: number;
  to: number;
  text: string;
};

export type MarkdownFindController = {
  find: (query: string) => MarkdownFindMatch[];
  select: (match: MarkdownFindMatch) => boolean;
  replace: (match: MarkdownFindMatch, replacement: string) => boolean;
  replaceAll: (matches: MarkdownFindMatch[], replacement: string) => number;
  subscribe: (listener: () => void) => () => void;
  notifyChanged: () => void;
};

function matchesInTextblock(view: EditorView, query: string) {
  if (!query) return [];
  const matches: MarkdownFindMatch[] = [];
  view.state.doc.descendants((block, blockPos) => {
    if (!block.isTextblock) return;
    let run = '';
    let runFrom = blockPos + 1;
    let cursor = runFrom;
    const flush = () => {
      let offset = 0;
      while (offset <= run.length - query.length) {
        const index = run.indexOf(query, offset);
        if (index < 0) break;
        matches.push({ from: runFrom + index, to: runFrom + index + query.length, text: query });
        offset = index + Math.max(query.length, 1);
      }
      run = '';
    };
    block.forEach((child) => {
      if (child.isText) {
        if (!run) runFrom = cursor;
        run += child.text ?? '';
      } else {
        flush();
      }
      cursor += child.nodeSize;
    });
    flush();
    return false;
  });
  return matches;
}

function isCurrentMatch(view: EditorView, match: MarkdownFindMatch) {
  return match.from >= 0
    && match.to <= view.state.doc.content.size
    && view.state.doc.textBetween(match.from, match.to, '\n', '\n') === match.text;
}

function stopUndoCapture(view: EditorView) {
  yUndoPluginKey.getState(view.state)?.undoManager.stopCapturing();
}

export function createMarkdownFindController(view: EditorView): MarkdownFindController {
  const listeners = new Set<() => void>();
  return {
    find: (query) => matchesInTextblock(view, query),
    select: (match) => {
      if (!isCurrentMatch(view, match)) return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView());
      return true;
    },
    replace: (match, replacement) => {
      if (!view.editable || !isCurrentMatch(view, match)) return false;
      stopUndoCapture(view);
      view.dispatch(view.state.tr.insertText(replacement, match.from, match.to));
      stopUndoCapture(view);
      listeners.forEach((listener) => listener());
      return true;
    },
    replaceAll: (matches, replacement) => {
      if (!view.editable) return 0;
      const current = matches.filter((match) => isCurrentMatch(view, match));
      if (!current.length) return 0;
      stopUndoCapture(view);
      const transaction = view.state.tr;
      for (const match of [...current].sort((left, right) => right.from - left.from)) {
        transaction.insertText(replacement, match.from, match.to);
      }
      view.dispatch(transaction);
      stopUndoCapture(view);
      listeners.forEach((listener) => listener());
      return current.length;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notifyChanged: () => listeners.forEach((listener) => listener()),
  };
}
