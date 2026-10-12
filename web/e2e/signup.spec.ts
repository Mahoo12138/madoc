import { expect, test, type Browser, type Page } from '@playwright/test';
import { openDocument } from './helpers/writing';

const BASE_URL = 'http://127.0.0.1:3100';
const SITE_API = '**/api/site';
const SIGN_UP_REQUEST_API = '**/api/auth/sign-up/request';
const SIGN_UP_COMPLETE_API = '**/api/auth/sign-up/complete';
const MAIL_API = '**/api/admin/mail';

// Public sign-up is a promise about what the page will not say. Two endpoints
// here are deliberately indistinguishable, and the UI has to stay that way:
//
// - The request endpoint answers the same 202 for a fresh address, an address
//   that already has an account and an address that may not register at all.
//   Anything the page says about those three cases must be byte-identical,
//   because a single differing word is an account oracle worth more to an
//   attacker than any one account (§9.7, §11.2).
// - A verification link is consumed once, and the four reasons it can stop
//   working (unknown, revoked, expired, already used) all arrive as the same
//   404. The page must not help tell them apart either.
//
// The admin side has one promise of its own: `open` may only be selectable when
// the server has confirmed it can send mail. Offering a click the server answers
// with 422 is worse than not offering it at all.

/** A visitor with no session at all, so the anonymous branches are the ones under test. */
async function anonymousVisitor(browser: Browser, path: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${BASE_URL}${path}`);
  return { context, page };
}

/**
 * Force `GET /api/site` to a fixed verdict. Registration mode is shared site
 * policy that other specs rely on, so nothing here PATCHes it: these tests mock
 * the public read instead of moving the real setting.
 */
async function stubSiteInfo(
  page: Page,
  info: { registrationMode: string; publicRegistrationAvailable: boolean },
) {
  await page.route(SITE_API, (route) => route.fulfill({ json: info }));
}

/** The one acceptance sentence, for a fresh address and an existing account alike. */
const ACCEPTED = '如果该邮箱可以注册，我们已经发了一封邮件，请查收。';

test.describe('the sign-in page offers registration only when it works', () => {
  test('an unavailable public registration leaves no entry at all', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-in');
    try {
      // The shipped default is an invite-only site with no mail capability.
      await expect(visitor.page.getByRole('link', { name: '创建账号' })).toHaveCount(0);
      await expect(visitor.page.getByText('请通过邀请链接加入。')).toBeVisible();
    } finally {
      await visitor.context.close();
    }
  });

  test('an available public registration gets exactly one entry', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-in');
    try {
      await stubSiteInfo(visitor.page, {
        registrationMode: 'open',
        publicRegistrationAvailable: true,
      });
      await visitor.page.reload();
      const entry = visitor.page.getByRole('link', { name: '创建账号' });
      await expect(entry).toBeVisible();
      await expect(entry).toHaveAttribute('href', '/sign-up');
      // The one-line admission note is replaced by the entry, not stacked with it.
      await expect(visitor.page.getByText('请通过邀请链接加入。')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });
});

test.describe('the registration route answers directly instead of hiding', () => {
  test('a closed site says so and offers no form', async ({ page, browser }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-up');
    try {
      await stubSiteInfo(visitor.page, {
        registrationMode: 'closed',
        publicRegistrationAvailable: false,
      });
      await visitor.page.reload();
      await expect(visitor.page.getByText('此站点未开放自助注册。')).toBeVisible();
      // No email field and no submit button: nothing that can only fail.
      await expect(visitor.page.getByLabel('邮箱')).toHaveCount(0);
      await expect(
        visitor.page.getByRole('button', { name: '发送注册链接' }),
      ).toHaveCount(0);
      // A dead end still has a way out.
      await visitor.page.getByRole('link', { name: '直接登录' }).click();
      await expect(visitor.page).toHaveURL(/\/sign-in$/);
    } finally {
      await visitor.context.close();
    }
  });

  test('an invite-only site names the other way in', async ({ page, browser }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-up');
    try {
      await stubSiteInfo(visitor.page, {
        registrationMode: 'invite_only',
        publicRegistrationAvailable: false,
      });
      await visitor.page.reload();
      await expect(
        visitor.page.getByText('此站点仅接受邀请加入，未开放自助注册。'),
      ).toBeVisible();
      await expect(visitor.page.getByLabel('邮箱')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('an open site without mail capability does not pretend to offer a form', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-up');
    try {
      // The mode says open; the capability behind it does not exist. The page
      // must fall back to the closed answer instead of a form that can only be
      // refused at submit time.
      await stubSiteInfo(visitor.page, {
        registrationMode: 'open',
        publicRegistrationAvailable: false,
      });
      await visitor.page.reload();
      await expect(
        visitor.page.getByText('此站点未开放自助注册。'),
      ).toBeVisible();
      await expect(visitor.page.getByLabel('邮箱')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('an unreadable site verdict is an honest state, not a dead end', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await anonymousVisitor(browser, '/sign-up');
    try {
      await visitor.page.route(SITE_API, (route) =>
        route.fulfill({
          status: 500,
          json: { error: { code: 'INTERNAL', message: 'boom' } },
        }),
      );
      await visitor.page.reload();
      await expect(
        visitor.page.getByText('暂时无法读取站点的注册状态'),
      ).toBeVisible();
      // Fail closed: a form that might be refused is not offered on a guess.
      await expect(visitor.page.getByLabel('邮箱')).toHaveCount(0);
      // A read can fail transiently, so unlike an authorization decision it may
      // be retried.
      await expect(visitor.page.getByRole('button', { name: '重试' })).toBeVisible();
      await expect(visitor.page.getByText('boom')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });
});

test.describe('the request page says the same thing for every mailbox', () => {
  async function openAvailableForm(browser: Browser) {
    const visitor = await anonymousVisitor(browser, '/sign-up');
    await stubSiteInfo(visitor.page, {
      registrationMode: 'open',
      publicRegistrationAvailable: true,
    });
    await visitor.page.reload();
    return visitor;
  }

  test('a fresh address and a registered address are told the same thing', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await openAvailableForm(browser);
    try {
      const submitted: string[] = [];
      // The server answers identically in both cases, and so must the page.
      // The `known` flag stands in for the server-side knowledge the page is
      // never given: if the UI branched on it, the two runs below would differ.
      let known = false;
      await visitor.page.route(SIGN_UP_REQUEST_API, (route) => {
        submitted.push(route.request().postDataJSON().email);
        known = !known;
        return route.fulfill({
          status: 202,
          json: {
            accepted: true,
            message: '如果该邮箱可以用于注册，我们已经发送了一封验证邮件。请查收并按邮件中的链接完成注册。',
          },
        });
      });

      for (const address of [
        'fresh-visitor@example.test',
        'already-registered@example.test',
      ]) {
        // Each run starts from the empty form. Acceptance is component state, so
        // the page below it stays accepted until a reload; "resending" repeats
        // the request rather than reopening the field.
        if (submitted.length > 0) await visitor.page.reload();
        await visitor.page.getByLabel('邮箱').fill(address);
        await visitor.page.getByRole('button', { name: '发送注册链接' }).click();
        await expect(visitor.page.getByText(ACCEPTED, { exact: true })).toBeVisible();
        // The server's own wording never reaches the page: the accepted sentence
        // has exactly one source, so it cannot drift into a second branch.
        await expect(
          visitor.page.getByText('如果该邮箱可以用于注册，我们已经发送了一封验证邮件。'),
        ).toHaveCount(0);
        // Neither a name nor a password is collected before the mailbox is
        // verified.
        await expect(visitor.page.getByLabel('姓名')).toHaveCount(0);
        await expect(visitor.page.locator('input[type=password]')).toHaveCount(0);
        // No "already registered" hint of any kind. The wording is deliberately
        // narrow: the page carries a permanent "已有账号？直接登录" link, and that
        // is navigation, not a statement about this mailbox.
        await expect(
          visitor.page.getByText(/已经注册|已被使用|已被占用|邮箱已存在|已拥有账号/),
        ).toHaveCount(0);
        }
      expect(submitted).toEqual([
        'fresh-visitor@example.test',
        'already-registered@example.test',
      ]);
    } finally {
      await visitor.context.close();
    }
  });

  test('resending is the only action after acceptance and asks for no new address', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await openAvailableForm(browser);
    try {
      let requests = 0;
      await visitor.page.route(SIGN_UP_REQUEST_API, (route) => {
        requests++;
        return route.fulfill({ status: 202, json: { accepted: true } });
      });
      await visitor.page.getByLabel('邮箱').fill('resend-me@example.test');
      await visitor.page.getByRole('button', { name: '发送注册链接' }).click();
      await expect(visitor.page.getByText(ACCEPTED, { exact: true })).toBeVisible();

      // An empty email field is the enumeration tool: "try another one" turns
      // the page into a checker. Acceptance replaces it entirely.
      await expect(visitor.page.getByLabel('邮箱')).toHaveCount(0);
      const resend = visitor.page.getByRole('button', { name: '重新发送' });
      await expect(resend).toBeVisible();
      await resend.click();
      await expect(visitor.page.getByText(ACCEPTED, { exact: true })).toBeVisible();
      expect(requests).toBe(2);
    } finally {
      await visitor.context.close();
    }
  });

  test('throttling asks the visitor to wait and is never retried for them', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await openAvailableForm(browser);
    try {
      let attempts = 0;
      await visitor.page.route(SIGN_UP_REQUEST_API, (route) => {
        attempts++;
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '60' },
          json: { error: { code: 'RATE_LIMITED', message: 'too many attempts' } },
        });
      });
      await visitor.page.getByLabel('邮箱').fill('throttled@example.test');
      await visitor.page.getByRole('button', { name: '发送注册链接' }).click();
      await expect(
        visitor.page.getByText('提交过于频繁，已被限流。请稍后再试，不要反复提交。'),
      ).toBeVisible();
      // A limit does not lift itself; an automatic retry would just spend more
      // of the budget the visitor still has.
      await visitor.page.waitForTimeout(1500);
      expect(attempts).toBe(1);
      await expect(visitor.page.getByText(ACCEPTED, { exact: true })).toHaveCount(0);
      await expect(visitor.page.getByText('too many attempts')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('a failed send is reported as a failed send', async ({ page, browser }) => {
    await openDocument(page);
    const visitor = await openAvailableForm(browser);
    try {
      await visitor.page.route(SIGN_UP_REQUEST_API, (route) =>
        route.fulfill({
          status: 500,
          json: {
            error: {
              code: 'INTERNAL',
              // The real failures are things like relay rejections and dial
              // errors; none of that helps someone filling in a form.
              message: 'dial tcp 10.0.0.5:587: connection refused',
            },
          },
        }),
      );
      await visitor.page.getByLabel('邮箱').fill('unreachable@example.test');
      await visitor.page.getByRole('button', { name: '发送注册链接' }).click();
      await expect(
        visitor.page.getByText('验证邮件发送失败，请稍后重试。'),
      ).toBeVisible();
      // The relay's own error stays in the server log.
      await expect(visitor.page.getByText(/connection refused|10\.0\.0\.5/)).toHaveCount(0);
      // The draft survives so a retry costs one field, not the whole form.
      await expect(visitor.page.getByLabel('邮箱')).toHaveValue(
        'unreachable@example.test',
      );
    } finally {
      await visitor.context.close();
    }
  });

  test('a site that stops accepting registration says so plainly', async ({
    page,
    browser,
  }) => {
    await openDocument(page);
    const visitor = await openAvailableForm(browser);
    try {
      await visitor.page.route(SIGN_UP_REQUEST_API, (route) =>
        route.fulfill({
          status: 403,
          json: {
            error: { code: 'REGISTRATION_CLOSED', message: '当前站点未开放自助注册' },
          },
        }),
      );
      await visitor.page.getByLabel('邮箱').fill('too-late@example.test');
      await visitor.page.getByRole('button', { name: '发送注册链接' }).click();
      // The admin closed the site while the form was open (§11.2). This says
      // which door is shut without claiming anything about the address.
      await expect(
        visitor.page.getByText('此站点当前不接受公开注册，请联系站点管理员。'),
      ).toBeVisible();
      await expect(visitor.page.getByText('当前站点未开放自助注册')).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });
});

test.describe('the completion page turns a link into an account', () => {
  test('it asks for a name and a password and promises nothing more', async ({
    browser,
  }) => {
    const visitor = await anonymousVisitor(browser, '/sign-up/token-start');
    try {
      await expect(visitor.page.getByRole('heading', { name: '完成注册' })).toBeVisible();
      await expect(visitor.page.getByLabel('姓名')).toBeVisible();
      await expect(visitor.page.locator('input[type=password]')).toBeVisible();
      await expect(
        visitor.page.getByRole('button', { name: '完成注册' }),
      ).toBeEnabled();
      // Sign-up creates an ordinary user. Whether that user may create a
      // workspace is the site setting's call, and the page must not promise it.
      await expect(visitor.page.getByText('注册后你是本站的普通用户')).toBeVisible();
      await expect(
        visitor.page.getByText(/将成为管理员|自动创建工作区|自动加入工作区/),
      ).toHaveCount(0);
      // Opening the link must not consume it: no read request is made here, so
      // a mail client's link preview cannot spend the registrant's one chance.
      // (The verification of this mailbox is the server's write-time fact, not
      // something the page claims to know.)
      await expect(visitor.page.getByText(/邮箱已验证|验证完成/)).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('a successful completion posts the token once and lands on the workspace list', async ({
    browser,
  }) => {
    const visitor = await anonymousVisitor(browser, '/sign-up/token-ok');
    try {
      const completions: { token: string; name: string; password: string }[] = [];
      await visitor.page.route(SIGN_UP_COMPLETE_API, (route) => {
        completions.push(route.request().postDataJSON());
        return route.fulfill({
          json: {
            user: { id: 'u-new', name: '新用户', email: 'newcomer@example.test' },
            csrfToken: 'ignored',
          },
        });
      });
      await visitor.page.getByLabel('姓名').fill('  新用户  ');
      await visitor.page.locator('input[type=password]').fill('password123');
      const workspacesRequested = visitor.page.waitForRequest(
        (request) => request.url().endsWith('/api/workspaces') && request.method() === 'GET',
      );
      await visitor.page.getByRole('button', { name: '完成注册' }).click();
      await workspacesRequested;

      expect(completions).toHaveLength(1);
      expect(completions[0].token).toBe('token-ok');
      // What goes to the server is the trimmed value.
      expect(completions[0].name).toBe('新用户');
      expect(completions[0].password).toBe('password123');
    } finally {
      await visitor.context.close();
    }
  });

  test('four dead links produce one identical explanation', async ({ browser }) => {
    const visitor = await anonymousVisitor(browser, '/sign-up/token-dead');
    try {
      const UNIFIED =
        '这个注册链接无效或已失效；它可能已被撤销、已经使用过，或者已经过期。请回到注册页重新申请，或联系站点管理员。';
      const readings: string[] = [];
      // Unknown, revoked, expired and already used all arrive as the same 404:
      // a tellable difference would let someone map the token space (§11.2).
      const reasons = [
        { code: 'NOT_FOUND', message: 'resource not found' },
        { code: 'ENROLLMENT_REVOKED', message: 'revoked by admin' },
        { code: 'ENROLLMENT_EXPIRED', message: 'expired at 2026-10-12' },
        { code: 'ENROLLMENT_CONSUMED', message: 'already consumed' },
      ];
      let index = 0;
      await visitor.page.route(SIGN_UP_COMPLETE_API, (route) => {
        const reason = reasons[Math.min(index, reasons.length - 1)];
        index++;
        return route.fulfill({
          status: 404,
          json: { error: { code: reason.code, message: reason.message } },
        });
      });
      await visitor.page.getByLabel('姓名').fill('新用户');
      await visitor.page.locator('input[type=password]').fill('password123');

      for (const reason of reasons) {
        await visitor.page.getByRole('button', { name: '完成注册' }).click();
        await expect(visitor.page.getByText(UNIFIED)).toBeVisible();
        readings.push(await visitor.page.locator('[role=alert]').innerText());
        // Whatever the server said stays server side.
        await expect(visitor.page.getByText(reason.message)).toHaveCount(0);
        await expect(visitor.page.getByText(reason.code)).toHaveCount(0);
      }
      expect(new Set(readings.map((text) => text.trim())).size).toBe(1);
      // A failed submit keeps the name; the password is held in memory only.
      await expect(visitor.page.getByLabel('姓名')).toHaveValue('新用户');
      // Joined into a string rather than returned as an array so that a failure
      // prints what was actually stored instead of an opaque value.
      const storedKeys = await visitor.page.evaluate(() =>
        Object.keys(window.localStorage).join('|'),
      );
      expect(storedKeys).not.toMatch(/pass|密码/i);
    } finally {
      await visitor.context.close();
    }
  });

  test('an already registered mailbox is pointed at sign-in, never at a reset', async ({
    browser,
  }) => {
    const visitor = await anonymousVisitor(browser, '/sign-up/token-taken');
    try {
      await visitor.page.route(SIGN_UP_COMPLETE_API, (route) =>
        route.fulfill({
          status: 409,
          json: {
            error: { code: 'EMAIL_ALREADY_REGISTERED', message: '该邮箱已注册，请直接登录' },
          },
        }),
      );
      await visitor.page.getByLabel('姓名').fill('新用户');
      await visitor.page.locator('input[type=password]').fill('password123');
      await visitor.page.getByRole('button', { name: '完成注册' }).click();
      await expect(
        visitor.page.getByText('该邮箱已有账号，请直接使用已有账号登录，或联系站点管理员调整。'),
      ).toBeVisible();
      // This flow must not look like a way to take over an existing account.
      await expect(
        visitor.page.getByText(/重置密码|修改其密码|重新设置密码/),
      ).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('a site that closes mid-flow stops the link, and says which door shut', async ({
    browser,
  }) => {
    const visitor = await anonymousVisitor(browser, '/sign-up/token-closed');
    try {
      await visitor.page.route(SIGN_UP_COMPLETE_API, (route) =>
        route.fulfill({
          status: 403,
          json: {
            error: {
              code: 'REGISTRATION_CLOSED',
              message: '站点已关闭公开注册，请联系站点管理员',
            },
          },
        }),
      );
      await visitor.page.getByLabel('姓名').fill('新用户');
      await visitor.page.locator('input[type=password]').fill('password123');
      await visitor.page.getByRole('button', { name: '完成注册' }).click();
      // An already-issued link stops working once the site closes; the page
      // names that fact instead of blaming the token.
      await expect(
        visitor.page.getByText('站点已关闭公开注册，这个链接不能再创建账号。'),
      ).toBeVisible();
      await expect(visitor.page.getByText(/无效或已失效/)).toHaveCount(0);
    } finally {
      await visitor.context.close();
    }
  });

  test('throttling and internal failures never reach the visitor', async ({
    browser,
  }) => {
    const limited = await anonymousVisitor(browser, '/sign-up/token-throttled');
    try {
      let attempts = 0;
      await limited.page.route(SIGN_UP_COMPLETE_API, (route) => {
        attempts++;
        return route.fulfill({
          status: 429,
          json: { error: { code: 'RATE_LIMITED', message: 'too many attempts' } },
        });
      });
      await limited.page.getByLabel('姓名').fill('新用户');
      await limited.page.locator('input[type=password]').fill('password123');
      await limited.page.getByRole('button', { name: '完成注册' }).click();
      await expect(
        limited.page.getByText('尝试过于频繁，已被限流。请稍后重试，不要反复提交。'),
      ).toBeVisible();
      await limited.page.waitForTimeout(1500);
      expect(attempts).toBe(1);
    } finally {
      await limited.context.close();
    }

    const broken = await anonymousVisitor(browser, '/sign-up/token-broken');
    try {
      await broken.page.route(SIGN_UP_COMPLETE_API, (route) =>
        route.fulfill({
          status: 500,
          json: {
            error: {
              code: 'INTERNAL',
              message: 'bcrypt: password length exceeds 72 bytes',
            },
          },
        }),
      );
      await broken.page.getByLabel('姓名').fill('新用户');
      await broken.page.locator('input[type=password]').fill('password123');
      await broken.page.getByRole('button', { name: '完成注册' }).click();
      await expect(
        broken.page.getByText('账号未能创建，请稍后重试。', { exact: true }),
      ).toBeVisible();
      await expect(broken.page.getByText(/bcrypt|72 bytes|INTERNAL/)).toHaveCount(0);
      await expect(broken.page.getByLabel('姓名')).toHaveValue('新用户');
    } finally {
      await broken.context.close();
    }
  });
});

test.describe('the admin panel gates the open mode on real mail capability', () => {
  async function openSiteSettings(page: Page) {
    await openDocument(page);
    await page.goto('/admin/settings');
    await expect(page.getByRole('main', { name: '站点管理' })).toBeVisible();
  }

  test('without SMTP the open option is unselectable and says why', async ({ page }) => {
    await openSiteSettings(page);
    const mode = page.getByRole('radiogroup', { name: '注册模式' });
    await expect(mode).toBeVisible();
    // All three modes are on offer as choices; `open` simply cannot be picked.
    await expect(mode.getByRole('radio', { name: '公开注册' })).toBeDisabled();
    await expect(mode.getByRole('radio', { name: '已关闭' })).toBeEnabled();
    await expect(mode.getByRole('radio', { name: '仅邀请' })).toBeEnabled();
    // The 12px line names the actual prerequisite and the actual remedy. It
    // must not claim the setting took effect, and it must not offer a form for
    // credentials this page has no business accepting.
    const note = page.getByText('发送验证邮件所需的 SMTP 尚未配置');
    await expect(note).toBeVisible();
    await expect(note).toContainText('设置环境变量后重启服务');
    await expect(page.locator('#madoc-smtp-password')).toHaveCount(0);
  });

  test('the mail diagnosis is a read-only mirror of the deployment config', async ({
    page,
  }) => {
    await openSiteSettings(page);
    await page.route(MAIL_API, (route) =>
      route.fulfill({
        json: {
          configured: true,
          host: 'smtp.example.test',
          port: 587,
          from: 'Madoc <noreply@example.test>',
          tls: 'starttls',
          authConfigured: true,
          publicUrl: 'https://madoc.example.test',
        },
      }),
    );
    await page.reload();
    const diagnosis = page.getByRole('group', { name: '发信配置诊断' });
    await expect(diagnosis).toBeVisible();
    await expect(diagnosis).toContainText('smtp.example.test:587');
    await expect(diagnosis).toContainText('noreply@example.test');
    await expect(diagnosis).toContainText('STARTTLS');
    await expect(diagnosis).toContainText('SMTP 认证已配置');
    await expect(diagnosis).toContainText('https://madoc.example.test');
    // No credentials, ever: no input, and no way to type one in either.
    await expect(
      page.locator('input[type=password],[name*=password i],[id*=password i]'),
    ).toHaveCount(0);
    // The honest part: changing environment variables needs a restart, so the
    // page must not promise the next form submission will use them.
    await expect(page.getByText('需要重启服务才会生效')).toBeVisible();
    await expect(page.getByText(/立即生效|保存后生效|马上生效/)).toHaveCount(0);
  });

  test('a missing mail capability names the remedy instead of offering a fix here', async ({
    page,
  }) => {
    await openSiteSettings(page);
    await page.route(MAIL_API, (route) =>
      route.fulfill({
        json: {
          configured: false,
          host: '',
          port: 0,
          from: '',
          tls: 'none',
          authConfigured: false,
          publicUrl: '',
        },
      }),
    );
    await page.reload();
    const section = page.getByRole('region', { name: '发信能力' });
    await expect(section.getByText('尚未配置 SMTP')).toBeVisible();
    // Unconfigured mail is not a fault in the rest of the product, and the
    // section says what still works.
    await expect(section).toContainText('初始化、工作区邀请和已有账号登录照常工作');
    await expect(section).toContainText('设置 SMTP 环境变量后重启服务');
    await expect(section.getByRole('group', { name: '发信配置诊断' })).toHaveCount(0);
  });

  test('losing admin permission empties the diagnosis too', async ({ page, browser }) => {
    await openDocument(page);
    const workspaceId = new URL(page.url()).pathname.split('/')[2];
    const owner = await (
      await page.request.get(`${BASE_URL}/api/workspaces`)
    ).json();
    expect(owner.length).toBeGreaterThan(0);
    const headers = {
      'x-madoc-csrf-token': (
        await page.context().cookies()
      ).find((cookie) => cookie.name === 'madoc_csrf')!.value.split('.')[0],
      Origin: BASE_URL,
    };
    const invitation = await (
      await page.request.post(`${BASE_URL}/api/workspaces/${workspaceId}/invites`, {
        headers,
        data: { email: `outsider-${Date.now()}@example.test`, role: 'editor' },
      })
    ).json();

    const memberContext = await browser.newContext();
    try {
      const accepted = await memberContext.request.post(
        `${BASE_URL}/api/invites/${invitation.token}/accept`,
        { data: { name: 'Outside Member', password: 'password123' } },
      );
      expect(accepted.ok()).toBeTruthy();
      const member = await memberContext.newPage();
      await member.goto(`${BASE_URL}/admin/settings`);
      // The whole page is refused, so no configuration value leaks through the
      // diagnosis section either.
      await expect(member.getByText('没有站点管理权限')).toBeVisible();
      await expect(
        member.getByRole('group', { name: '发信配置诊断' }),
      ).toHaveCount(0);
      await expect(member.getByText(/smtp|587|STARTTLS/i)).toHaveCount(0);
    } finally {
      await memberContext.close();
    }
  });
});
