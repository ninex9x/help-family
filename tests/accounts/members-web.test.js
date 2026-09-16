/** Navegação de familiares sem JavaScript; dados fictícios e banco exclusivo de cada teste. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { fixture } from './fixture.js';
async function browserPage(t, f, account) {
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
test('SSR members preserve the design and support validation, photos and editing without JavaScript', async (t) => {
  const f = await fixture(t);
  const alice = await f.register('ssr-members');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const page = await browserPage(t, f, alice);
  const failures = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') failures.push(msg.text());
  });
  await page.goto(`${f.base}/families/${family.id}`);
  await page.getByRole('link', { name: 'Ver familiares', exact: true }).click();
  assert.equal(await page.getByRole('heading', { name: 'Nenhum familiar cadastrado' }).count(), 1);
  await page.getByRole('link', { name: 'Adicionar familiar', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar familiar' }).click();
  assert.match(await page.getByRole('alert').textContent(), /nome/);
  assert.equal((await f.manager.query('SELECT count(*) FROM members')).rows[0].count, '0');
  await page.getByLabel('Nome do familiar', { exact: true }).fill('Helena Exemplo');
  await page.getByLabel('Parentesco ou vínculo').fill('Avó');
  await page
    .getByLabel('Observações', { exact: true })
    .fill('Perfil fictício para teste de visualização.');
  await page.getByLabel('Cor do perfil').selectOption('#6586a3');
  await page.getByLabel('Foto do familiar', { exact: true }).setInputFiles({
    name: 'foto-invalida.png',
    mimeType: 'image/png',
    buffer: Buffer.from('arquivo ficticio invalido'),
  });
  await page.getByRole('button', { name: 'Salvar familiar' }).click();
  assert.match(await page.getByRole('alert').textContent(), /imagem|foto/);
  assert.equal((await f.manager.query('SELECT count(*) FROM members')).rows[0].count, '0');
  assert.equal(await page.getByLabel('Nome do familiar').inputValue(), 'Helena Exemplo');
  const photo = await sharp({
    create: { width: 32, height: 32, channels: 3, background: '#6586a3' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel('Foto do familiar', { exact: true })
    .setInputFiles({ name: 'foto-ficticia.png', mimeType: 'image/png', buffer: photo });
  await page.getByRole('button', { name: 'Salvar familiar' }).click();
  await page.waitForURL(`**/families/${family.id}/members`);
  assert.equal(await page.getByRole('heading', { name: 'Helena Exemplo' }).count(), 1);
  assert.equal(await page.getByRole('img', { name: 'Foto de Helena Exemplo' }).count(), 1);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/members-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/members-mobile.png', fullPage: true });
  const card = await page.locator('.account-member-card').boundingBox();
  assert.ok(card.x >= 0 && card.x + card.width <= 390);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const narrowCard = await page.locator('.account-member-card').boundingBox();
  assert.ok(narrowCard.x >= 0 && narrowCard.x + narrowCard.width <= 320);
  await page.screenshot({ path: 'test-results/members-dark-mobile.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Editar familiar' }).click();
  await page.getByLabel('Nome do familiar').fill('Helena Atualizada');
  await page.getByLabel('Remover foto atual').check();
  await page.locator('h1').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/members-form-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Salvar familiar' }).click();
  await page.waitForURL(`**/families/${family.id}/members`);
  assert.equal(await page.getByRole('heading', { name: 'Helena Atualizada' }).count(), 1);
  assert.equal(await page.getByRole('img').count(), 0);
  const content = await page.content();
  assert.equal(content.includes('<script'), false);
  assert.equal(content.includes('profile_ciphertext'), false);
  // Chromium logs expected HTTP 422 validation errors; other errors indicate a resource/CSP failure.
  assert.deepEqual(
    failures.filter((message) => !message.includes('422')),
    [],
  );
});
test('SSR rejects cross-family access and forged reader writes; stale forms require reloading', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('ssr-reader');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const path = `/families/${family.id}/members`;
  const member = (
    await f.request(path, { method: 'POST', account: alice, body: { name: 'Pessoa Fictícia' } })
  ).body.item;
  const page = await browserPage(t, f, bob);
  assert.equal((await page.goto(f.base + path)).status(), 404);
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [family.id, bob.user.id, 'reader'],
  );
  await page.goto(f.base + path);
  assert.equal(await page.getByRole('heading', { name: 'Pessoa Fictícia' }).count(), 1);
  assert.equal(
    await page.getByRole('link', { name: /Adicionar familiar|Editar familiar/ }).count(),
    0,
  );
  assert.equal((await page.goto(`${f.base}${path}/${member.id}/edit`)).status(), 403);
  const post = (actor, body) =>
    fetch(`${f.base}${path}/${member.id}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: f.base,
        Cookie: actor.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        _csrf: actor.csrfToken,
        version: '1',
        name: 'Tentativa fictícia',
        ...body,
      }),
    });
  assert.equal((await post(bob)).status, 403);
  assert.equal((await post(alice, { _csrf: 'invalid' })).status, 403);
  assert.equal((await post(alice, { familyId: family.id })).status, 422);
  assert.equal((await post(alice)).status, 303);
  const conflict = await post(alice);
  assert.equal(conflict.status, 409);
  const html = await conflict.text();
  assert.ok(html.includes('Abrir versão atual'));
  assert.equal(html.includes('Salvar familiar'), false);
});
