/** Contas e famílias: API e páginas SSR na mesma origem local durante a transição clínica. */
import { createServer } from 'node:http';
import { loadAccountsConfig } from './config/accounts.js';
import { createAccountsApp } from './accounts-app.js';
process.umask(0o077);
try {
  const config = await loadAccountsConfig();
  const { app, pool } = await createAccountsApp(config.database);
  const server = createServer(app);
  server.listen(config.port, '127.0.0.1', () =>
    console.log(`API de contas: http://127.0.0.1:${config.port}`),
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
    await pool.end();
  };
  server.on('error', async () => {
    console.error('Não foi possível iniciar a API de contas local.');
    await close();
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, close);
} catch {
  console.error(
    'Não foi possível abrir a API de contas. Execute npm run db:setup e confira a configuração local.',
  );
  process.exitCode = 1;
}
