/** Fluxo SSR diário sem scripts, em banco descartável e somente localhost. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { routineFixture } from './routines-fixture.js';
async function pageFor(t, f, account) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    { name: 'help_family_accounts', value: account.cookie.split('=')[1], url: f.base },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return page;
}
test('routine forms create, edit, pause and reactivate without JavaScript and preserve responsive cards', async (t) => {
  const f = await routineFixture(t),
    page = await pageFor(t, f, f.alice);
  const failures = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('422')) failures.push(m.text());
  });
  await page.goto(`${f.base}/families/${f.family.id}`);
  await page.getByRole('link', { name: 'Ver rotinas', exact: true }).click();
  await page.getByRole('link', { name: 'Criar rotina', exact: true }).click();
  await page.getByLabel('Familiar', { exact: true }).selectOption(f.member.id);
  await page.getByLabel('Medicamento e apresentação').selectOption(f.presentation.id);
  await page.getByLabel('Quantidade por dose').fill('1 unidade fictícia');
  await page.getByLabel('Horários diários', { exact: true }).fill('08:00, 08:00');
  await page.getByRole('button', { name: 'Salvar rotina' }).click();
  assert.match(await page.getByRole('alert').textContent(), /horários diferentes/);
  assert.equal((await f.manager.query('SELECT count(*) FROM routines')).rows[0].count, '0');
  assert.equal(await page.getByLabel('Familiar', { exact: true }).inputValue(), f.member.id);
  await page.getByLabel('Horários diários', { exact: true }).fill('20:00, 08:00');
  await page.getByLabel('Instruções', { exact: true }).fill('Instruções fictícias.');
  await page.getByRole('button', { name: 'Salvar rotina' }).click();
  await page.waitForURL(`**${f.path}`);
  assert.equal(await page.getByRole('heading', { name: 'Helena Fictícia' }).count(), 1);
  assert.deepEqual(
    (await page.locator('.medication-time-chips > span').allTextContents()).map((text) =>
      text.replace(/\s/g, ''),
    ),
    ['schedule08:00', 'schedule20:00'],
  );
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/routines-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  assert.equal(await page.locator('.routine-status').textContent(), 'Pausada');
  await page.getByRole('button', { name: 'Reativar', exact: true }).click();
  assert.equal(await page.locator('.routine-status').textContent(), 'Ativa');
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const card = await page.locator('.routine-card').boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/routines-mobile-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('link', { name: 'Editar rotina', exact: true }).click();
  assert.equal(await page.locator('select[name=memberId]').count(), 0);
  await page.getByLabel('Quantidade por dose').fill('Quantidade fictícia atualizada');
  await page.getByLabel('Horários diários', { exact: true }).fill('09:30');
  await page.getByLabel('Instruções', { exact: true }).fill('<img src=x> Teste de escape');
  await page.locator('h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/routines-form-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar rotina' }).click();
  await page.waitForURL(`**${f.path}`);
  assert.match(await page.locator('.routine-quantity').textContent(), /atualizada/);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal((await page.content()).includes('<script'), false);
  assert.deepEqual(failures, []);
});
test('SSR handles missing prerequisites, reader access, forged writes and stale status submissions', async (t) => {
  const f = await routineFixture(t),
    item = await f.create(f.path, f.input),
    page = await pageFor(t, f, f.bob);
  await page.goto(`${f.base}/families/${f.other.id}/routines/new`);
  assert.equal(
    await page.getByRole('heading', { name: 'Prepare os cadastros da família' }).count(),
    1,
  );
  assert.equal(await page.getByRole('button', { name: 'Salvar rotina' }).count(), 0);
  assert.equal((await page.goto(f.base + f.path)).status(), 404);
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [f.family.id, f.bob.user.id, 'reader'],
  );
  await page.goto(f.base + f.path);
  assert.equal(await page.getByRole('heading', { name: 'Helena Fictícia' }).count(), 1);
  assert.equal(await page.getByRole('link', { name: /Criar rotina|Editar rotina/ }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Pausar' }).count(), 0);
  assert.equal((await page.goto(`${f.base}${f.path}/${item.id}/edit`)).status(), 403);
  const post = (account, body, suffix = 'status') =>
    fetch(`${f.base}${f.path}/${item.id}${suffix ? '/' + suffix : ''}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: f.base,
        Cookie: account.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        _csrf: account.csrfToken,
        version: '1',
        active: 'false',
        ...body,
      }),
    });
  assert.equal((await post(f.bob)).status, 403);
  assert.equal((await post(f.alice, { _csrf: 'fake' })).status, 403);
  assert.equal((await post(f.alice, { memberId: f.member.id }, '')).status, 422);
  assert.equal((await post(f.alice, { active: 'yes' })).status, 422);
  assert.equal((await post(f.alice)).status, 303);
  const conflict = await post(f.alice);
  assert.equal(conflict.status, 409);
  const html = await conflict.text();
  assert.ok(html.includes('Abrir versão atual'));
  assert.equal(html.includes('Salvar rotina'), false);
});
