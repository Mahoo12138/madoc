import { RefNodeSlotsProvider } from '@blocksuite/affine/inlines/reference';
import type { DocMode } from '@blocksuite/affine/model';
import {
  CommunityCanvasTextFonts,
  DocModeProvider,
  EditorSettingExtension,
  FeatureFlagService,
  FontConfigExtension,
  GeneralSettingSchema,
  ParseDocUrlExtension,
  type DocModeProvider as DocModeProviderService,
  type EditorSetting,
  type ParseDocUrlService,
} from '@blocksuite/affine/shared/services';
import type { ExtensionType, Store, Workspace } from '@blocksuite/affine/store';
import { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { getTestViewManager } from '@blocksuite/integration-test/view';
import { Signal } from '@preact/signals-core';
import { useEffect, useRef } from 'react';

const viewManager = getTestViewManager();
type EditorMode = 'page' | 'edgeless';
const DEFAULT_MODE: DocMode = 'page';
const docModeMap = new Map<string, DocMode>();
const docModeSlots = new Map<string, Set<(mode: DocMode) => void>>();
const initialEditorSetting = Object.entries(GeneralSettingSchema.shape).reduce(
  (settings, [key, schema]) => {
    settings[key] = schema.parse(undefined);
    return settings;
  },
  {} as Record<string, unknown>
) as EditorSetting;
const editorSetting$ = new Signal<EditorSetting>(
  initialEditorSetting
);

function createDocModeProvider(
  editor: TestAffineEditorContainer
): DocModeProviderService {
  return {
    getEditorMode: () => editor.mode,
    getPrimaryMode: (docId: string) => docModeMap.get(docId) ?? DEFAULT_MODE,
    onPrimaryModeChange: (handler, docId: string) => {
      if (!docModeSlots.has(docId)) {
        docModeSlots.set(docId, new Set());
      }

      const handlers = docModeSlots.get(docId)!;
      handlers.add(handler);

      return {
        unsubscribe: () => {
          handlers.delete(handler);
        },
      } as ReturnType<DocModeProviderService['onPrimaryModeChange']>;
    },
    setEditorMode: (mode: DocMode) => {
      editor.switchEditor(mode);
    },
    setPrimaryMode: (mode: DocMode, docId: string) => {
      docModeMap.set(docId, mode);
      docModeSlots.get(docId)?.forEach(handler => handler(mode));
    },
    togglePrimaryMode: (docId: string) => {
      const nextMode =
        (docModeMap.get(docId) ?? DEFAULT_MODE) === 'page' ? 'edgeless' : 'page';
      docModeMap.set(docId, nextMode);
      docModeSlots.get(docId)?.forEach(handler => handler(nextMode));
      return nextMode;
    },
  };
}

function createParseDocUrlService(workspace: Workspace): ParseDocUrlService {
  return {
    parseDocUrl: url => {
      if (!url || !URL.canParse(url)) return;

      const path = decodeURIComponent(new URL(url).hash.slice(1));
      const doc = path
        ? Array.from(workspace.docs.values()).find(doc => doc.id === path)
        : null;

      if (!doc) return;

      return {
        docId: doc.id,
      };
    },
  };
}

function getEditorExtensions(
  editor: TestAffineEditorContainer
): ExtensionType[] {
  return [
    FontConfigExtension(CommunityCanvasTextFonts),
    EditorSettingExtension({
      setting$: editorSetting$,
    }),
    ParseDocUrlExtension(createParseDocUrlService(editor.doc.workspace)),
    {
      setup: di => {
        di.override(DocModeProvider, createDocModeProvider(editor));
      },
    },
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

    store
      .get(FeatureFlagService)
      .setFlag('enable_advanced_block_visibility', true);

    const editor = document.createElement(
      'affine-editor-container'
    ) as TestAffineEditorContainer;

    editor.autofocus = true;
    editor.doc = store;
    editor.mode = mode;

    const extensions = getEditorExtensions(editor);
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
      data-affine-editor-container
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
