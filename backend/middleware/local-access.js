/** Restringe a API de contas ao loopback e à origem exata, inclusive entre portas locais. */
import { HttpError } from '../shared/errors.js';
export function localAccess(req, res, next) {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote))
    throw new HttpError(403, 'Acesso somente em localhost.');
  let url;
  try {
    url = new URL(`http://${req.headers.host}`);
  } catch {
    throw new HttpError(403, 'Host não permitido.');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new HttpError(403, 'Host não permitido.');
  if (
    req.get('sec-fetch-site') === 'cross-site' ||
    (req.get('origin') && req.get('origin') !== url.origin)
  )
    throw new HttpError(403, 'Origem não permitida.');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (req.get('origin') !== url.origin)
      throw new HttpError(403, 'Origem obrigatória e deve corresponder à API local.');
    const htmlForm = !req.path.startsWith('/api/') && req.is('application/x-www-form-urlencoded');
    const memberForm =
      req.method === 'POST' &&
      req.is('multipart/form-data') &&
      (/^\/families\/[^/]+\/members(?:\/[^/]+)?$/.test(req.path) ||
        /^\/api\/families\/[^/]+\/members\/[^/]+\/photo$/.test(req.path));
    if (!req.is('application/json') && !htmlForm && !memberForm)
      throw new HttpError(415, 'Tipo de conteúdo não permitido.');
  }
  res.set({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  next();
}
