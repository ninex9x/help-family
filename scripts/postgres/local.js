/** Ferramentas locais: credenciais nunca saem de data/postgres/ nem são impressas. */
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
export const directory = fileURLToPath(new URL('../../data/postgres/', import.meta.url));
const execute = promisify(execFile);
export const exists = async (path) =>
  access(path).then(
    () => true,
    () => false,
  );
export const runPostgres = (file, args) =>
  execute(file, args, {
    env: {
      ...process.env,
      LD_LIBRARY_PATH: `${directory}/runtime/usr/lib/x86_64-linux-gnu${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ''}`,
    },
  });
export async function postgresBin() {
  const candidates = [
    process.env.HELP_FAMILY_PG_BIN,
    `${directory}/runtime/usr/lib/postgresql/16/bin`,
    '/usr/lib/postgresql/16/bin',
  ].filter(Boolean);
  for (const candidate of candidates) if (await exists(`${candidate}/initdb`)) return candidate;
  throw new Error(
    'PostgreSQL não encontrado. Consulte docs/ACCOUNTS.md ou defina HELP_FAMILY_PG_BIN.',
  );
}
export async function readLocalSettings() {
  return JSON.parse(await readFile(`${directory}/credentials.json`, 'utf8'));
}
export function connection(settings, role = 'app', database = 'help_family_accounts') {
  return {
    host: '127.0.0.1',
    port: 55432,
    database,
    user: settings[role].user,
    password: settings[role].password,
    connectionTimeoutMillis: 5000,
  };
}
/** Apenas nomes gerados pelas ferramentas locais podem entrar em DDL. */
export function identifier(value) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error('Identificador PostgreSQL inválido.');
  return `"${value}"`;
}
