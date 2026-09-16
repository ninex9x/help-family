/** Catálogo em bancos descartáveis: vínculos, RLS, cifras, quotas e concorrência reais. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './fixture.js';
import { transaction } from '../../backend/database/postgres/pool.js';
import { ensureClinicalKey } from '../../scripts/postgres/clinical-key.js';
const medicine = { name: 'Medicamento Fictício Alfa', color: '#016b54' };
const presentation = { strength: '10 mg (fictício)', form: 'comprimido fictício' };
async function setup(t) {
  const f = await fixture(t);
  const alice = await f.register('catalog-alice');
  const bob = await f.register('catalog-bob');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const other = (await f.request('/families', { account: bob })).body.items[0];
  const path = `/families/${family.id}/medicines`;
  const created = await f.request(path, { method: 'POST', account: alice, body: medicine });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const item = created.body.item;
  const presentationPath = `${path}/${item.id}/presentations`;
  const result = await f.request(presentationPath, {
    method: 'POST',
    account: alice,
    body: presentation,
  });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return {
    ...f,
    alice,
    bob,
    family,
    other,
    path,
    item,
    presentationPath,
    variant: result.body.item,
  };
}
test('catalog creates encrypted medicines and presentations with independent editable versions', async (t) => {
  const f = await setup(t);
  const catalog = await f.request(f.path, { account: f.alice });
  assert.equal(catalog.body.items[0].name, medicine.name);
  assert.equal(catalog.body.items[0].presentations[0].strength, presentation.strength);
  const patch = (path, body, version = '1') =>
    f.request(path, { method: 'PATCH', account: f.alice, headers: { 'If-Match': version }, body });
  const first = await patch(`${f.path}/${f.item.id}`, { name: 'Nome fictício atualizado' });
  assert.equal(first.status, 200);
  assert.equal(first.body.item.color, medicine.color);
  assert.equal(first.body.item.version, 2);
  const second = await patch(`${f.presentationPath}/${f.variant.id}`, { form: 'cápsula fictícia' });
  assert.equal(second.status, 200);
  assert.equal(second.body.item.strength, presentation.strength);
  assert.equal(second.body.item.version, 2);
  const results = await Promise.all([
    patch(`${f.path}/${f.item.id}`, { name: 'Edição A' }, '2'),
    patch(`${f.path}/${f.item.id}`, { name: 'Edição B' }, '2'),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const variants = await Promise.all([
    patch(`${f.presentationPath}/${f.variant.id}`, { strength: 'Variante A' }, '2'),
    patch(`${f.presentationPath}/${f.variant.id}`, { strength: 'Variante B' }, '2'),
  ]);
  assert.deepEqual(variants.map((r) => r.status).sort(), [200, 409]);
  const upper = `/families/${f.family.id.toUpperCase()}/medicines/${f.item.id.toUpperCase()}/presentations/${f.variant.id.toUpperCase()}`;
  assert.equal((await patch(upper, { strength: 'UUID normalizado' }, '3')).status, 200);
  assert.equal(
    (await f.request(`${f.presentationPath}/${f.variant.id}`, { account: f.alice })).body.item
      .strength,
    'UUID normalizado',
  );
  for (const table of ['medicines', 'medicine_presentations']) {
    const raw = JSON.stringify((await f.manager.query(`SELECT * FROM ${table}`)).rows);
    for (const text of [
      medicine.name,
      'Nome fictício atualizado',
      'cápsula fictícia',
      'UUID normalizado',
    ])
      assert.equal(raw.includes(text), false);
    assert.equal((await f.pool.query(`SELECT * FROM ${table}`)).rowCount, 0);
  }
});
test('family and medicine scope is enforced for API reads/writes, SQL RLS and composite foreign keys', async (t) => {
  const f = await setup(t);
  assert.equal((await f.request(f.path)).status, 401);
  for (const path of [f.path, `${f.path}/${f.item.id}`, `${f.presentationPath}/${f.variant.id}`])
    assert.equal((await f.request(path, { account: f.bob })).status, 404);
  for (const [path, method, body] of [
    [f.path, 'POST', medicine],
    [`${f.path}/${f.item.id}`, 'PATCH', medicine],
    [f.presentationPath, 'POST', presentation],
    [`${f.presentationPath}/${f.variant.id}`, 'PATCH', presentation],
  ]) {
    assert.equal(
      (await f.request(path, { method, account: f.bob, headers: { 'If-Match': '1' }, body }))
        .status,
      404,
    );
  }
  const second = (
    await f.request(f.path, { method: 'POST', account: f.alice, body: { name: 'Outro fictício' } })
  ).body.item;
  const wrongParent = `${f.path}/${second.id}/presentations/${f.variant.id}`;
  assert.equal((await f.request(wrongParent, { account: f.alice })).status, 404);
  assert.equal(
    (
      await f.request(wrongParent, {
        method: 'PATCH',
        account: f.alice,
        headers: { 'If-Match': '1' },
        body: presentation,
      })
    ).status,
    404,
  );
  const forgedFamily = `/families/${f.other.id}/medicines/${f.item.id}/presentations`;
  assert.equal(
    (await f.request(forgedFamily, { method: 'POST', account: f.bob, body: presentation })).status,
    404,
  );
  await assert.rejects(
    f.manager.query(
      'INSERT INTO medicine_presentations(id,family_id,medicine_id,content_ciphertext) VALUES ($1,$2,$3,$4)',
      [randomUUID(), f.other.id, f.item.id, 'ficticio'],
    ),
    { code: '23503' },
  );
  await assert.rejects(
    transaction(f.pool, f.alice.user.id, (c) =>
      c.query('UPDATE medicine_presentations SET medicine_id=$1 WHERE id=$2', [
        second.id,
        f.variant.id,
      ]),
    ),
    { code: '42501' },
  );
  await assert.rejects(
    transaction(f.pool, f.alice.user.id, (c) =>
      c.query('UPDATE medicines SET family_id=$1 WHERE id=$2', [f.other.id, f.item.id]),
    ),
    { code: '42501' },
  );
  for (const table of ['medicines', 'medicine_presentations'])
    assert.equal(
      await transaction(
        f.pool,
        f.bob.user.id,
        async (c) => (await c.query(`SELECT * FROM ${table}`)).rowCount,
      ),
      0,
    );
});
test('readers cannot mutate either resource, caregivers can, and membership revocation applies immediately', async (t) => {
  const f = await setup(t);
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [f.family.id, f.bob.user.id, 'reader'],
  );
  assert.equal((await f.request(f.path, { account: f.bob })).status, 200);
  const writes = [
    [f.path, 'POST', medicine],
    [`${f.path}/${f.item.id}`, 'PATCH', medicine],
    [f.presentationPath, 'POST', presentation],
    [`${f.presentationPath}/${f.variant.id}`, 'PATCH', presentation],
  ];
  for (const [path, method, body] of writes)
    assert.equal(
      (await f.request(path, { method, account: f.bob, headers: { 'If-Match': '1' }, body }))
        .status,
      403,
    );
  for (const table of ['medicines', 'medicine_presentations']) {
    assert.equal(
      await transaction(
        f.pool,
        f.bob.user.id,
        async (c) => (await c.query(`UPDATE ${table} SET version=version+1`)).rowCount,
      ),
      0,
    );
  }
  await assert.rejects(
    transaction(f.pool, f.bob.user.id, (c) =>
      c.query(
        'INSERT INTO medicine_presentations(id,family_id,medicine_id,content_ciphertext) VALUES ($1,$2,$3,$4)',
        [randomUUID(), f.family.id, f.item.id, 'ficticio'],
      ),
    ),
    { code: '42501' },
  );
  await f.manager.query(
    "UPDATE family_memberships SET role='caregiver' WHERE family_id=$1 AND user_id=$2",
    [f.family.id, f.bob.user.id],
  );
  for (const [path, method, body] of writes)
    assert.equal(
      (await f.request(path, { method, account: f.bob, headers: { 'If-Match': '1' }, body }))
        .status,
      method === 'POST' ? 201 : 200,
    );
  await f.manager.query(
    'UPDATE family_memberships SET active=false WHERE family_id=$1 AND user_id=$2',
    [f.family.id, f.bob.user.id],
  );
  assert.equal((await f.request(f.path, { account: f.bob })).status, 404);
});
test('catalog rejects unknown fields, invalid content, missing CSRF/origin and malformed versions', async (t) => {
  const f = await setup(t);
  const paths = [`${f.path}/${f.item.id}`, `${f.presentationPath}/${f.variant.id}`];
  for (const path of paths) {
    for (const body of [
      {},
      { familyId: f.other.id },
      { medicineId: f.item.id },
      { role: 'owner' },
      { version: 1 },
    ])
      assert.equal(
        (
          await f.request(path, {
            method: 'PATCH',
            account: f.alice,
            headers: { 'If-Match': '1' },
            body,
          })
        ).status,
        422,
      );
    const body = path === paths[0] ? medicine : presentation;
    for (const headers of [
      { 'X-CSRF-Token': 'fake', 'If-Match': '1' },
      { Origin: 'http://127.0.0.1:1', 'If-Match': '1' },
    ])
      assert.equal(
        (await f.request(path, { method: 'PATCH', account: f.alice, body, headers })).status,
        403,
      );
    assert.equal((await f.request(path, { method: 'PATCH', account: f.alice, body })).status, 428);
  }
  for (const body of [
    { name: '' },
    { name: ['fake'] },
    { name: 'a'.repeat(161) },
    { name: 'fake', color: 'red;display:none' },
  ])
    assert.equal((await f.request(f.path, { method: 'POST', account: f.alice, body })).status, 422);
  for (const body of [
    { strength: '', form: 'fake' },
    { strength: 'fake', form: ['fake'] },
    { strength: 'a'.repeat(81), form: 'fake' },
    { strength: 'fake', form: 'a\n' },
  ])
    assert.equal(
      (await f.request(f.presentationPath, { method: 'POST', account: f.alice, body })).status,
      422,
    );
});
test('catalog quotas remain bounded during concurrent creates and are scoped to family/medicine', async (t) => {
  const f = await setup(t);
  // Fixture-only filler: never decrypted, used solely to exercise the quota boundary.
  await f.manager.query(
    'INSERT INTO medicines(id,family_id,content_ciphertext) SELECT gen_random_uuid(),$1,$2 FROM generate_series(1,98)',
    [f.family.id, 'ficticio-quota'],
  );
  const create = () => f.request(f.path, { method: 'POST', account: f.alice, body: medicine });
  assert.deepEqual(
    (await Promise.all([create(), create()])).map((r) => r.status).sort(),
    [201, 422],
  );
  await f.manager.query(
    'INSERT INTO medicine_presentations(id,family_id,medicine_id,content_ciphertext) SELECT gen_random_uuid(),$1,$2,$3 FROM generate_series(1,18)',
    [f.family.id, f.item.id, 'ficticio-quota'],
  );
  const variant = () =>
    f.request(f.presentationPath, { method: 'POST', account: f.alice, body: presentation });
  assert.deepEqual(
    (await Promise.all([variant(), variant()])).map((r) => r.status).sort(),
    [201, 422],
  );
  assert.equal(
    (
      await f.request(`/families/${f.other.id}/medicines`, {
        method: 'POST',
        account: f.bob,
        body: medicine,
      })
    ).status,
    201,
  );
});
test('ciphertext cannot move between catalog rows and a missing key is not regenerated for a medicine-only database', async (t) => {
  const f = await setup(t);
  const raw = (
    await f.manager.query('SELECT content_ciphertext FROM medicines WHERE id=$1', [f.item.id])
  ).rows[0].content_ciphertext;
  await f.manager.query('UPDATE medicine_presentations SET content_ciphertext=$1 WHERE id=$2', [
    raw,
    f.variant.id,
  ]);
  const denied = await f.request(`${f.presentationPath}/${f.variant.id}`, { account: f.alice });
  assert.equal(denied.status, 500);
  assert.deepEqual(denied.body, { error: 'Não foi possível concluir a operação.' });
  const dir = await mkdtemp(join(tmpdir(), 'help-family-catalog-key-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const missing = join(dir, 'clinical.key');
  assert.equal((await f.manager.query('SELECT count(*) FROM members')).rows[0].count, '0');
  await assert.rejects(ensureClinicalKey(f.manager, missing), /Restaure clinical.key/);
  await assert.rejects(readFile(missing), { code: 'ENOENT' });
});
