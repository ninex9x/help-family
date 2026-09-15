import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../backend/app.js';
import { createDemoState } from '../backend/services/demo-state.js';
import { openDatabase } from '../backend/database/connection.js';
import { createVault } from '../backend/services/vault.js';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { localDate } from '../backend/web/components/ui.js';
import { decryptLegacy } from '../scripts/migrate-legacy.js';

async function fixture(t, seed = true) {
  const directory = mkdtempSync(join(tmpdir(), 'help-family-test-'));
  const context = createApp(directory);
  if (seed) context.service.importState(createDemoState());
  const server = context.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    context.db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  async function request(path, method = 'GET', body, revision = 1, headers = {}) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', 'If-Match': String(revision), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  return { ...context, directory, base, request };
}

test('resource edits persist in SQL, reject stale writes, and survive reopening', async (t) => {
  const f = await fixture(t);
  const added = await f.request('/members', 'POST', {
    name: 'Teste privado',
    relationship: 'Irmão',
    initials: 'TP',
    color: '#016b54',
  });
  assert.equal(added.status, 201);
  assert.equal(added.body.revision, 2);
  const id = added.body.item.id;
  const stale = await f.request(`/members/${id}`, 'PATCH', { name: 'Não deve salvar' }, 1);
  assert.equal(stale.status, 409);
  const edited = await f.request(`/members/${id}`, 'PATCH', { name: 'Nome atualizado' }, 2);
  assert.equal(edited.status, 200);
  const reopened = createApp(f.directory);
  assert.equal(
    reopened.repository.list('members').find((m) => m.id === id).name,
    'Nome atualizado',
  );
  reopened.db.close();
  const deleted = await f.request(`/members/${id}`, 'DELETE', {}, 3);
  assert.equal(deleted.status, 200);
});

test('invalid references and linked deletions roll back without bumping revision', async (t) => {
  const f = await fixture(t);
  const before = f.repository.snapshot();
  const result = await f.request('/routines', 'POST', {
    ...before.state.routines[0],
    memberId: 'missing',
  });
  assert.equal(result.status, 422);
  const deletion = await f.request('/members/joao', 'DELETE', {});
  assert.equal(deletion.status, 422);
  assert.deepEqual(f.repository.snapshot(), before);
});

test('dose recording updates a single occurrence and routines have separate time rows', async (t) => {
  const f = await fixture(t);
  const log = { ...f.repository.snapshot().state.logs[0], status: 'skipped' };
  const result = await f.request('/dose-logs', 'POST', log);
  assert.equal(result.status, 201);
  assert.equal(f.repository.snapshot().state.logs.length, 4);
  assert.equal(f.repository.snapshot().state.logs.find((l) => l.id === log.id).status, 'skipped');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM routine_times').get().count, 8);
});

test('sensitive columns and document bytes remain encrypted on disk', async (t) => {
  const f = await fixture(t);
  const document = {
    memberId: 'joao',
    title: 'Documento-confidencial-teste',
    category: 'exam',
    date: '2026-09-11',
    fileName: 'teste.txt',
    mimeType: 'text/plain',
    dataUrl: `data:text/plain;base64,${Buffer.from('conteudo-confidencial-teste').toString('base64')}`,
  };
  const result = await f.request('/documents', 'POST', document);
  assert.equal(result.status, 201);
  const raw = f.db
    .prepare('SELECT title,data_url FROM documents WHERE id=?')
    .get(result.body.item.id);
  assert.notEqual(raw.title, document.title);
  assert.notEqual(raw.data_url, document.dataUrl);
  const stored = (await f.request(`/documents/${result.body.item.id}`)).body.item;
  assert.equal(stored.dataUrl, document.dataUrl);
  f.db.pragma('wal_checkpoint(TRUNCATE)');
  const bytes = readFileSync(join(f.directory, 'help-family.sqlite'));
  assert.equal(bytes.includes(Buffer.from(document.title)), false);
  assert.equal(bytes.includes(Buffer.from('conteudo-confidencial-teste')), false);
});

test('API blocks foreign origins, DNS rebinding hosts, invalid JSON and missing revisions', async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.request('/state', 'GET', undefined, 1, { Origin: 'https://example.com' })).status,
    403,
  );
  // fetch normalizes Host; raw HTTP is needed to simulate DNS rebinding.
  const hostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${f.base}/api/state`,
      { headers: { Host: 'example.com' } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on('error', reject);
    request.end();
  });
  assert.equal(hostStatus, 403);
  assert.equal((await f.request('/members', 'POST', {}, 1, { 'If-Match': '' })).status, 428);
  const response = await fetch(`${f.base}/api/members`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{bad',
  });
  assert.equal(response.status, 400);
  assert.equal((await f.request('/missing')).status, 404);
});

test('import is atomic, preserves state, and refuses to replace an existing database', async (t) => {
  const f = await fixture(t, false);
  const state = createDemoState();
  const invalid = structuredClone(state);
  invalid.routines[0].memberId = 'missing';
  assert.throws(() => f.service.importState(invalid));
  assert.equal(f.repository.revision(), 0);
  f.service.importState(state);
  const actual = f.repository.snapshot().state;
  for (const name of ['members', 'drugs', 'presentations', 'logs', 'documents'])
    assert.deepEqual(actual[name], state[name]);
  assert.deepEqual(
    actual.routines,
    state.routines.map((r) => ({ ...r, active: r.active !== false })),
  );
  assert.throws(() => f.service.importState(state), /já contém/);
});

test('vault rejects tampering, wrong keys, swapped columns, and a missing key', async (t) => {
  const f = await fixture(t);
  const vault = createVault(randomBytes(32));
  const value = vault.seal('private', 'members:1:name');
  assert.throws(() => vault.open(value, 'members:2:name'));
  assert.throws(() => createVault(randomBytes(32)).open(value, 'members:1:name'));
  const bytes = Buffer.from(value, 'base64');
  bytes[30] ^= 1;
  assert.throws(() => vault.open(bytes.toString('base64'), 'members:1:name'));
  unlinkSync(join(f.directory, 'encryption.key'));
  assert.throws(() => openDatabase(f.directory), /Chave local ausente/);
});

test('legacy AES-GCM payload can be decrypted without modifying the old database', async () => {
  const key = randomBytes(32),
    iv = randomBytes(12),
    state = createDemoState();
  const cryptoKey = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('cura-familia-state-v1') },
    cryptoKey,
    new TextEncoder().encode(JSON.stringify(state)),
  );
  assert.deepEqual(
    decryptLegacy(
      {
        algorithm: 'AES-256-GCM',
        iv: iv.toString('base64'),
        ciphertext: Buffer.from(ciphertext).toString('base64'),
      },
      key,
    ),
    state,
  );
});

test('rejects impossible dates and duplicate times, and clears optional profile fields', async (t) => {
  const f = await fixture(t);
  const initial = f.repository.snapshot();
  const doc = { ...initial.state.documents[0], date: '2026-02-30' };
  assert.equal((await f.request('/documents', 'POST', doc)).status, 422);
  const routine = { ...initial.state.routines[0], times: ['08:00', '08:00'] };
  assert.equal((await f.request('/routines', 'POST', routine)).status, 422);
  assert.equal(f.repository.revision(), 1);
  assert.equal(
    (await f.request('/members/joao', 'PATCH', { medicalNotes: 'A remover' }, 1)).status,
    200,
  );
  assert.equal((await f.request('/members/joao', 'PATCH', { medicalNotes: null }, 2)).status, 200);
  assert.equal((await f.request('/members/joao')).body.item.medicalNotes, undefined);
});

test('server renders filtered HTML without sending document contents or a client state tree', async (t) => {
  const f = await fixture(t);
  const dataUrl = `data:text/plain;base64,${Buffer.from('conteudo-exclusivo-arquivo').toString('base64')}`;
  const added = await f.request('/documents', 'POST', {
    memberId: 'joao',
    title: 'Arquivo isolado',
    category: 'exam',
    date: '2026-09-15',
    fileName: 'arquivo.txt',
    mimeType: 'text/plain',
    dataUrl,
  });
  assert.equal(added.status, 201);
  // Uma listagem não deve sequer decifrar os bytes: conteúdo corrompido só afeta sua abertura.
  f.db
    .prepare('UPDATE documents SET data_url=? WHERE id=?')
    .run('conteudo-corrompido', added.body.item.id);
  const screen = await f.request('/views/documents?documentSearch=Arquivo%20isolado');
  assert.equal(screen.status, 200);
  assert.match(screen.body.html, /Arquivo isolado/);
  assert.equal(screen.body.state, undefined);
  assert.equal(screen.body.html.includes(dataUrl), false);
  assert.equal((await f.request(`/file-info/${added.body.item.id}`)).status, 200);
  assert.equal((await f.request('/views/unknown')).status, 404);
});

test('raw form inputs are validated and normalized by the backend even without browser validation', async (t) => {
  const f = await fixture(t);
  const initial = f.repository.snapshot().state;
  const member = await f.request('/actions/forms/member', 'POST', {
    name: '  Pessoa Servidor  ',
    relationship: 'Irmã',
    color: '#016b54',
    medicalNotes: '',
  });
  assert.equal(member.status, 200);
  const stored = f.service.list('members').find((m) => m.name === 'Pessoa Servidor');
  assert.equal(stored.initials, 'PS');
  const invalid = await f.request(
    '/actions/forms/member',
    'POST',
    { name: '', relationship: '', color: '#016b54' },
    2,
  );
  assert.equal(invalid.status, 422);
  assert.equal(
    (
      await f.request(
        '/actions/forms/member',
        'POST',
        { name: 'Outro', relationship: 'Irmã', color: '#016b54', initials: 'FORJADO' },
        2,
      )
    ).status,
    422,
  );
  const routine = initial.routines[0];
  const form = {
    memberId: routine.memberId,
    drugId: routine.drugId,
    presentationId: routine.presentationId,
    quantity: '1',
    times: '08:00, 08:00',
    instruction: '',
  };
  assert.equal((await f.request('/actions/forms/routine', 'POST', form, 2)).status, 422);
  form.times = '20:00, 08:00';
  assert.equal((await f.request('/actions/forms/routine', 'POST', form, 2)).status, 200);
  const created = f.service.list('routines').at(-1);
  assert.deepEqual(created.times, ['08:00', '20:00']);
  assert.equal(created.instruction, 'Conforme orientação médica');
});

test('dose commands derive person and time on the server and reject forged context or inactive routines', async (t) => {
  const f = await fixture(t);
  const routine = f.service.list('routines')[0];
  const command = { routineId: routine.id, scheduledTime: routine.times[0], status: 'taken' };
  assert.equal(
    (await f.request('/actions/doses', 'POST', { ...command, memberId: 'outra-pessoa' })).status,
    422,
  );
  assert.equal(
    (await f.request('/actions/doses', 'POST', { ...command, date: '2000-01-01' })).status,
    422,
  );
  assert.equal(
    (await f.request('/actions/doses', 'POST', { ...command, scheduledTime: '03:17' })).status,
    422,
  );
  const result = await f.request('/actions/doses', 'POST', command);
  assert.equal(result.status, 200);
  assert.equal(result.body.item.memberId, routine.memberId);
  assert.equal(result.body.item.date, localDate());
  assert.match(result.body.item.recordedAt, /^\d{2}:\d{2}$/);
  assert.equal(
    (await f.request(`/actions/routines/${routine.id}/toggle`, 'POST', {}, 2)).status,
    200,
  );
  assert.equal((await f.request('/actions/doses', 'POST', command, 3)).status, 422);
  assert.equal(
    (await f.request(`/actions/routines/${routine.id}/toggle`, 'POST', {}, 2)).status,
    409,
  );
});

test('server validates actual upload bytes and sizes and processes photos', async (t) => {
  const f = await fixture(t);
  const document = {
    memberId: 'joao',
    title: 'Teste arquivo',
    category: 'exam',
    date: '2026-09-15',
    fileName: 'arquivo.pdf',
    mimeType: 'application/pdf',
    fileSize: 1,
    dataUrl: `data:application/pdf;base64,${Buffer.from('nao e PDF').toString('base64')}`,
  };
  assert.equal((await f.request('/documents', 'POST', document)).status, 422);
  const large = {
    ...document,
    mimeType: 'text/plain',
    fileName: 'arquivo.txt',
    dataUrl: `data:text/plain;base64,${Buffer.alloc(1_000_001, 65).toString('base64')}`,
  };
  assert.equal((await f.request('/documents', 'POST', large)).status, 422);
  const valid = {
    ...large,
    dataUrl: `data:text/plain;base64,${Buffer.from('arquivo seguro').toString('base64')}`,
  };
  const added = await f.request('/documents', 'POST', valid);
  assert.equal(added.status, 201);
  assert.equal(added.body.item.fileSize, Buffer.byteLength('arquivo seguro'));
  const response = await fetch(`${f.base}/api/files/${added.body.item.id}?download=1`);
  assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.equal(await response.text(), 'arquivo seguro');
  const image = await sharp({
    create: { width: 80, height: 120, channels: 3, background: '#016b54' },
  })
    .png()
    .toBuffer();
  const photo = await f.request(
    '/actions/forms/member?id=joao',
    'POST',
    {
      name: 'João',
      relationship: 'Pai',
      color: '#016b54',
      photoFile: {
        name: 'foto.png',
        type: 'image/png',
        dataUrl: `data:image/png;base64,${image.toString('base64')}`,
      },
    },
    2,
  );
  assert.equal(photo.status, 200);
  const encoded = f.service.get('members', 'joao').photo;
  const metadata = await sharp(Buffer.from(encoded.split(',')[1], 'base64')).metadata();
  assert.equal(metadata.width, 640);
  assert.equal(metadata.height, 640);
  assert.equal(metadata.format, 'jpeg');
  assert.equal(metadata.exif, undefined);
  assert.equal(
    (await f.request('/members/joao', 'PATCH', { photo: 'data:image/png;base64,SGVsbG8=' }, 3))
      .status,
    422,
  );
});
