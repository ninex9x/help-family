/** Formulários de confirmação compartilham as regras da API; contexto e snapshots são derivados no backend. */
import { Router } from 'express';
import { fields } from '../../../modules/auth/validation.js';
import { familyId, version } from '../../../modules/families/validation.js';
import { validateCsrf } from '../../../middleware/session.js';
import { HttpError } from '../../../shared/errors.js';
import { dosesPath, todayPage, historyPage } from './templates.js';
export function doseWebRoutes(service, members) {
  const router = Router({ mergeParams: true });
  router.use(async (req, _res, next) => {
    req.family = await service.authorize(req.auth.user.id, familyId(req.params.familyId));
    next();
  });
  router.get('/', async (req, res) =>
    res.send(
      todayPage(
        req.auth,
        req.family,
        await service.today(req.auth.user.id, req.family.id, req.query),
        await members.list(req.auth.user.id, req.family.id),
      ),
    ),
  );
  router.get('/history', async (req, res) =>
    res.send(
      historyPage(
        req.auth,
        req.family,
        await service.history(req.auth.user.id, req.family.id, req.query),
        await members.list(req.auth.user.id, req.family.id),
      ),
    ),
  );
  router.post('/', async (req, res) => {
    fields(req.body, [
      '_csrf',
      'version',
      'routineId',
      'date',
      'time',
      'status',
      'note',
      'context',
    ]);
    validateCsrf(req.auth, req.body._csrf);
    const { _csrf, version: expected, ...input } = req.body;
    try {
      await service.record(req.auth.user.id, req.family.id, input, version(expected));
      res.redirect(303, dosesPath(req.family));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      res
        .status(error.status)
        .send(
          todayPage(
            req.auth,
            req.family,
            await service.today(req.auth.user.id, req.family.id),
            await members.list(req.auth.user.id, req.family.id),
            error.message,
          ),
        );
    }
  });
  return router;
}
