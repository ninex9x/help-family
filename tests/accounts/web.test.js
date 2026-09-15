/** Navegação real com JavaScript desabilitado e banco PostgreSQL exclusivo do teste. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fixture } from './fixture.js';

test('SSR login, registration, family selection and logout work without JavaScript', async (t) => {
  const f = await fixture(t);
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.setDefaultNavigationTimeout(10000);
  const failures = [];
  page.on('response', (response) => {
    if (response.url().includes('/assets/') && !response.ok()) failures.push(response.url());
  });
  await page.goto(f.base);
  assert.equal(new URL(page.url()).pathname, '/login');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/accounts-login-desktop.png', fullPage: true });
  await page
    .locator('.access-switch')
    .getByRole('link', { name: 'Criar conta', exact: true })
    .click();
  await page.getByLabel('Seu nome', { exact: true }).fill('Pessoa SSR');
  await page.getByLabel('E-mail', { exact: true }).fill('ssr@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('curta');
  await page.getByLabel('Nome da sua família', { exact: true }).fill('Família SSR');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  assert.match(await page.getByRole('alert').textContent(), /15 e 128/);
  assert.equal(
    (await f.manager.query('SELECT count(*)::int AS total FROM users')).rows[0].total,
    0,
  );
  assert.equal(await page.getByLabel('Senha', { exact: true }).inputValue(), '');
  await page.getByLabel('Senha', { exact: true }).fill('Senha ficticia somente teste SSR!');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await page.waitForURL('**/families');
  await page.getByRole('link', { name: /Família SSR/ }).click();
  const familyUrl = page.url();
  await page.getByLabel('Nome da família', { exact: true }).fill('Família Renomeada SSR');
  await page.getByRole('button', { name: 'Salvar nome', exact: true }).click();
  await page.waitForURL(familyUrl);
  assert.equal(
    await page.getByRole('heading', { level: 1 }).textContent(),
    'Família Renomeada SSR',
  );
  const bob = await f.register('outro-ssr');
  const bobFamily = (await f.request('/families', { account: bob })).body.items[0];
  const denied = await page.goto(`${f.base}/families/${bobFamily.id}`);
  assert.equal(denied.status(), 404);
  assert.equal((await page.content()).includes(bobFamily.name), false);
  await page.goto(`${f.base}/families`);
  await page.getByLabel('Nome da família', { exact: true }).fill('Segunda Família');
  await page.getByRole('button', { name: 'Criar família', exact: true }).click();
  assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'Segunda Família');
  await page.goto(`${f.base}/families`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/accounts-families-mobile.png', fullPage: true });
  const content = await page.content();
  assert.equal(content.includes('<script'), false);
  assert.equal(content.includes('password_hash'), false);
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((c) => c.name === 'help_family_accounts');
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.path, '/');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page.waitForURL('**/login');
  await page.goto(`${f.base}/families`);
  assert.equal(new URL(page.url()).pathname, '/login');
  await page.getByLabel('E-mail', { exact: true }).fill('ssr@example.invalid');
  await page.getByLabel('Senha', { exact: true }).fill('Senha ficticia somente teste SSR!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL('**/families');
  assert.equal(await page.getByRole('link', { name: /Família Renomeada SSR/ }).count(), 1);
  assert.deepEqual(failures, []);
});

test('HTML writes enforce CSRF, origin, owner role, strict fields and stale versions', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob-web');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const post = (path, body, actor = alice, headers = {}) =>
    fetch(`${f.base}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: f.base,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: actor.cookie,
        ...headers,
      },
      body: new URLSearchParams(body),
    });
  assert.equal((await post('/families', { name: 'Bloqueado' })).status, 403);
  assert.equal(
    (
      await post(
        '/families',
        { name: 'Bloqueado', _csrf: alice.csrfToken },
        { ...alice },
        { Origin: 'http://127.0.0.1:3001' },
      )
    ).status,
    403,
  );
  assert.equal(
    (await post('/families', { name: 'Bloqueado', _csrf: alice.csrfToken, role: 'owner' })).status,
    422,
  );
  const path = `/families/${family.id}/rename`;
  assert.equal(
    (await post(path, { name: 'Permitido', version: 1, _csrf: alice.csrfToken })).status,
    303,
  );
  assert.equal(
    (await post(path, { name: 'Antigo', version: 1, _csrf: alice.csrfToken })).status,
    409,
  );
  await f.manager.query(
    "INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,'reader')",
    [family.id, bob.user.id],
  );
  assert.equal(
    (await post(path, { name: 'Leitor', version: 2, _csrf: bob.csrfToken }, bob)).status,
    403,
  );
  assert.equal(
    (await f.request(`/families/${family.id}`, { account: alice })).body.item.name,
    'Permitido',
  );
});
