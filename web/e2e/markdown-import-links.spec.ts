import { expect, test } from '@playwright/test';
import * as Y from 'yjs';
import { yDocToProsemirrorJSON } from 'y-prosemirror';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { portableFiles } from './helpers/portable-packages';
import { openDocument } from './helpers/writing';
import { createServer, type ViteDevServer } from 'vite';

// The compiler is browser-only. Exercise the actual active schema via Vite,
// without adding a test entry point or debug API to the production application.
let server: ViteDevServer;
let origin: string;
test.beforeAll(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === 'string') throw new Error('Missing Vite address');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => {
  await server?.close();
});

test('import compiles mapped images, references and footnotes into the same self-contained Yjs snapshot', async ({
  page,
}) => {
  await page.goto(origin);
  const imageRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('original-image.example') || request.url().includes('/api/assets/new-image'))
      imageRequests.push(request.url());
  });
  const result = await page.evaluate(async () => {
    const compilerPath = '/src/features/markdown/markdown-template.ts';
    const { compileMarkdownSnapshot } = await import(/* @vite-ignore */ compilerPath);
    const input = [
      '[普通](./next.md#part) and [引用][target]',
      '',
      '[target]: ./next.md "标题"',
      '',
      '![外图](https://original-image.example/image.png)',
      '',
      '![本地图](../assets/image.png "图注")',
      '',
      '引用图片 ![缩略][picture]',
      '',
      '[picture]: ../assets/image.png',
      '',
      '脚注[^one]',
      '',
      '[^one]: [脚注链接](./next.md)',
      '',
      '`[代码](./next.md)`',
      '',
      '```md',
      '[示例](./next.md)',
      '```',
      '',
    ].join('\n');
    const resolve = (href: string) =>
      href.startsWith('./next.md')
        ? href.replace('./next.md', '/workspace/new/next')
        : href === '../assets/image.png'
          ? '/api/assets/new-image'
          : href;
    const compiled = await compileMarkdownSnapshot(input, resolve);
    // Reparse the stored projection as well: reference definitions must not
    // silently reintroduce old targets after opening or subsequent edits.
    const second = await compileMarkdownSnapshot(compiled.markdown);
    return { ...compiled, second: second.markdown };
  });
  expect(result.markdown).toContain('/workspace/new/next#part');
  expect(result.markdown).toContain('[target]: /workspace/new/next');
  expect(result.markdown).toContain('[picture]: /api/assets/new-image');
  expect(result.markdown).toContain('/api/assets/new-image');
  expect(result.markdown).toContain('https://original-image.example/image.png');
  expect(result.markdown).toContain('`[代码](./next.md)`');
  expect(result.markdown).toContain('[示例](./next.md)');
  expect(result.markdown).toContain('[^one]:');
  expect(result.second).toBe(result.markdown);
  const doc = new Y.Doc();
  try {
    Y.applyUpdate(doc, Buffer.from(result.snapshot, 'base64'));
    const json = JSON.stringify(yDocToProsemirrorJSON(doc));
    expect(json).toContain('/workspace/new/next');
    expect(json).toContain('/api/assets/new-image');
    expect(json).not.toContain('../assets/image.png');
    expect(json).toContain('[示例](./next.md)');
  } finally {
    doc.destroy();
  }
  expect(imageRequests).toEqual([]);
});

test('real ZIP preparation imports editable Markdown and mapped attachments through the atomic API', async ({
  page,
}) => {
  await openDocument(page);
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=',
    'base64',
  );
  const entries = unzipSync(portableFiles(false, 2)[0].buffer);
  const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json']));
  manifest.attachments[0].size = image.length;
  entries['manifest.json'] = strToU8(JSON.stringify(manifest));
  entries['assets/asset-abc.png'] = image;
  entries['导入资料/笔记 1.md'] = strToU8(
    '![图片](../assets/asset-abc.png)\n\n[另一篇][next]\n\n[next]: ./笔记%202.md',
  );
  await page.goto(origin);
  const prepared = await page.evaluate(
    async ({ bytes, workspaceId }) => {
      const readerPath = '/src/features/workspaces/portable-package-selection.ts';
      const planPath = '/src/features/workspaces/portable-import-plan.ts';
      const { readPortablePackageSelection } = await import(/* @vite-ignore */ readerPath);
      const { preparePortableImport } = await import(/* @vite-ignore */ planPath);
      const preview = await readPortablePackageSelection([new File([new Uint8Array(bytes)], 'content.zip')]);
      const prepared = await preparePortableImport(preview, { workspaceId, parentId: null, title: '完整导入' });
      const plan = JSON.parse(prepared.body.get('plan'));
      const files = [];
      for (const asset of plan.assets) {
        const file = prepared.body.get(asset.id);
        files.push({
          id: asset.id,
          name: file.name,
          mimeType: file.type,
          bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        });
      }
      return { plan, files };
    },
    { bytes: Array.from(zipSync(entries)), workspaceId },
  );
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const multipart = {
    plan: JSON.stringify(prepared.plan),
    ...Object.fromEntries(
      prepared.files.map((file) => [
        file.id,
        { name: file.name, mimeType: file.mimeType, buffer: Buffer.from(file.bytes) },
      ]),
    ),
  };
  const endpoint = `/api/workspaces/${workspaceId}/imports`;
  const response = await page.request.post(endpoint, { headers, multipart });
  expect(response.status(), await response.text()).toBe(201);
  expect((await page.request.post(endpoint, { headers, multipart })).status()).toBe(200);
  const docs = prepared.plan.items.filter((item: { type: string }) => item.type === 'markdown');
  await page.goto(`/workspace/${workspaceId}/${docs[0].id}`);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.locator('.ProseMirror img')).toHaveAttribute('src', `/api/assets/${prepared.plan.assets[0].id}`);
  await expect(page.locator('.ProseMirror a').filter({ hasText: '另一篇' })).toHaveAttribute(
    'href',
    `/workspace/${workspaceId}/${docs[1].id}`,
  );
  const downloaded = await page.request.get(`/api/assets/${prepared.plan.assets[0].id}`);
  expect(await downloaded.body()).toEqual(image);
  await page.locator('.ProseMirror').press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Imported and editable');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toContainText('Imported and editable');
});
