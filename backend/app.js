/** Compõe HTTP, armazenamento e serviços; aplica acesso local antes de qualquer rota. */
import express from 'express';
import { openDatabase } from './database/connection.js';
import { createRepository } from './repositories/family.js';
import { createFamilyService } from './services/family.js';
import { apiRoutes } from './routes/api.js';

export function createApp(directory) {
  const { db, vault } = openDatabase(directory);
  const repository = createRepository(db, vault);
  const service = createFamilyService(db, repository);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const remote = req.socket.remoteAddress;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote))
      return res.status(403).json({ error: 'Acesso somente em localhost.' });
    let url;
    try {
      url = new URL(`http://${req.headers.host}`);
    } catch {
      return res.sendStatus(403);
    }
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      return res.status(403).json({ error: 'Host não permitido.' });
    if (req.get('origin') && req.get('origin') !== url.origin)
      return res.status(403).json({ error: 'Origem não permitida.' });
    if (req.get('sec-fetch-site') === 'cross-site')
      return res.status(403).json({ error: 'Origem não permitida.' });
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use('/api', express.json({ limit: '17mb' }), apiRoutes(service));
  app.use('/api', (error, _req, res, _next) => {
    const status = error.status ?? (error.code?.startsWith('SQLITE_CONSTRAINT') ? 409 : 500);
    res.status(status).json({
      error:
        status === 500
          ? 'Não foi possível concluir a operação local.'
          : error.code?.startsWith('SQLITE_CONSTRAINT')
            ? 'Registro vinculado a outros dados ou duplicado.'
            : error.message,
    });
  });
  return { app, db, service, repository };
}
