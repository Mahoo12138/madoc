import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

import { useSession } from '@/api/hooks';
import { Editor, initEditorEffects } from '@madoc/editor';
import type { Store } from '@blocksuite/affine/store';
import {
  applyUpdateToDoc,
  createMadocWorkspace,
  getDoc,
  getDocYjsUpdate,
  SyncClient,
} from '@madoc/doc';

import {
  editorBackLink,
  editorContainer,
  editorError,
  editorLayout,
  editorLoading,
  editorMain,
  editorSidebar,
  editorSidebarHeader,
  editorSidebarTitle,
} from './workspace.$workspaceId.$docId.css';

initEditorEffects();

export const Route = createFileRoute('/workspace/$workspaceId/$docId')({
  component: DocEditorPage,
});

function DocEditorPage() {
  const navigate = useNavigate();
  const { workspaceId, docId } = Route.useParams();
  const session = useSession();

  const [store, setStore] = useState<Store | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncClientRef = useRef<SyncClient | null>(null);
  const collectionRef = useRef<ReturnType<typeof createMadocWorkspace> | null>(null);

  useEffect(() => {
    const syncClient = new SyncClient();
    const collection = createMadocWorkspace(workspaceId);

    syncClientRef.current = syncClient;
    collectionRef.current = collection;

    let mounted = true;
    let unsubscribeBroadcast: (() => void) | null = null;

    const init = async () => {
      try {
        await syncClient.connect();
        await syncClient.joinWorkspace(workspaceId);

        // Load doc from server
        const { missing } = await syncClient.loadDoc(workspaceId, docId);

        // Ensure doc exists locally
        const doc = getDoc(collection, docId);
        if (!doc) {
          // Doc doesn't exist, create it
          const { createNewDoc } = await import('@madoc/doc');
          createNewDoc(collection, docId);
        }

        // Apply server state
        if (missing.length > 0) {
          applyUpdateToDoc(collection, docId, missing);
        }

        // Get store for editor
        const currentDoc = getDoc(collection, docId);
        if (!currentDoc) {
          throw new Error('Failed to get doc');
        }

        const docStore = currentDoc.getStore();
        if (mounted) {
          setStore(docStore);
        }

        // Listen for local changes and push to server
        const yDoc = currentDoc.spaceDoc;
        if (yDoc) {
          yDoc.on('update', (update: Uint8Array) => {
            syncClient.pushDocUpdate(workspaceId, docId, update).catch((err) => {
              console.error('[DocEditor] Failed to push update:', err);
            });
          });
        }

        // Listen for remote changes
        unsubscribeBroadcast = syncClient.onBroadcastUpdate((data) => {
          if (data.docId === docId) {
            const update = base64ToUint8Array(data.update);
            applyUpdateToDoc(collection, docId, update);
          }
        });
      } catch (err) {
        console.error('[DocEditor] Failed to initialize:', err);
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
        }
      }
    };

    init();

    return () => {
      mounted = false;
      unsubscribeBroadcast?.();
      syncClient.leaveWorkspace(workspaceId).catch(() => {});
      syncClient.disconnect();
    };
  }, [workspaceId, docId]);

  if (session.isLoading || !session.data?.user) {
    return <div className={editorLoading}>Loading...</div>;
  }

  if (error) {
    return (
      <div className={editorLayout}>
        <div className={editorMain}>
          <div className={editorError}>
            <div>Error: {error}</div>
            <button
              onClick={() => {
                navigate({
                  to: '/workspace/$workspaceId',
                  params: { workspaceId },
                });
              }}
            >
              Back to Workspace
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className={editorLayout}>
        <div className={editorSidebar}>
          <div className={editorSidebarHeader}>
            <a
              className={editorBackLink}
              onClick={(e) => {
                e.preventDefault();
                navigate({
                  to: '/workspace/$workspaceId',
                  params: { workspaceId },
                });
              }}
            >
              ←
            </a>
            <span className={editorSidebarTitle}>Loading...</span>
          </div>
        </div>
        <div className={editorMain}>
          <div className={editorLoading}>Loading document...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={editorLayout}>
      <div className={editorSidebar}>
        <div className={editorSidebarHeader}>
          <a
            className={editorBackLink}
            onClick={(e) => {
              e.preventDefault();
              navigate({
                to: '/workspace/$workspaceId',
                params: { workspaceId },
              });
            }}
          >
            ←
          </a>
          <span className={editorSidebarTitle}>
            {docId.slice(0, 12)}...
          </span>
        </div>
      </div>
      <div className={editorMain}>
        <div className={editorContainer}>
          <Editor store={store} />
        </div>
      </div>
    </div>
  );
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
