/** Contrato de autenticação; só retorna o perfil público e o token CSRF da própria sessão. */
import { Router } from 'express';
import { credentials } from './validation.js';
import {
  readSessionCookie,
  setSessionCookie,
  requireSession,
  requireCsrf,
} from '../../middleware/session.js';
export function authRoutes(service, attempts) {
  const router = Router();
  for (const action of ['register', 'login'])
    router.post(`/${action}`, attempts, async (req, res) => {
      const input = credentials(req.body, action === 'register');
      const result =
        action === 'register'
          ? await service.register(input)
          : await service.login(input, readSessionCookie(req));
      setSessionCookie(res, result.session.token);
      res
        .status(action === 'register' ? 201 : 200)
        .json({ user: result.user, csrfToken: result.session.csrf });
    });
  router.get('/session', async (req, res) => {
    const auth = await service.authenticate(readSessionCookie(req));
    res.json(
      auth
        ? {
            authenticated: true,
            user: auth.user,
            csrfToken: auth.csrfToken,
            expiresAt: auth.expiresAt,
          }
        : { authenticated: false },
    );
  });
  router.post('/logout', requireSession(service), requireCsrf, async (req, res) => {
    await service.logout(req.auth);
    setSessionCookie(res, '');
    res.status(204).end();
  });
  return router;
}
