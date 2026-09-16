/** Cada teste usa banco PostgreSQL descartável. Nunca abrir ou limpar o banco de uso local. */
import { randomUUID, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client } from 'pg';
import { connection, identifier, readLocalSettings } from '../../scripts/postgres/local.js';
import { migrate } from '../../backend/database/postgres/migrate.js';
import { createAccountsApp } from '../../backend/accounts-app.js';
export async function fixture(t, options) {
  const settings = await readLocalSettings();
  const database = `help_family_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client(connection(settings, 'admin', 'postgres'));
  await admin.connect();
  await admin.query(
    `CREATE DATABASE ${identifier(database)} OWNER ${identifier(settings.migration.user)}`,
  );
  let context, server, manager;
  t.after(async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    await context?.pool.end();
    await manager?.end();
    // O nome vem exclusivamente do UUID acima, nunca de variável de ambiente ou requisição.
    if (!database.startsWith('help_family_test_')) throw new Error('Banco não descartável.');
    await admin.query(`DROP DATABASE ${identifier(database)}`);
    await admin.end();
  });
  await migrate(connection(settings, 'migration', database), settings.app.user);
  context = await createAccountsApp(connection(settings, 'app', database), {
    clinicalKey: randomBytes(32),
    ...options,
  });
  manager = new Client(connection(settings, 'migration', database));
  await manager.connect();
  server = createServer(context.app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', body, account, headers } = {}) {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        Origin: base,
        'Content-Type': 'application/json',
        ...(account ? { Cookie: account.cookie, 'X-CSRF-Token': account.csrfToken } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: response.status === 204 ? null : await response.json(),
    };
  }
  async function register(label = 'alice') {
    const result = await request('/auth/register', {
      method: 'POST',
      body: {
        name: `Pessoa ${label}`,
        email: `${label}@example.invalid`,
        password: 'Frase ficticia para testes 2026!',
        familyName: `Família ${label}`,
      },
    });
    if (result.status !== 201)
      throw new Error(`Cadastro fictício falhou (${result.status}): ${result.body.error}`);
    return { ...result.body, cookie: result.headers.get('set-cookie').split(';')[0] };
  }
  return { ...context, manager, database, base, request, register, settings };
}
