/** API do catálogo com família/medicamento nos caminhos, CSRF e versão por registro. */
import { Router } from 'express';
import { requireSession, requireCsrf } from '../../middleware/session.js';
import { familyId, version } from '../families/validation.js';
import { catalogId } from './validation.js';
export function medicineRoutes(service, auth) {
  const router = Router({ mergeParams: true });
  router.use(requireSession(auth));
  router.use((req, _res, next) => {
    req.familyId = familyId(req.params.familyId);
    next();
  });
  router.get('/', async (req, res) =>
    res.json({ items: await service.list(req.auth.user.id, req.familyId) }),
  );
  router.get('/:id', async (req, res) =>
    res.json({ item: await service.get(req.auth.user.id, req.familyId, catalogId(req.params.id)) }),
  );
  router.post('/', requireCsrf, async (req, res) =>
    res.status(201).json({ item: await service.create(req.auth.user.id, req.familyId, req.body) }),
  );
  router.patch('/:id', requireCsrf, async (req, res) =>
    res.json({
      item: await service.update(
        req.auth.user.id,
        req.familyId,
        catalogId(req.params.id),
        req.body,
        version(req.get('If-Match')),
      ),
    }),
  );
  router.get('/:id/presentations/:presentationId', async (req, res) =>
    res.json({
      item: await service.getPresentation(
        req.auth.user.id,
        req.familyId,
        catalogId(req.params.id),
        catalogId(req.params.presentationId),
      ),
    }),
  );
  router.post('/:id/presentations', requireCsrf, async (req, res) =>
    res.status(201).json({
      item: await service.createPresentation(
        req.auth.user.id,
        req.familyId,
        catalogId(req.params.id),
        req.body,
      ),
    }),
  );
  router.patch('/:id/presentations/:presentationId', requireCsrf, async (req, res) =>
    res.json({
      item: await service.updatePresentation(
        req.auth.user.id,
        req.familyId,
        catalogId(req.params.id),
        catalogId(req.params.presentationId),
        req.body,
        version(req.get('If-Match')),
      ),
    }),
  );
  return router;
}
