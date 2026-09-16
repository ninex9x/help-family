/** Integração clínica em bancos descartáveis: autorização real, RLS, cifras e concorrência. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { fixture } from './fixture.js';
import { transaction } from '../../backend/database/postgres/pool.js';
import { ensureClinicalKey } from '../../scripts/postgres/clinical-key.js';
const profile = {
  name: 'Helena Fictícia',
  relationship: 'Avó',
  medicalNotes: 'Observação fictícia de teste.',
  color: '#6586a3',
};
async function setup(t) {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob-members');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  const other = (await f.request('/families', { account: bob })).body.items[0];
  const path = `/families/${family.id}/members`;
  const create = await f.request(path, { method: 'POST', account: alice, body: profile });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  return { ...f, alice, bob, family, other, path, member: create.body.item };
}
test('members are scoped to families, encrypted, and inaccessible without membership or context', async (t) => {
  const f = await setup(t);
  const { member, path, alice, bob } = f;
  assert.equal((await f.request(path)).status, 401);
  assert.equal((await f.request(path, { account: alice })).body.items[0].name, profile.name);
  for (const suffix of ['', `/${member.id}`, `/${member.id}/photo`]) {
    assert.equal((await f.request(path + suffix, { account: bob })).status, 404);
  }
  assert.equal(
    (await f.request(`/families/${f.other.id}/members/${member.id}`, { account: bob })).status,
    404,
  );
  assert.equal(
    (
      await f.request(`${path}/${member.id}`, {
        method: 'PATCH',
        account: bob,
        headers: { 'If-Match': '1' },
        body: { name: 'Intruso' },
      })
    ).status,
    404,
  );
  assert.equal((await f.pool.query('SELECT * FROM members')).rowCount, 0);
  assert.equal(
    await transaction(
      f.pool,
      bob.user.id,
      async (c) => (await c.query('SELECT * FROM members')).rowCount,
    ),
    0,
  );
  const raw = (await f.manager.query('SELECT * FROM members WHERE id=$1', [member.id])).rows[0];
  assert.equal(JSON.stringify(raw).includes(profile.name), false);
  assert.equal(JSON.stringify(raw).includes(profile.medicalNotes), false);
  // Even a legitimate member of both families cannot move a profile through SQL.
  await assert.rejects(
    transaction(f.pool, alice.user.id, (c) =>
      c.query('UPDATE members SET family_id=$1 WHERE id=$2', [f.other.id, member.id]),
    ),
    { code: '42501' },
  );
  await f.manager.query('INSERT INTO members(id,family_id,profile_ciphertext) VALUES ($1,$2,$3)', [
    randomUUID(),
    f.family.id,
    raw.profile_ciphertext,
  ]);
  const tampered = await f.request(path, { account: alice });
  assert.equal(tampered.status, 500);
  assert.equal(JSON.stringify(tampered.body).includes('cipher'), false);
});
test('caregivers edit, readers only read, and revocation takes effect immediately in API and RLS', async (t) => {
  const f = await setup(t);
  const role = (value) =>
    f.manager.query(
      'INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT (family_id,user_id) DO UPDATE SET role=EXCLUDED.role',
      [f.family.id, f.bob.user.id, value],
    );
  await role('reader');
  assert.equal((await f.request(f.path, { account: f.bob })).status, 200);
  for (const [method, path] of [
    ['POST', f.path],
    ['PATCH', `${f.path}/${f.member.id}`],
  ]) {
    assert.equal(
      (
        await f.request(path, {
          method,
          account: f.bob,
          headers: { 'If-Match': '1' },
          body: profile,
        })
      ).status,
      403,
    );
  }
  assert.equal(
    await transaction(
      f.pool,
      f.bob.user.id,
      async (c) =>
        (await c.query('UPDATE members SET version=version+1 WHERE id=$1', [f.member.id])).rowCount,
    ),
    0,
  );
  await assert.rejects(
    transaction(f.pool, f.bob.user.id, (c) =>
      c.query('INSERT INTO members(id,family_id,profile_ciphertext) VALUES ($1,$2,$3)', [
        randomUUID(),
        f.family.id,
        'fake',
      ]),
    ),
    { code: '42501' },
  );
  await role('caregiver');
  const edited = await f.request(`${f.path}/${f.member.id}`, {
    method: 'PATCH',
    account: f.bob,
    headers: { 'If-Match': '1' },
    body: { relationship: 'Pessoa acompanhada' },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.item.version, 2);
  assert.equal(edited.body.item.name, profile.name);
  assert.equal(
    (await f.request(f.path, { method: 'POST', account: f.bob, body: { name: 'Outro fictício' } }))
      .status,
    201,
  );
  await f.manager.query(
    'UPDATE family_memberships SET active=false WHERE family_id=$1 AND user_id=$2',
    [f.family.id, f.bob.user.id],
  );
  assert.equal((await f.request(f.path, { account: f.bob })).status, 404);
  assert.equal(
    await transaction(
      f.pool,
      f.bob.user.id,
      async (c) => (await c.query('SELECT * FROM members')).rowCount,
    ),
    0,
  );
});
test('strict backend validation, CSRF and per-profile versions prevent unsafe or stale writes', async (t) => {
  const f = await setup(t);
  const edit = (body, headers = {}) =>
    f.request(`${f.path}/${f.member.id}`, {
      method: 'PATCH',
      account: f.alice,
      body,
      headers: { 'If-Match': '1', ...headers },
    });
  for (const body of [
    { name: '' },
    { role: 'owner' },
    { familyId: f.other.id },
    { photo: 'data:fake' },
    { name: ['injected'] },
    { color: 'red;display:none' },
    { medicalNotes: 'a'.repeat(4001) },
    {},
  ])
    assert.equal((await edit(body)).status, 422);
  assert.equal((await edit({ name: 'Fictício' }, { 'X-CSRF-Token': 'invalid' })).status, 403);
  assert.equal((await edit({ name: 'Fictício' }, { Origin: 'http://127.0.0.1:1' })).status, 403);
  assert.equal((await edit({ name: 'Fictício' }, { 'If-Match': '' })).status, 428);
  const results = await Promise.all([edit({ name: 'Edição A' }), edit({ name: 'Edição B' })]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const second = (
    await f.request(f.path, {
      method: 'POST',
      account: f.alice,
      body: { name: 'Segundo fictício' },
    })
  ).body.item;
  assert.equal(
    (
      await f.request(`${f.path}/${second.id}`, {
        method: 'PATCH',
        account: f.alice,
        headers: { 'If-Match': '1' },
        body: { name: 'Segundo editado' },
      })
    ).status,
    200,
  );
  const uppercase = `/families/${f.family.id.toUpperCase()}/members/${second.id.toUpperCase()}`;
  assert.equal(
    (
      await f.request(uppercase, {
        method: 'PATCH',
        account: f.alice,
        headers: { 'If-Match': '2' },
        body: { name: 'UUID normalizado' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request(`${f.path}/${second.id}`, { account: f.alice })).body.item.name,
    'UUID normalizado',
  );
});
test('photo bytes are validated, resized, encrypted and protected by the same membership and version', async (t) => {
  const f = await setup(t);
  const bytes = await sharp({
    create: { width: 32, height: 16, channels: 3, background: '#6586a3' },
  })
    .png()
    .toBuffer();
  async function upload(data, actor = f.alice, version = '1') {
    const body = new FormData();
    body.set('photo', new Blob([data], { type: 'image/png' }), 'ficticio.png');
    return fetch(`${f.base}/api${f.path}/${f.member.id}/photo`, {
      method: 'POST',
      headers: {
        Origin: f.base,
        Cookie: actor.cookie,
        'X-CSRF-Token': actor.csrfToken,
        'If-Match': version,
      },
      body,
    });
  }
  assert.equal((await upload(Buffer.from('<script>fake</script>'))).status, 422);
  assert.equal((await upload(bytes, f.bob)).status, 404);
  assert.equal((await upload(Buffer.alloc(12_000_001))).status, 413);
  const result = await upload(bytes);
  assert.equal(result.status, 200, await result.clone().text());
  assert.equal((await result.json()).item.hasPhoto, true);
  assert.equal((await upload(bytes)).status, 409);
  const raw = (
    await f.manager.query('SELECT photo_ciphertext FROM members WHERE id=$1', [f.member.id])
  ).rows[0].photo_ciphertext;
  assert.ok(raw && !raw.includes('data:image'));
  const photo = await fetch(`${f.base}/api${f.path}/${f.member.id}/photo`, {
    headers: { Cookie: f.alice.cookie },
  });
  assert.equal(photo.headers.get('cache-control'), 'no-store');
  const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 640);
  assert.equal(metadata.exif, undefined);
  const removed = await f.request(`${f.path}/${f.member.id}/photo`, {
    method: 'DELETE',
    account: f.alice,
    headers: { 'If-Match': '2' },
    body: {},
  });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.item.hasPhoto, false);
  assert.equal(
    (await f.request(`${f.path}/${f.member.id}/photo`, { account: f.alice })).status,
    404,
  );
});
test('clinical key setup preserves an existing key and refuses replacement when encrypted rows exist', async (t) => {
  const f = await fixture(t);
  const dir = await mkdtemp(join(tmpdir(), 'help-family-key-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'clinical.key');
  await ensureClinicalKey(f.manager, path);
  const original = await readFile(path);
  assert.equal(original.length, 32);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  await ensureClinicalKey(f.manager, path);
  assert.deepEqual(await readFile(path), original);
  const alice = await f.register();
  const family = (await f.request('/families', { account: alice })).body.items[0];
  await f.request(`/families/${family.id}/members`, {
    method: 'POST',
    account: alice,
    body: profile,
  });
  const missing = join(dir, 'missing.key');
  await assert.rejects(ensureClinicalKey(f.manager, missing), /Restaure clinical.key/);
  await assert.rejects(readFile(missing), { code: 'ENOENT' });
});
