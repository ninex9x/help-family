/** Formulários convencionais reutilizam os serviços da API e preservam a versão enviada. */
import { Router } from 'express';
import { fields } from '../../../modules/auth/validation.js';
import { familyId, version } from '../../../modules/families/validation.js';
import {
  catalogId,
  medicineFields,
  presentationFields,
} from '../../../modules/medicines/validation.js';
import { validateCsrf } from '../../../middleware/session.js';
import { HttpError } from '../../../shared/errors.js';
import { catalogPage, catalogForm, catalogPath } from './templates.js';
export function medicineWebRoutes(service) {
  const router = Router({ mergeParams: true });
  router.use(async (req, _res, next) => {
    req.family = await service.authorize(
      req.auth.user.id,
      familyId(req.params.familyId),
      !['GET', 'HEAD'].includes(req.method),
    );
    next();
  });
  router.get('/', async (req, res) =>
    res.send(
      catalogPage(req.auth, req.family, await service.list(req.auth.user.id, req.family.id)),
    ),
  );
  // Todas as rotas restantes são formulários de escrita, inclusive seus GETs.
  router.use(async (req, _res, next) => {
    await service.authorize(req.auth.user.id, req.family.id, true);
    next();
  });
  router.get('/new', (req, res) => res.send(catalogForm(req.auth, req.family, 'medicine')));
  router.get('/:id/edit', async (req, res) =>
    res.send(
      catalogForm(
        req.auth,
        req.family,
        'medicine',
        await service.get(req.auth.user.id, req.family.id, catalogId(req.params.id)),
      ),
    ),
  );
  router.get('/:id/presentations/new', async (req, res) =>
    res.send(
      catalogForm(
        req.auth,
        req.family,
        'presentation',
        {},
        await service.get(req.auth.user.id, req.family.id, catalogId(req.params.id)),
      ),
    ),
  );
  router.get('/:id/presentations/:presentationId/edit', async (req, res) => {
    const medicine = await service.get(req.auth.user.id, req.family.id, catalogId(req.params.id));
    const item = await service.getPresentation(
      req.auth.user.id,
      req.family.id,
      medicine.id,
      catalogId(req.params.presentationId),
    );
    res.send(catalogForm(req.auth, req.family, 'presentation', item, medicine));
  });
  function save(presentation) {
    return async (req, res) => {
      const allowed = presentation ? presentationFields : medicineFields;
      const id = presentation ? req.params.presentationId : req.params.id;
      const editingId = id ? catalogId(id) : undefined;
      fields(req.body, [...allowed, '_csrf', ...(editingId ? ['version'] : [])]);
      validateCsrf(req.auth, req.body._csrf);
      const userId = req.auth.user.id;
      const familyId = req.family.id;
      const medicine = presentation
        ? await service.get(userId, familyId, catalogId(req.params.id))
        : undefined;
      const current = !editingId
        ? {}
        : presentation
          ? await service.getPresentation(userId, familyId, medicine.id, editingId)
          : await service.get(userId, familyId, editingId);
      const input = Object.fromEntries(
        allowed.filter((key) => Object.hasOwn(req.body, key)).map((key) => [key, req.body[key]]),
      );
      try {
        if (presentation) {
          if (editingId)
            await service.updatePresentation(
              userId,
              familyId,
              medicine.id,
              editingId,
              input,
              version(req.body.version),
            );
          else await service.createPresentation(userId, familyId, medicine.id, input);
        } else {
          if (editingId)
            await service.update(userId, familyId, editingId, input, version(req.body.version));
          else await service.create(userId, familyId, input);
        }
        res.redirect(303, catalogPath(req.family));
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        res
          .status(error.status)
          .send(
            catalogForm(
              req.auth,
              req.family,
              presentation ? 'presentation' : 'medicine',
              { ...current, ...input, version: req.body.version },
              medicine,
              error.message,
              error.status === 409,
            ),
          );
      }
    };
  }
  router.post('/', save(false));
  router.post('/:id', save(false));
  router.post('/:id/presentations', save(true));
  router.post('/:id/presentations/:presentationId', save(true));
  return router;
}
