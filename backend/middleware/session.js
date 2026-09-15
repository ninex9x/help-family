/** Cookies opacos e CSRF por sessão. O cookie não é acessível ao JavaScript da página. */
import { timingSafeEqual } from 'node:crypto';
import { HttpError } from '../shared/errors.js';
export const cookieName = 'help_family_accounts';
export function readSessionCookie(req) {
  const values = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`));
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}
export function setSessionCookie(res, token) {
  // HTTP é aceito somente em loopback. Secure deverá acompanhar a futura configuração HTTPS.
  res.setHeader('Set-Cookie', [
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? 8 * 60 * 60 : 0}`,
    // Remove o cookie da primeira API, cujo Path=/api impediria autenticar páginas HTML.
    `${cookieName}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0`,
  ]);
}
export const requireSession = (service) => async (req, _res, next) => {
  req.auth = await service.authenticate(readSessionCookie(req));
  if (!req.auth) throw new HttpError(401, 'Faça login para continuar.');
  next();
};
export function requireCsrf(req, _res, next) {
  validateCsrf(req.auth, req.get('x-csrf-token'));
  next();
}
export function validateCsrf(auth, value) {
  const expected = Buffer.from(auth.csrfToken);
  const received = Buffer.from(typeof value === 'string' ? value : '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    throw new HttpError(403, 'Confirmação de sessão inválida.');
}
