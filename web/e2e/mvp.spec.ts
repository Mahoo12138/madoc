import { expect, test } from '@playwright/test';

test('first run, invite, collaborative Markdown, whiteboard and export', async ({ page, browser }) => {
  await page.goto('/');
  await page.getByLabel('姓名').fill('Owner');
  await page.getByLabel('邮箱').fill('owner@example.test');
  await page.getByLabel('密码').fill('password123');
  await page.getByRole('button', { name: '创建并进入' }).click();
  await page.getByRole('button', { name: '新建 Workspace' }).click();
  await page.getByLabel('名称').fill('Project Atlas');
  await page.getByRole('button', { name: '创建', exact: true }).click();

  await page.getByRole('button', { name: '新建文档' }).click();
  await page.getByLabel('名称').fill('Architecture');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible();
  const documentURL = page.url();
  await page.locator('.ProseMirror').fill('# System overview\n\nCollaborative Markdown works.');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.ProseMirror')).toHaveText('# System overviewCollaborative Markdown works.');
  await page.screenshot({ path: '/tmp/madoc-mvp-final.png', fullPage: true });

  await page.getByRole('button', { name: '成员管理' }).click();
  await page.getByRole('tab', { name: '邀请' }).click();
  await page.getByPlaceholder('member@example.com').fill('member@example.test');
  await page.getByRole('button', { name: '创建链接' }).click();
  await expect(page.locator('input[readonly]')).toHaveCount(3);
  const inviteLink = await page.locator('input[readonly]').last().inputValue();
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(inviteLink);
  await member.getByLabel('姓名').fill('Member');
  await member.getByLabel('设置密码').fill('password123');
  await member.getByRole('button', { name: '接受邀请' }).click();
  await member.getByText('Architecture', { exact: true }).click();

  await page.goto(documentURL);
  await page.locator('.ProseMirror').click();
  await page.locator('.ProseMirror').press('End');
  await page.locator('.ProseMirror').press('Enter');
  await page.locator('.ProseMirror').pressSequentially('Shared update');
  await expect(member.locator('.ProseMirror')).toContainText('Shared update');

  const workspaceURL = new URL(documentURL); workspaceURL.pathname = workspaceURL.pathname.split('/').slice(0, -1).join('/');
  await page.goto(workspaceURL.toString());
  await page.getByRole('button', { name: '新建白板' }).click();
  await page.getByLabel('名称').fill('System board');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.excalidraw')).toBeVisible();
  await member.goto(page.url());
  await expect(member.locator('.excalidraw')).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出' }).click();
  await page.getByRole('menuitem', { name: 'Excalidraw JSON' }).click();
  await download;
  await memberContext.close();
});
