/** Limites locais por origem e login: janela fixa, chaves resumidas e memória limitada. */
import { createHash } from 'node:crypto';
import { HttpError } from '../errors.js';
export function createAttemptLimiter({
  windowMs = 15 * 60 * 1000,
  addressLimit = 30,
  loginLimit = 10,
} = {}) {
  const entries = new Map();
  function consume(key, limit, now) {
    let entry = entries.get(key);
    if (!entry || entry.until <= now) {
      if (!entry && entries.size >= 5000)
        throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde.');
      entry = { count: 0, until: now + windowMs };
      entries.set(key, entry);
    }
    if (++entry.count > limit)
      throw new HttpError(429, 'Muitas tentativas. Tente novamente mais tarde.');
  }
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.until <= now) entries.delete(key);
    const login =
      typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
    res.set('Retry-After', String(Math.ceil(windowMs / 1000)));
    consume(`address:${req.socket.remoteAddress}`, addressLimit, now);
    if (login)
      consume(`login:${createHash('sha256').update(login).digest('hex')}`, loginLimit, now);
    res.removeHeader('Retry-After');
    next();
  };
}
