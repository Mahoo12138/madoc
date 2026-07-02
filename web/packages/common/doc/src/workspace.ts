import { AffineSchemas } from '@blocksuite/affine/schemas';
import { nanoid, Schema, Text } from '@blocksuite/affine/store';
import {
  type DocCollectionOptions,
  TestWorkspace,
} from '@blocksuite/affine/store/test';
import { MemoryBlobSource } from '@blocksuite/affine/sync';
import * as Y from 'yjs';

let schema: Schema | null = null;

export function getSchema(): Schema {
  if (!schema) {
    schema = new Schema();
    schema.register(AffineSchemas);
  }
  return schema;
}

export function createMadocWorkspace(workspaceId: string): TestWorkspace {
  const options: DocCollectionOptions = {
    id: workspaceId,
    idGenerator: nanoid,
    blobSources: {
      main: new MemoryBlobSource(),
      shadows: [],
    },
  };

  const collection = new TestWorkspace(options);
  collection.start();
  collection.meta.initialize();

  return collection;
}

export function createNewDoc(collection: TestWorkspace, docId?: string): string {
  const id = docId ?? nanoid();
  const doc = collection.createDoc(id);
  const store = doc.getStore();

  doc.load(() => {
    // Add root page block
    const rootId = store.addBlock('affine:page', {
      title: new Text(),
    });

    // Add surface block for edgeless mode support
    store.addBlock('affine:surface', {}, rootId);

    // Add note block inside root
    const noteId = store.addBlock('affine:note', {}, rootId);

    // Add initial paragraph block
    store.addBlock('affine:paragraph', {}, noteId);
  });

  return id;
}

export function getDoc(collection: TestWorkspace, docId: string) {
  const doc = collection.getDoc(docId);
  if (!doc) {
    return null;
  }
  if (!doc.loaded) {
    doc.load();
  }
  return doc;
}

export function getDocStore(collection: TestWorkspace, docId: string) {
  const doc = getDoc(collection, docId);
  if (!doc) {
    return null;
  }
  return doc.getStore();
}

export function getDocYjsUpdate(collection: TestWorkspace, docId: string): Uint8Array | null {
  const doc = collection.getDoc(docId);
  if (!doc) {
    return null;
  }

  const yDoc = doc.spaceDoc;
  if (!yDoc) {
    return null;
  }

  return Y.encodeStateAsUpdate(yDoc);
}

export function applyUpdateToDoc(
  collection: TestWorkspace,
  docId: string,
  update: Uint8Array
): void {
  const doc = collection.getDoc(docId);
  if (!doc) {
    throw new Error(`Doc ${docId} not found`);
  }

  const yDoc = doc.spaceDoc;
  if (!yDoc) {
    throw new Error(`Doc ${docId} has no Yjs document`);
  }

  Y.applyUpdate(yDoc, update);
}

export function getDocTitle(collection: TestWorkspace, docId: string): string {
  const doc = collection.getDoc(docId);
  if (!doc) {
    return 'Untitled';
  }

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
  return collection.meta.docMetas.map((meta: { id: string; title?: string; createDate?: number; updatedDate?: number }) => ({
    id: meta.id,
    title: meta.title ?? 'Untitled',
    createdAt: meta.createDate ?? Date.now(),
    updatedAt: meta.updatedDate ?? meta.createDate ?? Date.now(),
  }));
}
