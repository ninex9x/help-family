/** O navegador informa a ocorrência; data, versão, autor e conteúdo são conferidos no backend. */
import { Router } from 'express';
import { requireSession, requireCsrf } from '../../middleware/session.js';
import { familyId, version } from '../families/validation.js';
export function doseRoutes(service, auth) {
  const router = Router({ mergeParams: true });
  router.use(requireSession(auth));
  router.use((req, _res, next) => {
    req.familyId = familyId(req.params.familyId);
    next();
  });
  router.get('/today', async (req, res) =>
    res.json(await service.today(req.auth.user.id, req.familyId, req.query)),
  );
  router.get('/history', async (req, res) =>
    res.json(await service.history(req.auth.user.id, req.familyId, req.query)),
  );
  router.post('/', requireCsrf, async (req, res) =>
    res.status(201).json({
      item: await service.record(
        req.auth.user.id,
        req.familyId,
        req.body,
        version(req.get('If-Match')),
      ),
    }),
  );
  return router;
}
