import { expect, test } from '@playwright/test';

for (const type of ['markdown', 'whiteboard'] as const) {
  test(`public ${type} loads only its own renderer`, async ({ page }, info) => {
    const token = 'f'.repeat(64);
    const scene = {
      elements: [
        {
          id: 'rectangle',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          angle: 0,
          strokeColor: '#000000',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 1,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          roundness: null,
          seed: 1,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          boundElements: null,
          updated: 1,
          link: null,
          locked: false,
        },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    };
    await page.route(`**/api/public/shares/${token}`, (route) =>
      route.fulfill({
        json: {
          title: 'Public loading boundary',
          versionName: 'Release',
          publishedAt: '2026-09-27T00:00:00Z',
          assets: [],
          ...(type === 'markdown'
            ? { markdown: '# Public document' }
            : { whiteboard: { scene: JSON.stringify(scene) } }),
        },
      }),
    );
    const scripts: string[] = [];
    const errors: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script')
        scripts.push(new URL(request.url()).pathname);
    });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/s/${token}`);
    if (type === 'markdown') {
      await expect(page.locator('.ProseMirror')).toContainText(
        'Public document',
      );
      await expect(page.locator('.ProseMirror')).toHaveCSS(
        'padding',
        '18px 0px 120px',
      );
      await expect(page.locator('.ProseMirror h1')).toHaveCSS(
        'font-size',
        '32px',
      );
      await expect(page.locator('.ProseMirror')).toHaveAttribute(
        'contenteditable',
        'false',
      );
    } else {
      await expect(page.getByRole('img', { name: '只读白板' })).toBeVisible();
      await expect(
        page.getByRole('img', { name: '只读白板' }),
      ).toHaveJSProperty('complete', true);
    }
    await info.attach('script-requests', {
      body: JSON.stringify(scripts, null, 2),
      contentType: 'application/json',
    });
    expect(scripts.some((url) => /\/editor-[^/]+\.js$/.test(url))).toBe(
      type === 'markdown',
    );
    expect(scripts.some((url) => /\/whiteboard-[^/]+\.js$/.test(url))).toBe(
      type === 'whiteboard',
    );
    expect(errors).toEqual([]);
  });
}
