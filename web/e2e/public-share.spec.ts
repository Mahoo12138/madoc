import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';
import { prepareSharedMarkdown } from '../src/features/sharing/public-markdown';

test('public Markdown blocks external images and unsafe links', async () => {
  const source = [
    '![published](/api/assets/asset-1)',
    '![absolute](https://madoc.example/api/assets/asset-1?size=large)',
    '![private](/api/assets/asset-2)',
    '![remote](https://tracker.example/pixel.png)',
    '[unsafe](javascript:alert(1))',
    '```md',
    '![example](https://docs.example/image.png)',
    '```',
  ].join('\n');
  const result = prepareSharedMarkdown(source, 'a'.repeat(64), new Set(['asset-1']));
  expect(result).toContain('/api/public/shares/' + 'a'.repeat(64) + '/assets/asset-1');
  expect(result).not.toContain('https://madoc.example');
  expect(result).not.toContain('/api/assets/asset-2');
  expect(result).not.toContain('![remote](https://tracker.example');
  expect(result).toContain('[unsafe](javascript:alert(1))');
  expect(result).toContain('![example](https://docs.example/image.png)');
});

test('a public share stays fixed until explicit publish and stops after revoke', async ({ page, browser }) => {
  const itemId = await openDocument(page, 'Initial private draft');
  await page.getByRole('button', { name: '版本历史' }).click();
  let dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByLabel('版本名称').fill('Release one');
  await dialog.getByRole('button', { name: '保存手动版本' }).click();
  await expect(dialog.getByText('手动版本已保存。')).toBeVisible();
  await dialog.getByRole('button', { name: '创建只读分享' }).click();
  const linkInput = dialog.getByRole('alert').getByRole('textbox');
  await expect(linkInput).toBeVisible();
  const shareURL = await linkInput.inputValue();
  await page.keyboard.press('Escape');

  const anonymous = await browser.newPage();
  await anonymous.goto(shareURL);
  await expect(anonymous.getByRole('heading', { name: 'Inline writing' })).toBeVisible();
  await expect(anonymous.locator('.ProseMirror')).toHaveText('Initial private draft');

  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText('Updated private draft');
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await anonymous.reload();
  await expect(anonymous.locator('.ProseMirror')).toContainText('Initial private draft');

  await page.getByRole('button', { name: '版本历史' }).click();
  dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByLabel('版本名称').fill('Release two');
  await dialog.getByRole('button', { name: '保存手动版本' }).click();
  await expect(dialog.getByText('手动版本已保存。')).toBeVisible();
  await dialog.getByRole('button', { name: '发布更新' }).click();
  await anonymous.reload();
  await expect(anonymous.locator('.ProseMirror')).toContainText('Updated private draft');

  await dialog.getByRole('button', { name: '撤销分享' }).click();
  const revokeDialog = page.getByRole('dialog', { name: '撤销分享？' });
  await revokeDialog.getByRole('button', { name: '撤销分享' }).click();
  await anonymous.reload();
  await expect(anonymous.getByText('此链接已撤销、已过期或不存在。')).toBeVisible();
  const direct = await anonymous.request.get(`/api/public/shares/${new URL(shareURL).pathname.split('/').pop()}`);
  expect(direct.status()).toBe(404);
  await anonymous.close();
  expect(itemId).toBeTruthy();
});

test('a shared Markdown version exposes only its referenced uploaded image', async ({ page, browser }) => {
  const status = await (await page.request.get('/api/setup/status')).json() as { initialized: boolean };
  const auth = await page.request.post(status.initialized ? '/api/auth/sign-in' : '/api/setup/admin', {
    data: { ...(!status.initialized ? { name: 'Owner' } : {}), email: 'owner@example.test', password: 'password123' },
  });
  expect(auth.ok()).toBeTruthy();
  const { csrfToken } = await auth.json() as { csrfToken: string };
  const headers = { 'x-madoc-csrf-token': csrfToken, Origin: 'http://127.0.0.1:3100' };
  const workspace = await (await page.request.post('/api/workspaces', { headers, data: { name: 'Image share regression' } })).json() as { id: string };
  const itemResponse = await page.request.post(`/api/workspaces/${workspace.id}/items`, {
    headers,
    data: { type: 'markdown', title: 'Image release', parentId: null },
  });
  expect(itemResponse.ok(), await itemResponse.text()).toBeTruthy();
  const itemId = (await itemResponse.json() as { id: string }).id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/7xoAAAAASUVORK5CYII=', 'base64');
  const upload = async (name: string) => {
    const response = await page.request.post(`/api/workspaces/${workspace.id}/assets`, {
      headers,
      multipart: { itemId, file: { name, mimeType: 'image/png', buffer: png } },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return (await response.json() as { asset: { id: string }; url: string }).asset.id;
  };
  const publishedAsset = await upload('published.png');
  const retainedButUnusedAsset = await upload('unused.png');
  const reset = await page.request.put(`/api/items/${itemId}/markdown`, {
    headers,
    data: { snapshot: '', markdown: `Published image\n\n![visible](/api/assets/${publishedAsset})` },
  });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  await page.goto(`/workspace/${workspace.id}/${itemId}`);
  await expect(page.locator('.ProseMirror')).toBeVisible();
  await expect(page.locator('.ProseMirror img')).toHaveAttribute('src', `/api/assets/${publishedAsset}`);

  await page.getByRole('button', { name: '版本历史' }).click();
  const dialog = page.getByRole('dialog', { name: '版本历史' });
  await dialog.getByLabel('版本名称').fill('Image release');
  await dialog.getByRole('button', { name: '保存手动版本' }).click();
  await expect(dialog.getByText('手动版本已保存。')).toBeVisible();
  await dialog.getByRole('button', { name: '创建只读分享' }).click();
  const shareURL = await dialog.getByRole('alert').getByRole('textbox').inputValue();
  const token = new URL(shareURL).pathname.split('/').pop()!;
  const anonymous = await browser.newPage();
  const metadataResponse = await anonymous.request.get(`/api/public/shares/${token}`);
  expect(metadataResponse.ok()).toBeTruthy();
  const metadata = await metadataResponse.json() as { assets: { id: string }[] };
  expect(metadata.assets.map((asset) => asset.id)).toEqual([publishedAsset]);
  const imageResponse = await anonymous.request.get(`/api/public/shares/${token}/assets/${publishedAsset}`);
  expect(imageResponse.ok()).toBeTruthy();
  expect(await imageResponse.body()).toEqual(png);
  expect((await anonymous.request.get(`/api/public/shares/${token}/assets/${retainedButUnusedAsset}`)).status()).toBe(404);
  await anonymous.goto(shareURL);
  await expect(anonymous.locator('.ProseMirror img')).toHaveAttribute('src', `/api/public/shares/${token}/assets/${publishedAsset}`);
  await anonymous.close();
});

test('public rendering does not fetch remote images or retain unsafe links', async ({ page, browser }) => {
  const itemId = await openDocument(page);
  const request = page.request;
  await page.close();
  const session = await (await request.get('/api/auth/session')).json() as { csrfToken: string };
  const headers = { 'x-madoc-csrf-token': session.csrfToken, Origin: 'http://127.0.0.1:3100' };
  const markdown = 'Public rendering check\n\n![tracker](https://tracker.example/pixel.png)\n\n[unsafe](javascript:alert(1))';
  const reset = await request.put(`/api/items/${itemId}/markdown`, { headers, data: { snapshot: '', markdown } });
  expect(reset.ok(), await reset.text()).toBeTruthy();
  const createdVersion = await request.post(`/api/items/${itemId}/versions`, { headers, data: { label: 'Sanitizer fixture', assetIds: [] } });
  expect(createdVersion.ok()).toBeTruthy();
  const { version } = await createdVersion.json() as { version: { id: string } };
  const response = await request.post(`/api/items/${itemId}/shares`, { headers, data: { versionId: version.id } });
  expect(response.ok()).toBeTruthy();
  const { token } = await response.json() as { token: string };

  const anonymous = await browser.newPage();
  let externalImageRequests = 0;
  await anonymous.route('https://tracker.example/**', async (route) => { externalImageRequests++; await route.abort(); });
  const pageResponse = await anonymous.goto(`/s/${token}`);
  expect(pageResponse?.headers()['content-security-policy']).toContain("img-src 'self' data: blob:");
  await expect(anonymous.locator('.ProseMirror')).toContainText('Public rendering check');
  await expect(anonymous.locator('.ProseMirror img[src^="https://"]')).toHaveCount(0);
  await expect(anonymous.locator('.ProseMirror a[href^="javascript:"]')).toHaveCount(0);
  expect(externalImageRequests).toBe(0);
  await expect(anonymous.locator('[aria-readonly="true"]')).toHaveCount(1);
  await anonymous.close();
});
