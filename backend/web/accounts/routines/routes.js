/** HTML sem JavaScript: selects completos, horários convertidos no backend e POST/Redirect/GET. */
import { Router } from 'express';
import { fields } from '../../../modules/auth/validation.js';
import { familyId, version } from '../../../modules/families/validation.js';
import { catalogId } from '../../../modules/medicines/validation.js';
import { routineForm } from '../../../modules/routines/validation.js';
import { validateCsrf } from '../../../middleware/session.js';
import { HttpError } from '../../../shared/errors.js';
import { routinesPage, routineFormPage, routinePath } from './templates.js';
export function routineWebRoutes(service, members, medicines) {
  const router = Router({ mergeParams: true });
  async function choices(req) {
    const [people, drugs] = await Promise.all([
      members.list(req.auth.user.id, req.family.id),
      medicines.list(req.auth.user.id, req.family.id),
    ]);
    return { members: people, medicines: drugs };
  }
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
      routinesPage(
        req.auth,
        req.family,
        await service.list(req.auth.user.id, req.family.id),
        await choices(req),
      ),
    ),
  );
  router.use(async (req, _res, next) => {
    await service.authorize(req.auth.user.id, req.family.id, true);
    next();
  });
  router.get('/new', async (req, res) =>
    res.send(routineFormPage(req.auth, req.family, await choices(req))),
  );
  router.get('/:id/edit', async (req, res) =>
    res.send(
      routineFormPage(
        req.auth,
        req.family,
        await choices(req),
        await service.get(req.auth.user.id, req.family.id, catalogId(req.params.id)),
      ),
    ),
  );
  async function save(req, res) {
    const id = req.params.id ? catalogId(req.params.id) : undefined;
    const current = id ? await service.get(req.auth.user.id, req.family.id, id) : {};
    validateCsrf(req.auth, req.body?._csrf);
    try {
      const input = routineForm(req.body, Boolean(id));
      if (id)
        await service.update(req.auth.user.id, req.family.id, id, input, version(req.body.version));
      else await service.create(req.auth.user.id, req.family.id, input);
      res.redirect(303, routinePath(req.family));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      // IDs e versão atuais não são substituídos por campos arbitrários do formulário.
      const values = { ...current };
      for (const key of [
        'quantity',
        'instruction',
        'times',
        'active',
        ...(id ? [] : ['memberId', 'presentationId']),
      ])
        if (typeof req.body[key] === 'string') values[key] = req.body[key];
      values.version = req.body.version;
      res
        .status(error.status)
        .send(
          routineFormPage(
            req.auth,
            req.family,
            await choices(req),
            values,
            error.message,
            error.status === 409,
          ),
        );
    }
  }
  router.post('/', save);
  router.post('/:id', save);
  router.post('/:id/status', async (req, res) => {
    fields(req.body, ['_csrf', 'version', 'active']);
    validateCsrf(req.auth, req.body._csrf);
    const id = catalogId(req.params.id);
    try {
      await service.update(
        req.auth.user.id,
        req.family.id,
        id,
        routineForm(req.body, true),
        version(req.body.version),
      );
      res.redirect(303, routinePath(req.family));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      res
        .status(error.status)
        .send(
          routineFormPage(
            req.auth,
            req.family,
            await choices(req),
            await service.get(req.auth.user.id, req.family.id, id),
            error.message,
            error.status === 409,
          ),
        );
    }
  });
  return router;
}
