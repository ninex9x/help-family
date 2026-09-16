/** Isolamento, integridade e concorrência de rotinas em PostgreSQL descartável. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { routineFixture } from './routines-fixture.js';
import { transaction } from '../../backend/database/postgres/pool.js';
test('routines derive their medicine, sort daily times, encrypt content and protect concurrent edits', async (t) => {
  const f = await routineFixture(t),
    item = await f.create(f.path, f.input);
  assert.equal(item.medicineId, f.medicine.id);
  assert.deepEqual(item.times, ['08:00', '20:00']);
  assert.equal(item.active, true);
  const edit = (body, v = '1') =>
    f.request(`${f.path}/${item.id}`, {
      method: 'PATCH',
      account: f.alice,
      headers: { 'If-Match': v },
      body,
    });
  const paused = await edit({ active: false });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.item.active, false);
  assert.deepEqual(paused.body.item.times, item.times);
  const concurrent = await Promise.all([
    edit({ quantity: 'Edição A' }, '2'),
    edit({ quantity: 'Edição B' }, '2'),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await edit({ active: true }, '3')).status, 200);
  const second = await f.create(f.path, f.input);
  assert.equal(second.version, 1);
  const raw = JSON.stringify(
    (await f.manager.query('SELECT * FROM routines WHERE id=$1', [item.id])).rows,
  );
  for (const text of [
    f.input.quantity,
    f.input.instruction,
    '08:00',
    '20:00',
    'Edição A',
    'Edição B',
  ])
    assert.equal(raw.includes(text), false);
  const upper = `/families/${f.family.id.toUpperCase()}/routines/${item.id.toUpperCase()}`;
  assert.equal(
    (
      await f.request(upper, {
        method: 'PATCH',
        account: f.alice,
        headers: { 'If-Match': '4' },
        body: { instruction: 'UUID normalizado' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request(`${f.path}/${item.id}`, { account: f.alice })).body.item.instruction,
    'UUID normalizado',
  );
});
test('routine API and RLS enforce family/role scope and SQL rejects mixed family references', async (t) => {
  const f = await routineFixture(t),
    item = await f.create(f.path, f.input);
  assert.equal((await f.request(f.path)).status, 401);
  for (const path of [f.path, `${f.path}/${item.id}`])
    assert.equal((await f.request(path, { account: f.bob })).status, 404);
  assert.equal(
    (
      await f.request(`/families/${f.other.id}/routines`, {
        method: 'POST',
        account: f.bob,
        body: f.input,
      })
    ).status,
    404,
  );
  assert.equal((await f.pool.query('SELECT * FROM routines')).rowCount, 0);
  assert.equal(
    await transaction(
      f.pool,
      f.bob.user.id,
      async (c) => (await c.query('SELECT * FROM routines')).rowCount,
    ),
    0,
  );
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [f.family.id, f.bob.user.id, 'reader'],
  );
  assert.equal((await f.request(f.path, { account: f.bob })).status, 200);
  const edit = () =>
    f.request(`${f.path}/${item.id}`, {
      method: 'PATCH',
      account: f.bob,
      headers: { 'If-Match': '1' },
      body: { active: false },
    });
  assert.equal((await edit()).status, 403);
  assert.equal(
    (await f.request(f.path, { method: 'POST', account: f.bob, body: f.input })).status,
    403,
  );
  assert.equal(
    await transaction(
      f.pool,
      f.bob.user.id,
      async (c) => (await c.query('UPDATE routines SET version=version+1')).rowCount,
    ),
    0,
  );
  await assert.rejects(
    transaction(f.pool, f.alice.user.id, (c) =>
      c.query('UPDATE routines SET member_id=$1 WHERE id=$2', [randomUUID(), item.id]),
    ),
    { code: '42501' },
  );
  const insert =
    'INSERT INTO routines(id,family_id,member_id,medicine_id,presentation_id,content_ciphertext) VALUES ($1,$2,$3,$4,$5,$6)';
  await assert.rejects(
    f.manager.query(insert, [
      randomUUID(),
      f.other.id,
      f.member.id,
      f.medicine.id,
      f.presentation.id,
      'ficticio',
    ]),
    { code: '23503' },
  );
  const otherMedicine = await f.create(`/families/${f.family.id}/medicines`, {
    name: 'Outro fictício',
  });
  await assert.rejects(
    f.manager.query(insert, [
      randomUUID(),
      f.family.id,
      f.member.id,
      otherMedicine.id,
      f.presentation.id,
      'ficticio',
    ]),
    { code: '23503' },
  );
  await assert.rejects(
    transaction(f.pool, f.bob.user.id, (c) =>
      c.query(insert, [
        randomUUID(),
        f.family.id,
        f.member.id,
        f.medicine.id,
        f.presentation.id,
        'ficticio',
      ]),
    ),
    { code: '42501' },
  );
  await f.manager.query(
    "UPDATE family_memberships SET role='caregiver' WHERE family_id=$1 AND user_id=$2",
    [f.family.id, f.bob.user.id],
  );
  assert.equal((await edit()).status, 200);
  assert.equal(
    (await f.request(f.path, { method: 'POST', account: f.bob, body: f.input })).status,
    201,
  );
  await f.manager.query(
    'UPDATE family_memberships SET active=false WHERE family_id=$1 AND user_id=$2',
    [f.family.id, f.bob.user.id],
  );
  assert.equal((await f.request(f.path, { account: f.bob })).status, 404);
});
test('server rejects invalid schedules, forged links, missing CSRF/origin and stale versions', async (t) => {
  const f = await routineFixture(t),
    item = await f.create(f.path, f.input);
  const edit = (body, headers = {}) =>
    f.request(`${f.path}/${item.id}`, {
      method: 'PATCH',
      account: f.alice,
      headers: { 'If-Match': '1', ...headers },
      body,
    });
  for (const times of [
    [],
    ['24:00'],
    ['12:60'],
    ['8:00'],
    ['08:00', '08:00'],
    ['08:00', 3],
    '08:00',
    Array(25).fill('00:00'),
  ])
    assert.equal((await edit({ times })).status, 422);
  for (const body of [
    { quantity: '' },
    { quantity: 'a'.repeat(121) },
    { instruction: 'a'.repeat(501) },
    { active: 'false' },
    { familyId: f.other.id },
    { memberId: f.member.id },
    { medicineId: f.medicine.id },
    { presentationId: f.presentation.id },
    { role: 'owner' },
    {},
  ])
    assert.equal((await edit(body)).status, 422);
  assert.equal((await edit({ active: false }, { 'X-CSRF-Token': 'fake' })).status, 403);
  assert.equal((await edit({ active: false }, { Origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await edit({ active: false }, { 'If-Match': '' })).status, 428);
  assert.equal(
    (
      await f.request(f.path, {
        method: 'POST',
        account: f.alice,
        body: { ...f.input, medicineId: f.medicine.id },
      })
    ).status,
    422,
  );
  const foreign = await f.create(
    `/families/${f.other.id}/members`,
    { name: 'Outra pessoa fictícia' },
    f.bob,
  );
  assert.equal(
    (
      await f.request(f.path, {
        method: 'POST',
        account: f.alice,
        body: { ...f.input, memberId: foreign.id },
      })
    ).status,
    404,
  );
});
test('routine quota is serialized and ciphertext is bound to each routine and its references', async (t) => {
  const f = await routineFixture(t),
    item = await f.create(f.path, f.input);
  const raw = (
    await f.manager.query('SELECT content_ciphertext FROM routines WHERE id=$1', [item.id])
  ).rows[0].content_ciphertext;
  const second = await f.create(f.path, f.input);
  await f.manager.query('UPDATE routines SET content_ciphertext=$1 WHERE id=$2', [raw, second.id]);
  assert.equal((await f.request(`${f.path}/${second.id}`, { account: f.alice })).status, 500);
  // Fixture-only filler: used for the quota boundary, never decrypted or placed in the local database.
  await f.manager.query(
    'INSERT INTO routines(id,family_id,member_id,medicine_id,presentation_id,content_ciphertext) SELECT gen_random_uuid(),$1,$2,$3,$4,$5 FROM generate_series(1,497)',
    [f.family.id, f.member.id, f.medicine.id, f.presentation.id, 'ficticio-quota'],
  );
  const create = () => f.request(f.path, { method: 'POST', account: f.alice, body: f.input });
  assert.deepEqual(
    (await Promise.all([create(), create()])).map((r) => r.status).sort(),
    [201, 422],
  );
});
