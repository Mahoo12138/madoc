import { AffineSchemas } from '@blocksuite/affine/schemas';
import { nanoid, Schema, Text } from '@blocksuite/affine/store';
import type { DocCollectionOptions } from '@blocksuite/affine/store/test';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { MemoryBlobSource } from '@blocksuite/affine/sync';
import { getTestStoreManager } from '@blocksuite/integration-test/store';
import * as Y from 'yjs';

let schema: Schema | null = null;
let storeManager: ReturnType<typeof getTestStoreManager> | null = null;

export function getSchema(): Schema {
  if (!schema) {
    schema = new Schema();
    schema.register(AffineSchemas);
  }
  return schema;
}

export function createMadocWorkspace(workspaceId: string): TestWorkspace {
  if (!storeManager) {
    storeManager = getTestStoreManager();
  }

  const options: DocCollectionOptions = {
    id: workspaceId,
    idGenerator: nanoid,
    blobSources: {
      main: new MemoryBlobSource(),
      shadows: [],
    },
  };

  const collection = new TestWorkspace(options);
  collection.storeExtensions = storeManager.get('store');
  collection.start();
  collection.meta.initialize();

  return collection;
}

export function createNewDoc(collection: TestWorkspace, docId?: string): string {
  const id = docId ?? nanoid();
  const doc = collection.createDoc(id);

  const store = doc.getStore();

  doc.load(() => {
    const rootId = store.addBlock('affine:page', {
      title: new Text(),
    });

    store.addBlock('affine:surface', {}, rootId);

    const noteId = store.addBlock('affine:note', {}, rootId);

    store.addBlock('affine:paragraph', {}, noteId);
  });

  return id;
}

export function getDoc(collection: TestWorkspace, docId: string) {
  const doc = collection.getDoc(docId);
  if (!doc) return null;
  if (!doc.loaded) {
    doc.load();
  }
  return doc;
}

export function getDocStore(collection: TestWorkspace, docId: string) {
  const doc = getDoc(collection, docId);
  if (!doc) return null;
  return doc.getStore();
}

export function getDocYjsUpdate(collection: TestWorkspace, docId: string): Uint8Array | null {
  const doc = collection.getDoc(docId);
  if (!doc) return null;

  const yDoc = doc.spaceDoc;
  if (!yDoc) return null;

  return Y.encodeStateAsUpdate(yDoc);
}

export function applyUpdateToDoc(
  collection: TestWorkspace,
  docId: string,
  update: Uint8Array
): void {
  const doc = collection.getDoc(docId);
  if (!doc) throw new Error(`Doc ${docId} not found`);

  const yDoc = doc.spaceDoc;
  if (!yDoc) throw new Error(`Doc ${docId} has no Yjs document`);

  Y.applyUpdate(yDoc, update);
}

export function getDocTitle(collection: TestWorkspace, docId: string): string {
  const meta = collection.meta.getDocMeta(docId);
  return meta?.title ?? 'Untitled';
}

export function setDocTitle(
  collection: TestWorkspace,
  docId: string,
  title: string
): void {
  collection.meta.setDocMeta(docId, { title });
}

export function listDocs(collection: TestWorkspace): Array<{
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}> {
  return collection.meta.docMetas.map(meta => ({
    id: meta.id,
    title: meta.title ?? 'Untitled',
    createdAt: meta.createDate ?? Date.now(),
    updatedAt: meta.updatedDate ?? meta.createDate ?? Date.now(),
  }));
}

export async function createWorkspaceInitBinary(): Promise<{
  workspaceId: string;
  initBinary: string;
}> {
  const workspaceId = nanoid();
  const collection = createMadocWorkspace(workspaceId);
  createNewDoc(collection);

  const rootDoc = collection.doc;
  const yDoc = rootDoc.spaceDoc;
  if (!yDoc) throw new Error('No Yjs doc found');

  const state = Y.encodeStateAsUpdate(yDoc);
  const binary = btoa(String.fromCharCode(...state));

  return { workspaceId, initBinary: binary };
}
