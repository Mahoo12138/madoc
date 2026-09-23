import { createHash, randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { openDocument } from '../e2e/helpers/writing';
import { RestartServer } from './server';

const image = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH7sAAAAASUVORK5CYII=',
  'base64',
);

test('interrupted upload cleans only unpublished files and committed imports survive restart and backup', async ({
  page,
}) => {
  const server = await RestartServer.create();
  let upload: ReturnType<typeof httpRequest> | undefined;
  try {
    await server.start();
    await openDocument(page);
    const workspaceID = new URL(page.url()).pathname.split('/')[2];
    const { csrfToken } = await (await page.request.get('/api/auth/session')).json();
    const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
    const root = randomUUID();
    const assets = [randomUUID(), randomUUID()].map((id) => ({
      id,
      itemId: root,
      fileName: 'image.png',
      mime: 'image/png',
      size: image.length,
      sha256: createHash('sha256').update(image).digest('hex'),
    }));
    const plan = {
      id: randomUUID(),
      parentId: null,
      items: [{ id: root, parentId: null, type: 'folder', title: 'Interrupted import' }],
      assets,
    };
    const endpoint = `http://127.0.0.1:3100/api/workspaces/${workspaceID}/imports`;
    const multipart = {
      plan: JSON.stringify(plan),
      ...Object.fromEntries(assets.map(({ id }) => [id, { name: 'image.png', mimeType: 'image/png', buffer: image }])),
    };
    const cookie = (await page.context().cookies()).map(({ name, value }) => `${name}=${value}`).join('; ');
    const boundary = `madoc-${randomUUID()}`;
    const fileHeader = (id: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${id}"; filename="image.png"\r\nContent-Type: image/png\r\n\r\n`;
    upload = httpRequest(endpoint, {
      method: 'POST',
      headers: { ...headers, Cookie: cookie, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    });
    upload.on('error', () => {});
    upload.on('response', (response) => response.resume());
    upload.write(
      Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="plan"\r\n\r\n${JSON.stringify(plan)}\r\n${fileHeader(assets[0].id)}`,
        ),
        image,
        Buffer.from(`\r\n${fileHeader(assets[1].id)}`),
        image.subarray(0, 8),
      ]),
    );
    const attemptsPath = join(server.directory, 'data/assets', workspaceID, '.imports');
    await expect.poll(async () => (await readdir(attemptsPath).catch(() => [])).length).toBe(1);
    const attempt = (await readdir(attemptsPath))[0];
    await expect
      .poll(async () => (await stat(join(attemptsPath, attempt, assets[0].id)).catch(() => undefined))?.size)
      .toBe(image.length);
    expect(await (await page.request.get(`/api/workspaces/${workspaceID}/items`)).json()).toHaveLength(1);
    expect((await page.request.get(`/api/assets/${assets[0].id}`)).status()).toBe(404);
    await server.stop('SIGKILL');
    upload.destroy();
    upload = undefined;
    expect(await readdir(attemptsPath)).toHaveLength(1);
    await server.start();
    expect(await readdir(attemptsPath)).toHaveLength(0);
    expect(await (await page.request.get(`/api/workspaces/${workspaceID}/items`)).json()).toHaveLength(1);
    const imported = await page.request.post(endpoint, { headers, multipart });
    expect(imported.status()).toBe(201);
    expect(await imported.json()).toMatchObject({ rootId: root, replayed: false });
    await server.stop('SIGKILL');
    await server.start();
    expect(await readdir(attemptsPath)).toHaveLength(1);
    expect((await page.request.post(endpoint, { headers, multipart })).status()).toBe(200);
    expect(await readdir(attemptsPath)).toHaveLength(1);
    await server.stop();
    await server.restoreIntoIndependentDirectory();
    await server.start();
    const replay = await page.request.post(endpoint, { headers, multipart });
    expect(replay.status()).toBe(200);
    expect(await replay.json()).toMatchObject({ rootId: root, replayed: true });
    expect(await (await page.request.get(`/api/workspaces/${workspaceID}/items`)).json()).toHaveLength(2);
    for (const asset of assets) expect(await (await page.request.get(`/api/assets/${asset.id}`)).body()).toEqual(image);
  } finally {
    upload?.destroy();
    await page.close();
    await server.dispose();
  }
});
