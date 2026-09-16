/** Catálogo SSR: cartões existentes e formulários comuns, sem ações ainda não integradas. */
import { page } from '../templates.js';
import { escapeHtml as e, icon } from '../../components/ui.js';
import { medicineColors } from '../../../modules/medicines/validation.js';
export const catalogPath = (family) => `/families/${e(family.id)}/medicines`;
const canEdit = (family) => ['owner', 'caregiver'].includes(family.role);
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const input = (label, name, value) =>
  `<label>${label}<input name="${name}" value="${e(value)}" autocomplete="off"></label>`;
export function catalogPage(auth, family, items) {
  const path = catalogPath(family);
  const write = canEdit(family);
  return page(
    'Medicamentos',
    `<section class="medication-management-page account-catalog"><a class="accounts-back" href="/families/${e(family.id)}">${icon('arrow_back')}${e(family.name)}</a><header class="medication-page-heading"><div><h1>Medicamentos</h1><p>Organize o catálogo e as apresentações da sua família.</p></div>${write ? `<a class="primary-button catalog-create" href="${path}/new">${icon('add')}Cadastrar medicamento</a>` : ''}</header>${!write ? '<p class="catalog-readonly">Você tem acesso de leitura ao catálogo desta família.</p>' : ''}<div class="medication-bento-grid">${items.map((m) => `<article class="medication-glass-card catalog-drug-card medicine-color-${medicineColors.indexOf(m.color)}"><div class="medication-card-decoration" aria-hidden="true"></div><header class="medication-card-header"><div class="medication-card-person"><span class="medication-feature-icon">${icon('pill')}</span><div><h2>${e(m.name)}</h2><p>${m.presentations.length} ${m.presentations.length === 1 ? 'apresentação' : 'apresentações'}</p></div></div></header><div class="catalog-presentations"><small>Apresentações</small><div>${m.presentations.map((p) => (write ? `<a class="catalog-presentation" href="${path}/${e(m.id)}/presentations/${e(p.id)}/edit" aria-label="Editar apresentação ${e(p.strength)} · ${e(p.form)} de ${e(m.name)}">${e(p.strength)} · ${e(p.form)}${icon('edit')}</a>` : `<span>${e(p.strength)} · ${e(p.form)}</span>`)).join('') || '<p class="catalog-no-routines">Nenhuma apresentação cadastrada.</p>'}</div></div>${write ? `<footer class="catalog-card-actions"><a class="secondary-button" href="${path}/${e(m.id)}/edit" aria-label="Editar medicamento ${e(m.name)}">${icon('edit')}Editar</a><a class="primary-button" href="${path}/${e(m.id)}/presentations/new" aria-label="Adicionar apresentação de ${e(m.name)}">${icon('add_circle')}Apresentação</a></footer>` : ''}</article>`).join('') || '<section class="family-add-card"><span aria-hidden="true">' + icon('medication') + '</span><h2>Nenhum medicamento cadastrado</h2><p>As apresentações aparecerão junto de cada medicamento.</p></section>'}</div></section>`,
    auth,
  );
}
/** O formulário de apresentação fixa seu medicamento pelo caminho; não envia IDs no corpo. */
export function catalogForm(auth, family, kind, item = {}, medicine, error = '', conflict = false) {
  const presentation = kind === 'presentation';
  const editing = Boolean(item.id);
  const path = catalogPath(family);
  const target = presentation ? `${path}/${e(medicine.id)}/presentations` : path;
  const action = target + (editing ? `/${e(item.id)}` : '');
  const title = presentation
    ? editing
      ? 'Editar apresentação'
      : 'Nova apresentação'
    : editing
      ? 'Editar medicamento'
      : 'Cadastrar medicamento';
  const colorNames = ['Verde', 'Azul', 'Rosa', 'Dourado', 'Lilás', 'Terracota'];
  const fields = presentation
    ? `<p class="catalog-parent">Medicamento: <strong>${e(medicine.name)}</strong></p>${input('Concentração / dosagem', 'strength', item.strength)}${input('Apresentação', 'form', item.form)}`
    : `${input('Nome do medicamento', 'name', item.name)}<label>Cor do medicamento<select name="color">${medicineColors.map((color, i) => `<option value="${color}"${color === (item.color || medicineColors[0]) ? ' selected' : ''}>${colorNames[i]}</option>`).join('')}</select></label>`;
  return page(
    title,
    `<section class="family-page"><a class="accounts-back" href="${path}">${icon('arrow_back')}Medicamentos de ${e(family.name)}</a><header class="family-page-heading"><div><h1>${title}</h1><p>${presentation ? 'Registre a concentração e a forma da apresentação.' : 'Adicione o medicamento ao catálogo desta família.'}</p></div></header><section class="family-profile-card family-detail">${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}${conflict ? `<p>Suas alterações não foram salvas. Confira a versão atual antes de editar novamente.</p><a class="primary-button" href="${action}/edit">Abrir versão atual</a>` : `<form class="account-form catalog-form" method="post" action="${action}" novalidate>${hidden('_csrf', auth.csrfToken)}${editing ? hidden('version', item.version) : ''}<div class="form-fields">${fields}</div><footer><a class="secondary-button" href="${path}">Cancelar</a><button class="primary-button" type="submit">${icon('check')}${presentation ? 'Salvar apresentação' : 'Salvar medicamento'}</button></footer></form>`}</section></section>`,
    auth,
  );
}
