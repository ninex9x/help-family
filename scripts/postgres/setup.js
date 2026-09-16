/** Prepara um cluster privado em loopback, sem instalar serviço global ou alterar o SQLite. */
import { mkdir, readFile, writeFile, appendFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import {
  directory,
  connection,
  identifier,
  exists,
  postgresBin,
  runPostgres as run,
} from './local.js';
import { migrate } from '../../backend/database/postgres/migrate.js';
import { ensureClinicalKey } from './clinical-key.js';
process.umask(0o077);
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const bin = await postgresBin();
const cluster = `${directory}/cluster`;
const credentialPath = `${directory}/credentials.json`;
if (!(await exists(credentialPath))) {
  if (await exists(`${cluster}/PG_VERSION`))
    throw new Error(
      'Cluster existente sem credenciais. Restaure o arquivo privado; nenhuma senha foi redefinida.',
    );
  const settings = Object.fromEntries(
    ['admin', 'migration', 'app'].map((role) => [
      role,
      { user: `help_family_${role}`, password: randomBytes(32).toString('base64url') },
    ]),
  );
  await writeFile(credentialPath, JSON.stringify(settings, null, 2), { mode: 0o600, flag: 'wx' });
}
const settings = JSON.parse(await readFile(credentialPath, 'utf8'));
if (!(await exists(`${cluster}/PG_VERSION`))) {
  // initdb lê o segredo do arquivo privado; não o colocamos em argumentos do processo.
  const passwordFile = `${directory}/init-password`;
  await writeFile(passwordFile, settings.admin.password, { mode: 0o600 });
  await run(`${bin}/initdb`, [
    '-D',
    cluster,
    '-U',
    settings.admin.user,
    '--pwfile',
    passwordFile,
    '--auth-host=scram-sha-256',
    '--auth-local=scram-sha-256',
    '--encoding=UTF8',
    '--locale=C.UTF-8',
  ]);
  await writeFile(passwordFile, '', { mode: 0o600 });
  await appendFile(
    `${cluster}/postgresql.conf`,
    "\nlisten_addresses = '127.0.0.1'\nport = 55432\nunix_socket_directories = ''\n",
  );
}
const running = await run(`${bin}/pg_ctl`, ['-D', cluster, 'status']).then(
  () => true,
  () => false,
);
if (!running)
  await run(`${bin}/pg_ctl`, ['-D', cluster, '-l', `${directory}/postgres.log`, '-w', 'start']);
const admin = new Client(connection(settings, 'admin', 'postgres'));
await admin.connect();
try {
  for (const role of ['migration', 'app']) {
    const account = settings[role];
    if (!(await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [account.user])).rowCount) {
      // Senhas aleatórias são escapadas como literal SQL; nunca interpolar entrada HTTP aqui.
      const password = account.password.replaceAll("'", "''");
      await admin.query(
        `CREATE ROLE ${identifier(account.user)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`,
      );
    }
  }
  if (
    !(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', ['help_family_accounts']))
      .rowCount
  ) {
    await admin.query(
      `CREATE DATABASE help_family_accounts OWNER ${identifier(settings.migration.user)}`,
    );
  }
} finally {
  await admin.end();
}
await migrate(connection(settings, 'migration'), settings.app.user);
const migration = new Client(connection(settings, 'migration'));
await migration.connect();
try {
  await ensureClinicalKey(migration, `${directory}/clinical.key`);
} finally {
  await migration.end();
}
console.log(
  'PostgreSQL pronto em 127.0.0.1:55432. Migrações aplicadas; credenciais em data/postgres/ (fora do Git).',
);
