/** Dose/histórico com relógio injetado somente no teste e bancos PostgreSQL descartáveis. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { routineFixture } from './routines-fixture.js';
import { transaction } from '../../backend/database/postgres/pool.js';
async function setup(t) {
  let now = '2026-09-16T15:00:00.000Z';
  const f = await routineFixture(t, { doseClock: { now: () => new Date(now) } });
  const routine = await f.create(f.path, f.input),
    path = `/families/${f.family.id}/doses`;
  const body = {
    routineId: routine.id,
    date: '2026-09-16',
    time: '08:00',
    status: 'taken',
    note: 'Observação fictícia.',
  };
  const contexts = new Map();
  const record = async (input = body, account = f.alice, version = '1', headers = {}) => {
    const agenda = (await f.request(`${path}/today`, { account: f.alice })).body;
    for (const item of agenda.items || [])
      if (item.context) contexts.set(item.routineId, item.context);
    return f.request(path, {
      method: 'POST',
      account,
      headers: { 'If-Match': version, ...headers },
      body: { context: contexts.get(input.routineId) || '0'.repeat(64), ...input },
    });
  };
  return {
    ...f,
    routine,
    path,
    body,
    record,
    setNow: (value) => {
      now = value;
    },
  };
}
test('dose registration derives snapshots, uses server time and remains stable after clinical edits', async (t) => {
  const f = await setup(t);
  const pending = (await f.request(`${f.path}/today`, { account: f.alice })).body;
  assert.equal(pending.date, '2026-09-16');
  assert.equal(pending.timeZone, 'America/Sao_Paulo');
  assert.deepEqual(pending.counts, { pending: 2, taken: 0, skipped: 0 });
  const result = await f.record();
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.item.recordedAt, '2026-09-16T15:00:00.000Z');
  assert.equal(result.body.item.memberId, f.member.id);
  assert.equal(result.body.item.quantity, f.input.quantity);
  for (const [path, body] of [
    [`members/${f.member.id}`, { name: 'Nome novo fictício' }],
    [`medicines/${f.medicine.id}`, { name: 'Novo medicamento fictício' }],
    [
      `medicines/${f.medicine.id}/presentations/${f.presentation.id}`,
      { strength: 'Outra concentração fictícia' },
    ],
    [
      `routines/${f.routine.id}`,
      { quantity: 'Outra quantidade fictícia', times: ['21:00'], active: false },
    ],
  ]) {
    assert.equal(
      (
        await f.request(`/families/${f.family.id}/${path}`, {
          method: 'PATCH',
          account: f.alice,
          headers: { 'If-Match': '1' },
          body,
        })
      ).status,
      200,
    );
  }
  const history = await f.request(`${f.path}/history`, { account: f.alice });
  assert.equal(history.body.items[0].memberName, 'Helena Fictícia');
  assert.equal(history.body.items[0].medicineName, 'Medicamento Fictício');
  assert.equal(history.body.items[0].quantity, f.input.quantity);
  assert.equal(history.body.items[0].strength, '10 mg (fictício)');
  const today = await f.request(`${f.path}/today`, { account: f.alice });
  assert.equal(today.body.items.length, 1);
  assert.equal(today.body.items[0].status, 'taken');
  const raw = JSON.stringify((await f.manager.query('SELECT * FROM dose_logs')).rows);
  for (const value of [
    'Helena Fictícia',
    f.input.quantity,
    f.input.instruction,
    '08:00',
    'Observação fictícia.',
    'taken',
  ])
    assert.equal(raw.includes(value), false);
  const newId = randomUUID();
  await f.manager.query('UPDATE dose_logs SET id=$1 WHERE id=$2', [newId, result.body.item.id]);
  assert.equal((await f.request(`${f.path}/history`, { account: f.alice })).status, 500);
});
test('concurrent records are unique and paused, changed, nonexistent or stale-day occurrences are rejected', async (t) => {
  const f = await setup(t);
  assert.deepEqual(
    (await Promise.all([f.record(), f.record()])).map((r) => r.status).sort(),
    [201, 409],
  );
  assert.equal((await f.manager.query('SELECT count(*) FROM dose_logs')).rows[0].count, '1');
  assert.equal((await f.record({ ...f.body, time: '09:00' })).status, 422);
  assert.equal((await f.record({ ...f.body, routineId: randomUUID() })).status, 404);
  const patch = (body, version) =>
    f.request(`/families/${f.family.id}/routines/${f.routine.id}`, {
      method: 'PATCH',
      account: f.alice,
      headers: { 'If-Match': version },
      body,
    });
  await patch({ active: false }, '1');
  assert.equal((await f.record({ ...f.body, time: '20:00' })).status, 409);
  assert.equal((await f.record({ ...f.body, time: '20:00' }, f.alice, '2')).status, 409);
  await patch({ active: true }, '2');
  f.setNow('2026-09-17T02:59:59.000Z');
  assert.equal(
    (await f.record({ ...f.body, time: '20:00', status: 'skipped' }, f.alice, '3')).status,
    201,
  );
  f.setNow('2026-09-17T03:00:00.000Z');
  assert.equal((await f.record({ ...f.body, time: '20:00' }, f.alice, '3')).status, 409);
  assert.equal((await f.request(`${f.path}/today`, { account: f.alice })).body.date, '2026-09-17');
  assert.equal((await f.record({ ...f.body, date: '2026-09-17' }, f.alice, '3')).status, 201);
  assert.equal((await f.request(`${f.path}/history`, { account: f.alice })).body.items.length, 3);
});
test('dose permissions are enforced by API, immutable SQL grants, RLS and authenticated author', async (t) => {
  const f = await setup(t);
  await f.record();
  assert.equal((await f.request(`${f.path}/today`)).status, 401);
  for (const suffix of ['/today', '/history'])
    assert.equal((await f.request(f.path + suffix, { account: f.bob })).status, 404);
  assert.equal((await f.record(f.body, f.bob)).status, 404);
  assert.equal((await f.pool.query('SELECT * FROM dose_logs')).rowCount, 0);
  assert.equal(
    await transaction(
      f.pool,
      f.bob.user.id,
      async (c) => (await c.query('SELECT * FROM dose_logs')).rowCount,
    ),
    0,
  );
  for (const statement of [
    'UPDATE dose_logs SET content_ciphertext=content_ciphertext',
    'DELETE FROM dose_logs',
  ])
    await assert.rejects(
      transaction(f.pool, f.alice.user.id, (c) => c.query(statement)),
      { code: '42501' },
    );
  await f.manager.query(
    'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3)',
    [f.family.id, f.bob.user.id, 'reader'],
  );
  assert.equal((await f.request(`${f.path}/history`, { account: f.bob })).status, 200);
  assert.equal((await f.record({ ...f.body, time: '20:00' }, f.bob)).status, 403);
  const sql =
    'INSERT INTO dose_logs(id,family_id,routine_id,member_id,scheduled_date,occurrence_key,recorded_by,recorded_at,content_ciphertext) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)';
  const values = [
    randomUUID(),
    f.family.id,
    f.routine.id,
    f.member.id,
    '2026-09-16',
    'a'.repeat(64),
    f.bob.user.id,
    '2026-09-16T15:00:00Z',
    'ficticio',
  ];
  await assert.rejects(
    transaction(f.pool, f.bob.user.id, (c) => c.query(sql, values)),
    { code: '42501' },
  );
  await assert.rejects(
    transaction(f.pool, f.alice.user.id, (c) => c.query(sql, values)),
    { code: '42501' },
  );
  await f.manager.query(
    "UPDATE family_memberships SET role='caregiver' WHERE family_id=$1 AND user_id=$2",
    [f.family.id, f.bob.user.id],
  );
  assert.equal(
    (await f.record({ ...f.body, time: '20:00', status: 'skipped' }, f.bob)).status,
    201,
  );
  assert.equal(
    (await f.manager.query('SELECT recorded_by FROM dose_logs ORDER BY recorded_by')).rows.some(
      (r) => r.recorded_by === f.bob.user.id,
    ),
    true,
  );
  await f.manager.query(
    'UPDATE family_memberships SET active=false WHERE family_id=$1 AND user_id=$2',
    [f.family.id, f.bob.user.id],
  );
  assert.equal((await f.request(`${f.path}/history`, { account: f.bob })).status, 404);
});
test('dose input and history filters reject forged contexts, invalid dates and malformed pagination', async (t) => {
  const f = await setup(t);
  for (const patch of [
    { memberId: f.member.id },
    { familyId: f.family.id },
    { recordedAt: '2026-09-16T00:00:00Z' },
    { recordedBy: f.alice.user.id },
    { quantity: 'fake' },
    { status: 'pending' },
    { time: '24:00' },
    { date: '2026-02-30' },
    { note: 'a'.repeat(501) },
  ])
    assert.equal((await f.record({ ...f.body, ...patch })).status, 422);
  assert.equal((await f.record(f.body, f.alice, '1', { 'X-CSRF-Token': 'fake' })).status, 403);
  assert.equal(
    (await f.record(f.body, f.alice, '1', { Origin: 'http://127.0.0.1:1' })).status,
    403,
  );
  assert.equal((await f.record(f.body, f.alice, '')).status, 428);
  assert.equal((await f.record({ ...f.body, date: '2026-09-15' })).status, 409);
  for (const query of [
    'from=2026-02-30',
    'from=2026-01-01&to=2026-09-16',
    'from=2026-09-17&to=2026-09-16',
    'cursor=bad',
    'cursor[]=bad',
    'role=owner',
  ])
    assert.equal((await f.request(`${f.path}/history?${query}`, { account: f.alice })).status, 422);
  assert.equal((await f.request(`${f.path}/today?page=0`, { account: f.alice })).status, 422);
  const foreign = await f.create(
    `/families/${f.other.id}/members`,
    { name: 'Pessoa fictícia externa' },
    f.bob,
  );
  assert.equal(
    (await f.request(`${f.path}/history?memberId=${foreign.id}`, { account: f.alice })).status,
    404,
  );
});
test('today and history pagination are stable with identical timestamps and member filters', async (t) => {
  const f = await setup(t);
  const times = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
  const a = await f.create(`/families/${f.family.id}/routines`, { ...f.input, times });
  const b = await f.create(`/families/${f.family.id}/routines`, { ...f.input, times });
  await f.create(`/families/${f.family.id}/routines`, f.input);
  for (let i = 0; i < 28; i++)
    assert.equal(
      (await f.record({ ...f.body, routineId: i < 24 ? a.id : b.id, time: times[i % 24] })).status,
      201,
    );
  const today = await f.request(`${f.path}/today`, { account: f.alice });
  assert.equal(today.body.items.length, 50);
  assert.equal(today.body.pages, 2);
  assert.equal(
    (await f.request(`${f.path}/today?page=2`, { account: f.alice })).body.items.length,
    2,
  );
  const history = (
    await f.request(`${f.path}/history?memberId=${f.member.id}`, { account: f.alice })
  ).body;
  assert.equal(history.items.length, 25);
  assert.ok(history.nextCursor);
  const next = (
    await f.request(`${f.path}/history?memberId=${f.member.id}&cursor=${history.nextCursor}`, {
      account: f.alice,
    })
  ).body;
  assert.equal(next.items.length, 3);
  assert.equal(next.nextCursor, null);
  assert.equal(new Set([...history.items, ...next.items].map((i) => i.id)).size, 28);
});
