/** Fluxo SSR: origem + sessão + CSRF no servidor; redirecionamentos apenas para destinos fixos. */
import { Router } from 'express';
import { fileURLToPath } from 'node:url';
import { credentials, fields } from '../../modules/auth/validation.js';
import { familyInput, familyId, version } from '../../modules/families/validation.js';
import { readSessionCookie, setSessionCookie, validateCsrf } from '../../middleware/session.js';
import { HttpError } from '../../shared/errors.js';
import { authPage, familiesPage, familyPage, errorPage } from './templates.js';
import { memberWebRoutes } from './members.js';
import { medicineWebRoutes } from './medicines/routes.js';
import { routineWebRoutes } from './routines/routes.js';
import { doseWebRoutes } from './doses/routes.js';
const asset = (path) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
export function accountWebRoutes(auth, families, attempts, members, medicines, routines, doses) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next('router');
    // Formulários nativos precisam preservar Origin; no-referrer o tornaria "null".
    // same-origin mantém a verificação exata sem enviar Referer a outros sites.
    res.set('Referrer-Policy', 'same-origin');
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    );
    next();
  });
  for (const [url, path] of Object.entries({
    '/assets/base.css': 'frontend/css/base.css',
    '/assets/layout.css': 'frontend/css/layout.css',
    '/assets/forms.css': 'frontend/css/forms.css',
    '/assets/family.css': 'frontend/css/pages/family.css',
    '/assets/components.css': 'frontend/css/components.css',
    '/assets/accounts.css': 'frontend/css/pages/accounts.css',
    '/assets/members.css': 'frontend/css/pages/members.css',
    '/assets/medicines.css': 'frontend/css/pages/medicines.css',
    '/assets/catalog.css': 'frontend/css/pages/catalog.css',
    '/assets/routines.css': 'frontend/css/pages/routines.css',
    '/assets/doses.css': 'frontend/css/pages/doses.css',
    '/assets/inter.woff2': 'node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2',
    '/assets/inter-500.woff2': 'node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2',
    '/assets/inter-600.woff2': 'node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2',
    '/assets/inter-700.woff2': 'node_modules/@fontsource/inter/files/inter-latin-700-normal.woff2',
    '/assets/icons.woff2':
      'node_modules/@fontsource/material-symbols-outlined/files/material-symbols-outlined-latin-400-normal.woff2',
  }))
    router.get(url, (_req, res) => res.sendFile(asset(path)));
  router.use(async (req, _res, next) => {
    req.auth = await auth.authenticate(readSessionCookie(req));
    next();
  });
  router.get('/', (req, res) => res.redirect(303, req.auth ? '/families' : '/login'));
  for (const kind of ['login', 'register']) {
    router.get(`/${kind}`, (req, res) =>
      req.auth ? res.redirect(303, '/families') : res.send(authPage(kind)),
    );
    router.post(`/${kind}`, attempts, async (req, res) => {
      try {
        const input = credentials(req.body, kind === 'register');
        const result =
          kind === 'register'
            ? await auth.register(input)
            : await auth.login(input, readSessionCookie(req));
        setSessionCookie(res, result.session.token);
        res.redirect(303, '/families');
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        res.status(error.status).send(authPage(kind, error.message, req.body));
      }
    });
  }
  router.use((req, res, next) => {
    if (req.auth) return next();
    if (req.method === 'GET') return res.redirect(303, '/login');
    throw new HttpError(401, 'Sua sessão expirou. Entre novamente.');
  });
  router.post('/logout', async (req, res) => {
    fields(req.body, ['_csrf']);
    validateCsrf(req.auth, req.body._csrf);
    await auth.logout(req.auth);
    setSessionCookie(res, '');
    res.redirect(303, '/login');
  });
  router.get('/families', async (req, res) =>
    res.send(familiesPage(req.auth, await families.list(req.auth.user.id))),
  );
  router.post('/families', async (req, res) => {
    fields(req.body, ['name', '_csrf']);
    validateCsrf(req.auth, req.body._csrf);
    try {
      const family = await families.create(
        req.auth.user.id,
        familyInput({ name: req.body.name }).name,
      );
      res.redirect(303, `/families/${family.id}`);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      res
        .status(error.status)
        .send(familiesPage(req.auth, await families.list(req.auth.user.id), error.message));
    }
  });
  router.get('/families/:id', async (req, res) =>
    res.send(familyPage(req.auth, await families.get(req.auth.user.id, familyId(req.params.id)))),
  );
  router.post('/families/:id/rename', async (req, res) => {
    fields(req.body, ['name', 'version', '_csrf']);
    validateCsrf(req.auth, req.body._csrf);
    const id = familyId(req.params.id);
    try {
      await families.rename(
        req.auth.user.id,
        id,
        familyInput({ name: req.body.name }).name,
        version(req.body.version),
      );
      res.redirect(303, `/families/${id}`);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      res
        .status(error.status)
        .send(familyPage(req.auth, await families.get(req.auth.user.id, id), error.message));
    }
  });
  router.use('/families/:familyId/members', memberWebRoutes(members));
  router.use('/families/:familyId/medicines', medicineWebRoutes(medicines));
  router.use('/families/:familyId/routines', routineWebRoutes(routines, members, medicines));
  router.use('/families/:familyId/doses', doseWebRoutes(doses, members));
  router.use((_req, _res, next) => next(new HttpError(404, 'Página não encontrada.')));
  router.use((error, _req, res, _next) => {
    const status = error instanceof HttpError ? error.status : 500;
    res
      .status(status)
      .type('html')
      .send(
        errorPage(status, status === 500 ? 'Não foi possível concluir a operação.' : error.message),
      );
  });
  return router;
}
