import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { get } from 'node:http';
import { fixture } from './fixture.js';
import { transaction, openPool } from '../../backend/database/postgres/pool.js';
import { connection } from '../../scripts/postgres/local.js';
import { migrate } from '../../backend/database/postgres/migrate.js';

const password = 'Frase ficticia para testes 2026!';

test('registration creates a private family and stores only password/session hashes', async (t) => {
  const f = await fixture(t);
  const account = await f.register();
  const families = await f.request('/families', { account });
  assert.equal(families.status, 200);
  assert.equal(families.body.items.length, 1);
  assert.equal(families.body.items[0].role, 'owner');
  const user = (await f.manager.query('SELECT * FROM users')).rows[0];
  assert.match(user.password_hash, /^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
  assert.notEqual(user.password_hash, password);
  const storedSession = (await f.manager.query('SELECT token_hash FROM sessions')).rows[0];
  assert.equal(storedSession.token_hash.length, 64);
  assert.ok(!account.cookie.includes(storedSession.token_hash));
  assert.deepEqual(Object.keys(account.user).sort(), ['email', 'id', 'name']);
  const session = await f.request('/auth/session', { account });
  assert.equal(session.body.authenticated, true);
  assert.equal(session.body.user.id, account.user.id);
  assert.equal(JSON.stringify(session.body).includes('password_hash'), false);
  assert.equal((await f.request('/state', { account })).status, 404);
});

test('unknown accounts and wrong passwords return the same login error', async (t) => {
  const f = await fixture(t);
  await f.register();
  const wrong = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.invalid', password: 'wrong-password' },
  });
  const unknown = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'unknown@example.invalid', password: 'wrong-password' },
  });
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
  assert.equal(unknown.status, 401);
  assert.equal(unknown.headers.get('set-cookie'), null);
});

test('login rotates the cookie, logout revokes it, and expiration is enforced', async (t) => {
  const f = await fixture(t);
  const before = await f.register();
  const login = await f.request('/auth/login', {
    method: 'POST',
    account: before,
    body: { email: ' ALICE@example.invalid ', password },
  });
  assert.equal(login.status, 200);
  const header = login.headers.get('set-cookie');
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/);
  assert.match(header, /Path=\/;/);
  const current = { ...login.body, cookie: header.split(';')[0] };
  assert.notEqual(current.cookie, before.cookie);
  assert.equal((await f.request('/families', { account: before })).status, 401);
  assert.equal(
    (await f.request('/auth/logout', { method: 'POST', account: current, body: {} })).status,
    204,
  );
  assert.equal((await f.request('/families', { account: current })).status, 401);
  const second = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.invalid', password },
  });
  const expired = { ...second.body, cookie: second.headers.get('set-cookie').split(';')[0] };
  await f.manager.query("UPDATE sessions SET expires_at=now()-interval '1 second'");
  assert.equal((await f.request('/families', { account: expired })).status, 401);
  const third = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'alice@example.invalid', password },
  });
  const idle = { ...third.body, cookie: third.headers.get('set-cookie').split(';')[0] };
  await f.manager.query("UPDATE sessions SET last_seen_at=now()-interval '31 minutes'");
  assert.equal((await f.request('/families', { account: idle })).status, 401);
});

test('two accounts cannot list, read or edit one another’s families, even with known IDs', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob');
  const a = (await f.request('/families', { account: alice })).body.items;
  const b = (await f.request('/families', { account: bob })).body.items;
  assert.equal(a.length, 1);
  assert.equal(b.length, 1);
  assert.notEqual(a[0].id, b[0].id);
  assert.equal((await f.request(`/families/${a[0].id}`, { account: bob })).status, 404);
  assert.equal(
    (
      await f.request(`/families/${a[0].id}`, {
        method: 'PATCH',
        account: bob,
        body: { name: 'Invasão' },
        headers: { 'If-Match': '1' },
      })
    ).status,
    404,
  );
  assert.equal((await f.request('/families')).status, 401);
  const manipulated = await f.request('/families', {
    method: 'POST',
    account: bob,
    body: { name: 'Outra', userId: alice.user.id, role: 'owner' },
  });
  assert.equal(manipulated.status, 422);
  assert.equal(
    (
      await f.request('/families', {
        method: 'POST',
        account: alice,
        body: { name: 'Segunda família' },
      })
    ).status,
    201,
  );
  assert.equal((await f.request('/families', { account: alice })).body.items.length, 2);
  assert.equal((await f.request('/families', { account: bob })).body.items.length, 1);
});

test('CSRF, exact origin, JSON content type, DNS rebinding and body limits are enforced', async (t) => {
  const f = await fixture(t);
  const account = await f.register();
  const change = { method: 'POST', account, body: { name: 'Outra' } };
  for (const headers of [
    { 'X-CSRF-Token': '' },
    { 'X-CSRF-Token': 'wrong' },
    { Origin: 'http://127.0.0.1:3001' },
    { Origin: '' },
  ]) {
    assert.equal((await f.request('/families', { ...change, headers })).status, 403);
  }
  assert.equal(
    (await f.request('/families', { ...change, headers: { 'Content-Type': 'text/plain' } })).status,
    415,
  );
  // fetch pode substituir Host; HTTP direto garante que o cabeçalho adversário foi enviado.
  const badHostStatus = await new Promise((resolve, reject) => {
    get(`${f.base}/api/families`, { headers: { Host: 'evil.example' } }, (response) => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal(
    (await f.request('/families', { account, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status,
    403,
  );
  assert.equal(
    (await f.request('/auth/register', { method: 'POST', body: { name: 'x'.repeat(17000) } }))
      .status,
    413,
  );
  const malformed = await fetch(`${f.base}/api/auth/login`, {
    method: 'POST',
    headers: { Origin: f.base, 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(malformed.status, 400);
});

test('RLS denies a missing context and remains isolated when connections are reused', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob');
  assert.equal((await f.pool.query('SELECT * FROM families')).rowCount, 0);
  assert.equal((await f.pool.query('SELECT * FROM family_memberships')).rowCount, 0);
  const actors = [alice, bob, alice, bob, alice, bob, alice, bob];
  await Promise.all(
    actors.map((actor) =>
      transaction(f.pool, actor.user.id, async (client) => {
        const rows = (
          await client.query(
            'SELECT m.user_id,f.name FROM families f JOIN family_memberships m ON m.family_id=f.id',
          )
        ).rows;
        assert.equal(rows.length, 1);
        assert.equal(rows[0].user_id, actor.user.id);
      }),
    ),
  );
  await assert.rejects(
    transaction(f.pool, alice.user.id, async (client) => {
      assert.equal((await client.query('SELECT * FROM families')).rowCount, 1);
      throw new Error('rollback fictício');
    }),
    /rollback fictício/,
  );
  assert.equal((await f.pool.query('SELECT * FROM families')).rowCount, 0);
  await assert.rejects(
    f.pool.query('SELECT create_owned_family($1)', ['Sem contexto']),
    (error) => error.code === '42501',
  );
});

test('reader membership permits access but cannot rename; revocation applies immediately', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob');
  const family = (await f.request('/families', { account: alice })).body.items[0];
  // Somente o fixture de migração insere vínculos; convites HTTP serão uma etapa posterior.
  await f.manager.query(
    "INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,'reader')",
    [family.id, bob.user.id],
  );
  assert.equal((await f.request('/families', { account: bob })).body.items.length, 2);
  assert.equal(
    (await f.request(`/families/${family.id}`, { account: bob })).body.item.role,
    'reader',
  );
  assert.equal(
    (
      await f.request(`/families/${family.id}`, {
        method: 'PATCH',
        account: bob,
        body: { name: 'Bloqueado' },
        headers: { 'If-Match': '1' },
      })
    ).status,
    403,
  );
  await transaction(f.pool, bob.user.id, async (client) => {
    const update = await client.query("UPDATE families SET name='Não permitido' WHERE id=$1", [
      family.id,
    ]);
    assert.equal(update.rowCount, 0);
    await assert.rejects(
      client.query(
        "INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,'owner')",
        [family.id, bob.user.id],
      ),
      (error) => error.code === '42501',
    );
  });
  await f.manager.query(
    'UPDATE family_memberships SET active=false WHERE family_id=$1 AND user_id=$2',
    [family.id, bob.user.id],
  );
  assert.equal((await f.request(`/families/${family.id}`, { account: bob })).status, 404);
  await transaction(f.pool, bob.user.id, async (client) =>
    assert.equal(
      (await client.query('SELECT * FROM families WHERE id=$1', [family.id])).rowCount,
      0,
    ),
  );
});

test('versions are independent per family and stale edits cannot overwrite a rename', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const bob = await f.register('bob');
  const a = (await f.request('/families', { account: alice })).body.items[0];
  const b = (await f.request('/families', { account: bob })).body.items[0];
  const edit = (account, id, name, version) =>
    f.request(`/families/${id}`, {
      method: 'PATCH',
      account,
      body: { name },
      headers: { 'If-Match': version },
    });
  assert.equal((await edit(alice, a.id, 'Nome novo', '1')).body.item.version, 2);
  assert.equal((await edit(alice, a.id, 'Desatualizado', '1')).status, 409);
  assert.equal((await edit(bob, b.id, 'Independente', '1')).status, 200);
  assert.equal((await edit(alice, a.id, 'Sem versão', '')).status, 428);
  assert.equal(
    (await f.request(`/families/${a.id}`, { account: alice })).body.item.name,
    'Nome novo',
  );
});

test('registration rollback, strict fields and duplicate accounts preserve integrity', async (t) => {
  const f = await fixture(t);
  const alice = await f.register();
  const before = (await f.manager.query('SELECT count(*) FROM families')).rows[0].count;
  const duplicate = await f.request('/auth/register', {
    method: 'POST',
    body: { name: 'Duplicada', email: 'ALICE@example.invalid', password, familyName: 'Não criar' },
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await f.manager.query('SELECT count(*) FROM families')).rows[0].count, before);
  assert.equal(
    (
      await f.request('/auth/register', {
        method: 'POST',
        body: { name: 'X', email: 'b@example.invalid', password: 'short', familyName: 'X' },
      })
    ).status,
    422,
  );
  assert.equal(
    (
      await f.request('/auth/register', {
        method: 'POST',
        body: {
          name: 'X',
          email: 'b@example.invalid',
          password,
          familyName: 'X',
          id: alice.user.id,
        },
      })
    ).status,
    422,
  );
  await assert.rejects(
    f.manager.query(
      "INSERT INTO family_memberships(family_id,user_id,role) VALUES ($1,$2,'owner')",
      [randomUUID(), alice.user.id],
    ),
    (error) => error.code === '23503',
  );
});

test('authentication attempts are limited before unbounded password work', async (t) => {
  const f = await fixture(t, { attempts: { loginLimit: 2, addressLimit: 10 } });
  for (let i = 0; i < 2; i++)
    assert.equal(
      (
        await f.request('/auth/login', {
          method: 'POST',
          body: { email: 'nobody@example.invalid', password },
        })
      ).status,
      401,
    );
  const result = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'nobody@example.invalid', password },
  });
  assert.equal(result.status, 429);
  assert.ok(Number(result.headers.get('retry-after')) > 0);
});

test('runtime refuses migration credentials and migrations can run twice', async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    openPool(connection(f.settings, 'migration', f.database)),
    /sem privilégios/,
  );
  await migrate(connection(f.settings, 'migration', f.database), f.settings.app.user);
  assert.equal(
    (await f.manager.query('SELECT count(*) FROM schema_migrations')).rows[0].count,
    '4',
  );
});
