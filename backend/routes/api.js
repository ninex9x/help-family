/** Define o contrato REST e traduz parâmetros HTTP para operações do domínio. */
import { Router } from 'express';
import { resources } from '../repositories/family.js';
import { AppError } from '../services/family.js';

export function apiRoutes(service) {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/health', (_req, res) =>
    res.json({ status: 'ok', storage: 'sqlite', localOnly: true }),
  );
  router.get('/state', (_req, res) => res.json(service.snapshot()));
  for (const resource of Object.keys(resources)) {
    router.get(`/${resource}`, (_req, res) => res.json({ items: service.list(resource) }));
    router.get(`/${resource}/:id`, (req, res) => {
      const item = service.list(resource).find((entry) => entry.id === req.params.id);
      if (!item) throw new AppError(404, 'Registro não encontrado.');
      res.json({ item });
    });
    for (const method of ['post', 'patch', 'delete']) {
      router[method](`/${resource}${method === 'post' ? '' : '/:id'}`, (req, res) => {
        const match = req.get('If-Match');
        const expected = match && /^"?\d+"?$/.test(match) ? Number(match.replaceAll('"', '')) : NaN;
        const result = service.change(
          resource,
          method.toUpperCase(),
          req.params.id,
          req.body ?? {},
          expected,
        );
        res.status(method === 'post' ? 201 : 200).json(result);
      });
    }
  }
  router.use((_req, _res, next) => next(new AppError(404, 'Endpoint não encontrado.')));
  return router;
}
