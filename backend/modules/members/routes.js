/** API de familiares; versão por If-Match e nenhuma identidade aceita no corpo. */
import { Router } from 'express';
import { requireSession, requireCsrf } from '../../middleware/session.js';
import { familyId, version } from '../families/validation.js';
import { fields } from '../auth/validation.js';
import { memberId } from './validation.js';
import { memberUpload, uploadedPhoto } from './upload.js';
import { HttpError } from '../../shared/errors.js';
export function memberRoutes(service, auth) {
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
    res.json({ item: await service.get(req.auth.user.id, req.familyId, memberId(req.params.id)) }),
  );
  router.get('/:id/photo', async (req, res) =>
    res
      .type('jpeg')
      .send(await service.photo(req.auth.user.id, req.familyId, memberId(req.params.id))),
  );
  router.post('/', requireCsrf, async (req, res) =>
    res.status(201).json({ item: await service.create(req.auth.user.id, req.familyId, req.body) }),
  );
  router.patch('/:id', requireCsrf, async (req, res) =>
    res.json({
      item: await service.update(
        req.auth.user.id,
        req.familyId,
        memberId(req.params.id),
        req.body,
        version(req.get('If-Match')),
      ),
    }),
  );
  router.post(
    '/:id/photo',
    requireCsrf,
    async (req, _res, next) => {
      await service.authorize(req.auth.user.id, req.familyId, true);
      memberId(req.params.id);
      version(req.get('If-Match'));
      next();
    },
    memberUpload,
    async (req, res) => {
      fields(req.body, []);
      const photo = uploadedPhoto(req);
      if (!photo) throw new HttpError(422, 'Escolha uma foto.');
      res.json({
        item: await service.update(
          req.auth.user.id,
          req.familyId,
          memberId(req.params.id),
          {},
          version(req.get('If-Match')),
          photo,
        ),
      });
    },
  );
  router.delete('/:id/photo', requireCsrf, async (req, res) => {
    fields(req.body, []);
    res.json({
      item: await service.update(
        req.auth.user.id,
        req.familyId,
        memberId(req.params.id),
        {},
        version(req.get('If-Match')),
        null,
      ),
    });
  });
  return router;
}
