import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { portableFiles } from './helpers/portable-packages';
import { readPortablePackageSelection } from '../src/features/workspaces/portable-package-selection';
import { preparePortableImport, type PortableImportPlan } from '../src/features/workspaces/portable-import-plan';

async function preview() {
  return readPortablePackageSelection(
    portableFiles()
      .reverse()
      .map(({ name, buffer }) => new File([buffer], name)),
  );
}
const target = { workspaceId: 'new-workspace', parentId: 'chosen-folder', title: ' 新导入 ' };

test('import plan uses independent IDs, maps shared resources and retains exact retry payload', async () => {
  const source = await preview();
  source.items.push({ id: 'nested', parentId: null, type: 'folder', title: '子目录', path: '导入资料/子目录' });
  source.items[0].parentId = 'nested';
  source.items[0].path = '导入资料/子目录/笔记.md';
  source.items.push({ id: 'board', parentId: null, type: 'whiteboard', title: '图', path: '导入资料/图.excalidraw' });
  source.itemData.set(
    'board',
    new TextEncoder().encode(
      JSON.stringify({
        elements: [{ id: 'shape', link: './子目录/笔记.md', customData: { keep: true } }],
        appState: {},
        files: { image: { dataURL: 'data:image/png;base64,abc' } },
      }),
    ),
  );
  let compiled = 0;
  const prepared = await preparePortableImport(source, target, undefined, async (_markdown, resolve) => {
    compiled++;
    return {
      snapshot: 'AQID',
      markdown: `${resolve('../../assets/asset-abc.png')} ${resolve('../图.excalidraw#shape')}`,
    };
  });
  const original = prepared.body.get('plan') as string;
  const plan: PortableImportPlan = JSON.parse(original);
  expect(plan.parentId).toBe('chosen-folder');
  expect(plan.items[0]).toMatchObject({ id: prepared.rootId, parentId: null, title: '新导入', type: 'folder' });
  expect(new Set([plan.id, ...plan.items.map((item) => item.id), ...plan.assets.map((asset) => asset.id)]).size).toBe(
    6,
  );
  const doc = plan.items.find((item) => item.type === 'markdown')!;
  const folder = plan.items.find((item) => item.title === '子目录')!;
  const board = plan.items.find((item) => item.type === 'whiteboard')!;
  expect(doc.parentId).toBe(folder.id);
  expect(folder.parentId).toBe(prepared.rootId);
  expect(doc.markdown!.markdown).toBe(`/api/assets/${plan.assets[0].id} /workspace/new-workspace/${board.id}#shape`);
  expect(JSON.parse(board.whiteboard!)).toEqual({
    elements: [{ id: 'shape', link: `/workspace/new-workspace/${doc.id}`, customData: { keep: true } }],
    appState: {},
    files: { image: { dataURL: 'data:image/png;base64,abc' } },
  });
  expect(plan.assets[0].sha256).toBe(createHash('sha256').update(new Uint8Array(128)).digest('hex'));
  expect(plan.assets[0].itemId).toBe(prepared.rootId);
  expect([...prepared.body.keys()][0]).toBe('plan');
  expect(await (prepared.body.get(plan.assets[0].id) as File).arrayBuffer()).toEqual(new Uint8Array(128).buffer);
  target.title = '后来修改';
  source.items[0].title = '后来改名';
  expect(prepared.body.get('plan')).toBe(original);
  expect(compiled).toBe(1);
  const second = await preparePortableImport(await preview(), target, undefined, async () => ({
    snapshot: 'AQID',
    markdown: '',
  }));
  expect(second.requestId).not.toBe(prepared.requestId);
  expect(second.rootId).not.toBe(prepared.rootId);
});

test('import preparation fails completely on missing resources, count overflow or cancellation', async () => {
  const source = await preview();
  let compiled = 0;
  const compile = async () => {
    compiled++;
    return { snapshot: 'AQID', markdown: '' };
  };
  source.attachmentData.clear();
  await expect(preparePortableImport(source, target, undefined, compile)).rejects.toThrow('附件缺失');
  expect(compiled).toBe(0);
  const tooMany = await preview();
  tooMany.items = Array(5000).fill(tooMany.items[0]);
  await expect(preparePortableImport(tooMany, target, undefined, compile)).rejects.toThrow('5000');
  const controller = new AbortController();
  await expect(
    preparePortableImport(await preview(), target, controller.signal, async () => {
      controller.abort();
      return { snapshot: 'AQID', markdown: '' };
    }),
  ).rejects.toThrow();
  await expect(preparePortableImport(await preview(), target, controller.signal, compile)).rejects.toThrow();
  expect(compiled).toBe(0);
});
