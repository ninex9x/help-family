/** Endpoints de HTML e comandos do site SQLite. Não recebem estado calculado pelo navegador. */
import { Router } from 'express';
import { AppError } from '../services/family.js';
import { renderScreen, screens } from './screens.js';
import { renderForm } from './components/forms.js';
import { options } from './components/ui.js';
import { formCommand, doseCommand, strictFields } from '../services/web-actions.js';
import { documentBytes } from '../services/uploads.js';
export function revision(req) {
  const match = req.get('If-Match');
  return match && /^(?:\d+|"\d+")$/.test(match) ? Number(match.replaceAll('"', '')) : NaN;
}
export function webRoutes(service) {
  const router = Router();
  router.get('/views/:page', (req, res) => {
    if (!Object.hasOwn(screens, req.params.page)) throw new AppError(404, 'Tela não encontrada.');
    const { state, revision } = service.viewSnapshot();
    const ui = {
      memberId: state.members[0]?.id || '',
      medicineMember: 'all',
      historyMember: 'all',
      historySearch: '',
      historyPage: 1,
      documentMember: 'all',
      documentCategory: 'all',
      documentSearch: '',
    };
    for (const key of Object.keys(ui))
      if (typeof req.query[key] === 'string') ui[key] = req.query[key].slice(0, 200);
    ui.historyPage = Math.max(1, Math.min(5000, Number(ui.historyPage) || 1));
    res.json({
      html: renderScreen(req.params.page, state, ui, req.query.theme === 'dark' ? 'dark' : 'light'),
      revision,
    });
  });
  router.get('/forms/presentations', (req, res) => {
    const items = service.list('presentations').filter((p) => p.drugId === req.query.drugId);
    res.json({ html: options(items, '', (p) => `${p.strength} · ${p.form}`) });
  });
  router.get('/forms/:kind', (req, res) => {
    let kind = req.params.kind;
    const collections = {
      member: 'members',
      drug: 'drugs',
      presentation: 'presentations',
      routine: 'routines',
      document: 'documents',
    };
    if (!Object.hasOwn(collections, kind)) throw new AppError(404, 'Formulário não encontrado.');
    const { state, revision } = service.viewSnapshot();
    let notice;
    if (!req.query.id && ['routine', 'document'].includes(kind) && !state.members.length) {
      kind = 'member';
      notice = 'Cadastre um familiar primeiro.';
    } else if (!req.query.id && ['routine', 'presentation'].includes(kind) && !state.drugs.length) {
      kind = 'drug';
      notice = 'Cadastre um medicamento primeiro.';
    } else if (
      !req.query.id &&
      kind === 'routine' &&
      !state.presentations.some((p) => !req.query.drugId || p.drugId === req.query.drugId)
    ) {
      kind = 'presentation';
      notice = 'Cadastre uma apresentação primeiro.';
    }
    const id = typeof req.query.id === 'string' ? req.query.id : undefined;
    if (id && !state[collections[kind]].some((item) => item.id === id))
      throw new AppError(404, 'Registro não encontrado.');
    const context = {
      memberId: typeof req.query.memberId === 'string' ? req.query.memberId : '',
      drugId: typeof req.query.drugId === 'string' ? req.query.drugId : '',
    };
    res.json({ ...renderForm(kind, state, id, context), revision, notice });
  });
  router.post('/actions/forms/:kind', async (req, res) => {
    const command = await formCommand(req.params.kind, req.body);
    const id = typeof req.query.id === 'string' && req.query.id ? req.query.id : undefined;
    const result = service.change(
      command.resource,
      id ? 'PATCH' : 'POST',
      id,
      command.body,
      revision(req),
    );
    res.json({ revision: result.revision });
  });
  router.post('/actions/doses', (req, res) =>
    res.json(doseCommand(service, req.body, revision(req))),
  );
  router.post('/actions/routines/:id/toggle', (req, res) => {
    strictFields(req.body, []);
    const item = service.list('routines').find((r) => r.id === req.params.id);
    if (!item) throw new AppError(404, 'Regra de uso não encontrada.');
    res.json(
      service.change(
        'routines',
        'PATCH',
        item.id,
        { active: item.active === false },
        revision(req),
      ),
    );
  });
  router.get('/files/:id', (req, res) => {
    const doc = service.get('documents', req.params.id);
    if (!doc) throw new AppError(404, 'Documento não encontrado.');
    if (doc.nativeDocumentId && !doc.dataUrl)
      throw new AppError(422, 'Este arquivo está no Android. Abra-o no aplicativo original.');
    const bytes = doc.dataUrl
      ? documentBytes(doc.dataUrl, doc.mimeType)
      : Buffer.from(`help-family\n\n${doc.title}\nData: ${doc.date}\n\nDocumento de demonstração.`);
    if (req.query.download === '1') res.attachment(doc.fileName);
    res.set('Content-Security-Policy', "sandbox; default-src 'none'");
    res.type(doc.dataUrl ? doc.mimeType : 'text/plain').send(bytes);
  });
  router.get('/file-info/:id', (req, res) => {
    const doc = service.get('documents', req.params.id, { metadataOnly: true });
    if (!doc) throw new AppError(404, 'Documento não encontrado.');
    res.json({
      item: { id: doc.id, title: doc.title, fileName: doc.fileName, mimeType: doc.mimeType },
    });
  });
  return router;
}
