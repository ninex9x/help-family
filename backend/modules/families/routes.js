/** Endpoints de famílias; criação/edição exigem sessão, origem e token CSRF válidos. */
import { Router } from 'express';
import { requireSession, requireCsrf } from '../../middleware/session.js';
import { familyInput, familyId, version } from './validation.js';
export function familyRoutes(service, auth) {
  const router = Router();
  router.use(requireSession(auth));
  router.get('/', async (req, res) => res.json({ items: await service.list(req.auth.user.id) }));
  router.get('/:id', async (req, res) =>
    res.json({ item: await service.get(req.auth.user.id, familyId(req.params.id)) }),
  );
  router.post('/', requireCsrf, async (req, res) =>
    res
      .status(201)
      .json({ item: await service.create(req.auth.user.id, familyInput(req.body).name) }),
  );
  router.patch('/:id', requireCsrf, async (req, res) =>
    res.json({
      item: await service.rename(
        req.auth.user.id,
        familyId(req.params.id),
        familyInput(req.body).name,
        version(req.get('If-Match')),
      ),
    }),
  );
  return router;
}
