/** Exercita o catálogo SSR sem JavaScript, com dados fictícios e PostgreSQL descartável. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fixture } from './fixture.js';
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
test('catalog and presentation forms work without JavaScript and retain the existing responsive style', async (t) => {
  const f = await fixture(t);
  const account = await f.register('catalog-ssr');
  const family = (await f.request('/families', { account })).body.items[0];
  const path = `/families/${family.id}/medicines`;
  const page = await pageFor(t, f, account);
  const failures = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('422')) failures.push(m.text());
  });
  await page.goto(`${f.base}/families/${family.id}`);
  await page.getByRole('link', { name: 'Ver medicamentos', exact: true }).click();
  assert.equal(
    await page.getByRole('heading', { name: 'Nenhum medicamento cadastrado' }).count(),
    1,
  );
  await page.getByRole('link', { name: 'Cadastrar medicamento', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar medicamento' }).click();
  assert.match(await page.getByRole('alert').textContent(), /nome/);
  assert.equal((await f.manager.query('SELECT count(*) FROM medicines')).rows[0].count, '0');
  await page.getByLabel('Nome do medicamento').fill('Medicamento Exemplo');
  await page.getByLabel('Cor do medicamento').selectOption('#6586a3');
  await page.getByRole('button', { name: 'Salvar medicamento' }).click();
  await page.waitForURL(`**${path}`);
  assert.equal(await page.getByRole('heading', { name: 'Medicamento Exemplo' }).count(), 1);
  await page.getByRole('link', { name: 'Adicionar apresentação de Medicamento Exemplo' }).click();
  await page.getByLabel('Concentração / dosagem').fill('10 mg (fictício)');
  await page.getByRole('button', { name: 'Salvar apresentação' }).click();
  assert.match(await page.getByRole('alert').textContent(), /apresentação/);
  assert.equal(
    (await f.manager.query('SELECT count(*) FROM medicine_presentations')).rows[0].count,
    '0',
  );
  assert.equal(await page.getByLabel('Concentração / dosagem').inputValue(), '10 mg (fictício)');
  await page.getByLabel('Apresentação', { exact: true }).fill('comprimido fictício');
  await page.getByRole('button', { name: 'Salvar apresentação' }).click();
  await page.waitForURL(`**${path}`);
  await page.getByRole('link', { name: /Editar apresentação/ }).click();
  await page.getByLabel('Apresentação', { exact: true }).fill('cápsula fictícia');
  await page.getByRole('button', { name: 'Salvar apresentação' }).click();
  await page.waitForURL(`**${path}`);
  assert.match(await page.locator('.catalog-presentation').textContent(), /cápsula fictícia/);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/catalog-desktop.png', fullPage: true });
  for (const width of [320, 390, 820]) {
    await page.setViewportSize({ width, height: 900 });
    const card = await page.locator('.catalog-drug-card').boundingBox();
    assert.ok(card.x >= 0 && card.x + card.width <= width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: 'test-results/catalog-mobile-dark.png', fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('link', { name: 'Editar medicamento Medicamento Exemplo' }).click();
  await page.getByLabel('Nome do medicamento').fill('Medicamento Atualizado <img src=x>');
  await page.getByRole('button', { name: 'Salvar medicamento' }).click();
  await page.waitForURL(`**${path}`);
  assert.equal(
    await page.getByRole('heading', { name: 'Medicamento Atualizado <img src=x>' }).count(),
    1,
  );
  assert.equal(await page.locator('img').count(), 0);
  assert.equal((await page.content()).includes('<script'), false);
  assert.deepEqual(failures, []);
});
test('catalog SSR enforces reader permissions, family/parent scope, CSRF and stale form versions', async (t) => {
  const f = await fixture(t);
  const alice = await f.register('catalog-owner');
  const bob = await f.register('catalog-reader');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const path = `/families/${family.id}/medicines`;
  const create = (name) => f.request(path, { method: 'POST', account: alice, body: { name } });
  const item = (await create('Item fictício')).body.item;
  const other = (await create('Outro item fictício')).body.item;
  const presentationPath = `${path}/${item.id}/presentations`;
  const variant = (
    await f.request(presentationPath, {
      method: 'POST',
      account: alice,
      body: { strength: 'Fictícia', form: 'Fictícia' },
    })
  ).body.item;
  const page = await pageFor(t, f, bob);
  assert.equal((await page.goto(f.base + path)).status(), 404);
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [family.id, bob.user.id, 'reader'],
  );
  await page.goto(f.base + path);
  assert.equal(await page.getByRole('heading', { name: 'Item fictício', exact: true }).count(), 1);
  assert.equal(
    await page
      .getByRole('link', {
        name: /Cadastrar medicamento|Editar medicamento|Adicionar apresentação|Editar apresentação/,
      })
      .count(),
    0,
  );
  for (const suffix of [
    '/new',
    `/${item.id}/edit`,
    `/${item.id}/presentations/new`,
    `/${item.id}/presentations/${variant.id}/edit`,
  ])
    assert.equal((await page.goto(f.base + path + suffix)).status(), 403);
  const post = (target, account, data) =>
    fetch(f.base + target, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        Origin: f.base,
        Cookie: account.cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ _csrf: account.csrfToken, ...data }),
    });
  for (const [target, data] of [
    [`${path}/${item.id}`, { name: 'Alterado', version: '1' }],
    [`${presentationPath}/${variant.id}`, { form: 'Alterada', version: '1' }],
  ]) {
    assert.equal((await post(target, bob, data)).status, 403);
    assert.equal((await post(target, alice, { ...data, _csrf: 'fake' })).status, 403);
    assert.equal((await post(target, alice, { ...data, familyId: family.id })).status, 422);
    assert.equal((await post(target, alice, data)).status, 303);
    const stale = await post(target, alice, data);
    assert.equal(stale.status, 409);
    const html = await stale.text();
    assert.ok(html.includes('Abrir versão atual'));
    assert.equal(html.includes('Salvar medicamento'), false);
    assert.equal(html.includes('Salvar apresentação'), false);
  }
  assert.equal(
    (
      await post(`${path}/${other.id}/presentations/${variant.id}`, alice, {
        version: '2',
        form: 'Trocada',
      })
    ).status,
    404,
  );
});
