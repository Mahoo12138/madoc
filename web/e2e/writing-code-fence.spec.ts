import { expect, test } from '@playwright/test';
import { openDocument } from './helpers/writing';

test('plain-text line metadata imports and round-trips without becoming a language', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '~~~ {2, 3} title="plain file"\none\ntwo\nthree\n~~~',
  );
  const block = page.locator('.milkdown-code-block');
  await expect(block.locator('.language-button')).toContainText('纯文本');
  await expect(block.locator('.madoc-code-highlight')).toHaveText([
    'two',
    'three',
  ]);
  await block.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('``` {2, 3} title="plain file"\none!\ntwo\nthree\n```');
  const exported = await (
    await page.request.get(`/api/items/${id}/export.md`)
  ).text();
  await page.reload();
  await expect(block.locator('.language-button')).toContainText('纯文本');
  await expect(block.locator('.madoc-code-highlight')).toHaveText([
    'two',
    'three',
  ]);
  await openDocument(page, exported);
  await expect(block.locator('.language-button')).toContainText('纯文本');
  await expect(block.locator('.cm-line')).toHaveText(['one!', 'two', 'three']);
  await expect(block.locator('.madoc-code-highlight')).toHaveText([
    'two',
    'three',
  ]);
});

for (const [meta, marker] of [
  ['{2, 3} title="nested file"', ''],
  ['title="nested file" {2, 3}', 'text'],
] as const) {
  test(`plain-text metadata keeps long fences and nested containers: ${meta}`, async ({
    page,
  }) => {
    const content = ['literal ``` and ```` fences', 'second', 'third'];
    const source =
      '- container\n\n  > `````custom ' +
      meta +
      '\n' +
      content.map((line) => `  > ${line}`).join('\n') +
      '\n  > `````';
    const id = await openDocument(page, source);
    const block = page.locator('.milkdown-code-block');
    await expect(block.locator('.cm-line')).toHaveText(content);
    await block.hover();
    await block.locator('.language-button').click();
    await page.getByRole('option', { name: '纯文本', exact: true }).click();
    await expect(block.locator('.language-button')).toContainText('纯文本');
    await expect
      .poll(
        async () =>
          await (await page.request.get(`/api/items/${id}/export.md`)).text(),
      )
      .toContain(`> \`\`\`\`\`${marker} ${meta}\n`);
    const exported = await (
      await page.request.get(`/api/items/${id}/export.md`)
    ).text();
    expect(exported).toContain('> `````\n');
    await openDocument(page, exported);
    await expect(block.locator('.language-button')).toContainText('纯文本');
    await expect(block.locator('.cm-line')).toHaveText(content);
    await expect(block.locator('.madoc-code-highlight')).toHaveText([
      'second',
      'third',
    ]);
    await expect(
      page.locator('.ProseMirror li blockquote .milkdown-code-block'),
    ).toHaveCount(1);
  });
}

test('brace-shaped unknown languages remain languages and retain metadata', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '```{custom} title="sample" {2}\none\ntwo\n```',
  );
  const block = page.locator('.milkdown-code-block');
  await expect(block.locator('.language-button')).toContainText('{custom}');
  await expect(block.locator('.madoc-code-highlight')).toHaveText('two');
  await block.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('```{custom} title="sample" {2}\none!\ntwo');
  const exported = await (
    await page.request.get(`/api/items/${id}/export.md`)
  ).text();
  await openDocument(page, exported);
  await expect(block.locator('.language-button')).toContainText('{custom}');
  await expect(block.locator('.madoc-code-highlight')).toHaveText('two');
});

test('plain text preserves arbitrary metadata, including escaped fence punctuation', async ({
  page,
}) => {
  const id = await openDocument(
    page,
    '~~~custom title="file`name" {bad}\none\ntwo\n~~~',
  );
  const block = page.locator('.milkdown-code-block');
  await expect(block.locator('.cm-line')).toHaveText(['one', 'two']);
  await block.hover();
  await block.locator('.language-button').click();
  await page.getByRole('option', { name: '纯文本', exact: true }).click();
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${id}/export.md`)).text(),
    )
    .toContain('```text title="file&#x60;name" {bad}\n');
  const exported = await (
    await page.request.get(`/api/items/${id}/export.md`)
  ).text();
  await openDocument(page, exported);
  await expect(block.locator('.language-button')).toContainText('纯文本');
  await expect(block.locator('.cm-line')).toHaveText(['one', 'two']);
  await expect(block.locator('.madoc-code-highlight')).toHaveCount(0);
  await block.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  const newId = new URL(page.url()).pathname.split('/').at(-1);
  await expect
    .poll(
      async () =>
        await (await page.request.get(`/api/items/${newId}/export.md`)).text(),
    )
    .toContain('```text title="file&#x60;name" {bad}\none!');
});
