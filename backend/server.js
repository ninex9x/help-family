/** Ponto de entrada local. Interface, API e WebSocket compartilham a mesma porta. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { createServer as createHttpServer } from 'node:http';

process.umask(0o077);
const root = fileURLToPath(new URL('../', import.meta.url));
const { app, db } = createApp(process.env.HELP_FAMILY_DATA_DIR || resolve(root, 'data'));
const server = createHttpServer(app);
const { createServer } = await import('vite');
const vite = await createServer({
  configFile: resolve(root, 'vite.config.js'),
  server: { middlewareMode: true, ws: { server } },
  appType: 'spa',
});
app.use(vite.middlewares);
const port = Number(process.env.HELP_FAMILY_PORT || 3001);
server.listen(port, '127.0.0.1', () => console.log(`help-family: http://127.0.0.1:${port}`));
server.on('error', async (error) => {
  console.error(error.message);
  await vite.close();
  db.close();
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    server.close();
    await vite.close();
    db.close();
    process.exit(0);
  });
