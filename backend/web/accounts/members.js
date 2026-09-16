/** Páginas de familiares renderizadas no servidor, inclusive formulários e erros. Sem JS cliente. */
import { Router } from 'express';
import { page } from './templates.js';
import { escapeHtml as e, icon } from '../components/ui.js';
import { fields } from '../../modules/auth/validation.js';
import { familyId, version } from '../../modules/families/validation.js';
import { memberId, memberFields, colors } from '../../modules/members/validation.js';
import { memberUpload, uploadedPhoto } from '../../modules/members/upload.js';
import { validateCsrf } from '../../middleware/session.js';
import { HttpError } from '../../shared/errors.js';
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const base = (family) => `/families/${e(family.id)}/members`;
const canEdit = (family) => ['owner', 'caregiver'].includes(family.role);
function avatar(member) {
  if (member.hasPhoto)
    return `<img class="account-avatar member-portrait" src="/api/families/${e(member.familyId)}/members/${e(member.id)}/photo" alt="Foto de ${e(member.name)}" width="56" height="56">`;
  const initials = String(member.name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase('pt-BR');
  return `<span class="account-avatar member-color-${colors.indexOf(member.color)}" aria-hidden="true">${e(initials)}</span>`;
}
function listPage(auth, family, members) {
  return page(
    'Familiares',
    `<section class="family-page"><a class="accounts-back" href="/families/${e(family.id)}">${icon('arrow_back')}${e(family.name)}</a><header class="family-page-heading"><div><h1>Familiares</h1><p>Gerencie os perfis de quem você cuida.</p></div>${canEdit(family) ? `<a class="primary-button account-create-link" href="${base(family)}/new">${icon('person_add')}Adicionar familiar</a>` : ''}</header>${!canEdit(family) ? '<p class="account-family-description member-readonly">Você tem acesso de leitura aos familiares desta família.</p>' : ''}<div class="family-bento-grid accounts-grid">${members.map((m) => `<article class="family-profile-card account-member-card"><div class="family-card-decoration" aria-hidden="true"></div><header class="family-card-header"><div class="family-card-person">${avatar(m)}<div><h2>${e(m.name)}</h2><p>${e(m.relationship || 'Familiar')}</p></div></div></header>${m.medicalNotes ? `<p class="family-medical-note member-note">${icon('notes')}<span>${e(m.medicalNotes)}</span></p>` : '<p class="account-family-description">Nenhuma observação adicionada.</p>'}${canEdit(family) ? `<a class="family-documents-button family-card-link" href="${base(family)}/${e(m.id)}/edit">${icon('edit')}Editar familiar</a>` : ''}</article>`).join('')}${members.length ? '' : `<section class="family-add-card"><span aria-hidden="true">${icon('family_restroom')}</span><h2>Nenhum familiar cadastrado</h2><p>${canEdit(family) ? 'Adicione o primeiro perfil para começar a organizar os cuidados.' : 'Os perfis adicionados pelos responsáveis aparecerão aqui.'}</p></section>`}</div></section>`,
    auth,
  );
}
function formPage(auth, family, member = {}, error = '', conflict = false) {
  const editing = Boolean(member.id);
  const title = editing ? 'Editar familiar' : 'Adicionar familiar';
  const colorNames = ['Verde', 'Azul', 'Rosa', 'Dourado', 'Lilás', 'Turquesa'];
  return page(
    title,
    `<section class="family-page"><a class="accounts-back" href="${base(family)}">${icon('arrow_back')}Familiares de ${e(family.name)}</a><header class="family-page-heading"><div><h1>${title}</h1><p>Um perfil para reunir as informações de quem você cuida.</p></div></header><section class="family-profile-card family-detail">${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}${conflict ? `<p>Suas alterações não foram salvas. Abra a versão atual e confira as informações antes de tentar novamente.</p><a class="primary-button" href="${base(family)}/${e(member.id)}/edit">Abrir versão atual</a>` : `<form class="account-form member-form" method="post" enctype="multipart/form-data" action="${base(family)}${editing ? `/${e(member.id)}` : ''}" novalidate>${hidden('_csrf', auth.csrfToken)}${editing ? hidden('version', member.version) : ''}<div class="form-fields"><label>Nome do familiar<input name="name" value="${e(member.name)}" autocomplete="off"></label><label>Parentesco ou vínculo<input name="relationship" value="${e(member.relationship)}" autocomplete="off"></label><label>Cor do perfil<select name="color">${colors.map((color, i) => `<option value="${color}"${color === (member.color || colors[0]) ? ' selected' : ''}>${colorNames[i]}</option>`).join('')}</select></label><label>Observações<textarea name="medicalNotes" rows="4">${e(member.medicalNotes)}</textarea></label>${member.hasPhoto ? avatar(member) : ''}<label>Foto do familiar<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><small class="form-hint">JPG, PNG ou WEBP de até 12 MB. A foto é recortada em formato quadrado.</small>${member.hasPhoto ? '<label class="member-remove-photo"><input type="checkbox" name="removePhoto" value="yes">Remover foto atual</label>' : ''}</div><footer><a class="secondary-button" href="${base(family)}">Cancelar</a><button class="primary-button" type="submit">${icon('check')}Salvar familiar</button></footer></form>`}</section></section>`,
    auth,
  );
}
export function memberWebRoutes(service) {
  const router = Router({ mergeParams: true });
  router.use(async (req, _res, next) => {
    req.family = await service.authorize(
      req.auth.user.id,
      familyId(req.params.familyId),
      req.method !== 'GET' && req.method !== 'HEAD',
    );
    next();
  });
  router.get('/', async (req, res) =>
    res.send(listPage(req.auth, req.family, await service.list(req.auth.user.id, req.family.id))),
  );
  router.get('/new', async (req, res) => {
    await service.authorize(req.auth.user.id, req.family.id, true);
    res.send(formPage(req.auth, req.family));
  });
  router.get('/:id/edit', async (req, res) => {
    await service.authorize(req.auth.user.id, req.family.id, true);
    res.send(
      formPage(
        req.auth,
        req.family,
        await service.get(req.auth.user.id, req.family.id, memberId(req.params.id)),
      ),
    );
  });
  async function save(req, res) {
    const id = req.params.id ? memberId(req.params.id) : undefined;
    const current = id ? await service.get(req.auth.user.id, req.family.id, id) : {};
    fields(req.body, [...memberFields, '_csrf', ...(id ? ['version', 'removePhoto'] : [])]);
    validateCsrf(req.auth, req.body._csrf);
    const input = Object.fromEntries(
      memberFields.filter((key) => Object.hasOwn(req.body, key)).map((key) => [key, req.body[key]]),
    );
    try {
      const photo = uploadedPhoto(req);
      if (id)
        await service.update(
          req.auth.user.id,
          req.family.id,
          id,
          input,
          version(req.body.version),
          photo,
        );
      else await service.create(req.auth.user.id, req.family.id, input, photo);
      res.redirect(303, base(req.family));
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      // Nunca substituir a versão enviada pela atual: isso permitiria sobrescrever uma edição concorrente.
      res
        .status(error.status)
        .send(
          formPage(
            req.auth,
            req.family,
            { ...current, ...input, version: req.body.version },
            error.message + (req.file ? ' Selecione a foto novamente.' : ''),
            error.status === 409,
          ),
        );
    }
  }
  router.post('/', memberUpload, save);
  router.post('/:id', memberUpload, save);
  return router;
}
