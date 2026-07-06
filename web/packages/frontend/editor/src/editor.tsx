import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import {
  CommunityCanvasTextFonts,
  FontConfigExtension,
} from '@blocksuite/affine/shared/services';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { getTestViewManager } from '@blocksuite/integration-test/view';
import { useEffect, useRef } from 'react';

const viewManager = getTestViewManager();
type EditorMode = 'page' | 'edgeless';

function getEditorExtensions(): ExtensionType[] {
  return [
    FontConfigExtension(CommunityCanvasTextFonts),
  ];
}

export interface EditorProps {
  store: Store;
  mode?: EditorMode;
  onDocLinkClicked?: (docId: string) => void;
}

export function Editor({ store, mode = 'page', onDocLinkClicked }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<TestAffineEditorContainer | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = document.createElement(
      'affine-editor-container'
    ) as TestAffineEditorContainer;

    editor.autofocus = true;
    editor.doc = store;
    editor.mode = mode;

    const extensions = getEditorExtensions();
    editor.pageSpecs = [...viewManager.get('page'), ...extensions];
    editor.edgelessSpecs = [...viewManager.get('edgeless'), ...extensions];

    if (onDocLinkClicked) {
      editor.std
        .get(RefNodeSlotsProvider)
        .docLinkClicked.subscribe(({ pageId: docId }: { pageId: string }) => {
          onDocLinkClicked(docId);
        });
    }

    containerRef.current.appendChild(editor);
    editorRef.current = editor;

    return () => {
      if (containerRef.current && editorRef.current) {
        containerRef.current.removeChild(editorRef.current);
      }
      editorRef.current = null;
    };
  }, [store, onDocLinkClicked]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.switchEditor(mode);
  }, [mode]);

  return (
    <div
      ref={containerRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
      }}
    />
  );
}
