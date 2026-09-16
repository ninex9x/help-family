/** Agenda e histórico SSR com registros fictícios, inclusive com JavaScript desabilitado. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { routineFixture } from './routines-fixture.js';
async function setup(t) {
  const f = await routineFixture(t, {
    doseClock: { now: () => new Date('2026-09-16T15:00:00.000Z') },
  });
  const routine = await f.create(f.path, f.input),
    path = `/families/${f.family.id}/doses`;
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1280, height: 900 },
  });
  await context.addCookies([
    { name: 'help_family_accounts', value: f.alice.cookie.split('=')[1], url: f.base },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  return { ...f, routine, path, page, context };
}
test('SSR today records taken/skipped doses and filters immutable history without JavaScript', async (t) => {
  const f = await setup(t),
    page = f.page;
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${f.base}/families/${f.family.id}`);
  await page.getByRole('link', { name: 'Doses de hoje', exact: true }).click();
  assert.equal(await page.locator('.dose-card').count(), 2);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/doses-desktop.png', fullPage: true });
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const card = await page.locator('.dose-card').first().boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/doses-mobile-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  const first = page.locator('.dose-card').first();
  await first.getByText('Adicionar observação', { exact: true }).click();
  await first.getByLabel('Observação', { exact: true }).fill('<img src=x> Observação fictícia');
  await first.getByRole('button', { name: 'Tomada', exact: true }).click();
  await page.waitForURL(`**${f.path}`);
  assert.equal(await page.locator('.dose-taken').count(), 1);
  await page.getByRole('button', { name: 'Não tomada', exact: true }).click();
  await page.waitForURL(`**${f.path}`);
  assert.equal(await page.locator('.dose-skipped').count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Tomada', exact: true }).count(), 0);
  assert.match(
    await page.locator('.dose-summary').textContent(),
    /0 pendentes · 1 tomadas · 1 não tomadas/,
  );
  await page.getByRole('link', { name: 'Ver histórico' }).click();
  await page.getByLabel('Familiar', { exact: true }).selectOption(f.member.id);
  await page.getByLabel('De', { exact: true }).fill('2026-09-16');
  await page.getByLabel('Até', { exact: true }).fill('2026-09-16');
  await page.getByRole('button', { name: 'Filtrar histórico' }).click();
  assert.equal(await page.locator('.dose-card').count(), 2);
  assert.equal(await page.locator('img').count(), 0);
  assert.equal((await page.content()).includes('<script'), false);
  await page.locator('h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/dose-history-mobile.png', fullPage: true });
  await page.getByLabel('De', { exact: true }).fill('2026-09-15');
  await page.getByLabel('Até', { exact: true }).fill('2026-09-15');
  await page.getByRole('button', { name: 'Filtrar histórico' }).click();
  assert.equal(
    await page.getByRole('heading', { name: 'Nenhum registro neste período' }).count(),
    1,
  );
  assert.deepEqual(errors, []);
});
test('SSR blocks stale clinical context, duplicate submissions, readers and forged CSRF', async (t) => {
  const f = await setup(t);
  const occurrence = (await f.request(`${f.path}/today`, { account: f.alice })).body.items[0];
  const body = {
    routineId: f.routine.id,
    date: occurrence.date,
    time: occurrence.time,
    status: 'taken',
    version: '1',
    context: occurrence.context,
  };
  const post = (account = f.alice, changes = {}) =>
    fetch(f.base + f.path, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: f.base,
        Cookie: account.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ ...body, _csrf: account.csrfToken, ...changes }),
    });
  assert.equal((await post(f.alice, { _csrf: 'fake' })).status, 403);
  assert.equal((await post(f.alice, { memberId: f.member.id })).status, 422);
  await f.request(`/families/${f.family.id}/medicines/${f.medicine.id}`, {
    method: 'PATCH',
    account: f.alice,
    headers: { 'If-Match': '1' },
    body: { name: 'Medicamento editado fictício' },
  });
  const stale = await post();
  assert.equal(stale.status, 409);
  assert.match(await stale.text(), /Recarregue a agenda/);
  assert.equal((await f.manager.query('SELECT count(*) FROM dose_logs')).rows[0].count, '0');
  const fresh = (await f.request(`${f.path}/today`, { account: f.alice })).body.items[0];
  assert.equal((await post(f.alice, { context: fresh.context })).status, 303);
  assert.equal((await post(f.alice, { context: fresh.context })).status, 409);
  await f.context.clearCookies();
  await f.context.addCookies([
    { name: 'help_family_accounts', value: f.bob.cookie.split('=')[1], url: f.base },
  ]);
  assert.equal((await f.page.goto(f.base + f.path)).status(), 404);
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [f.family.id, f.bob.user.id, 'reader'],
  );
  await f.page.goto(f.base + f.path);
  assert.equal(await f.page.locator('.dose-card').count(), 2);
  assert.equal(await f.page.getByRole('button', { name: 'Tomada', exact: true }).count(), 0);
  assert.equal((await post(f.bob, { time: '20:00', context: fresh.context })).status, 403);
});
