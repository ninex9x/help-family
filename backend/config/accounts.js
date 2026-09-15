/** Configuração da etapa multiusuário. Nenhuma conexão de banco ou HTTP externa é aceita. */
import { readFile } from 'node:fs/promises';
export async function loadAccountsConfig() {
  const settings = JSON.parse(
    await readFile(new URL('../../data/postgres/credentials.json', import.meta.url), 'utf8'),
  );
  const port = Number(process.env.HELP_FAMILY_ACCOUNTS_PORT || 3002);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Porta local inválida.');
  return {
    port,
    database: { host: '127.0.0.1', port: 55432, database: 'help_family_accounts', ...settings.app },
  };
}
