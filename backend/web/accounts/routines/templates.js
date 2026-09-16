/** Rotinas SSR reutilizam cartões, formulários e cores do catálogo existente. */
import { page } from '../templates.js';
import { escapeHtml as e, icon } from '../../components/ui.js';
export const routinePath = (family) => `/families/${e(family.id)}/routines`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const canEdit = (family) => ['owner', 'caregiver'].includes(family.role);
function labels(item, choices) {
  const member = choices.members.find((m) => m.id === item.memberId);
  const medicine = choices.medicines.find(
    (m) => m.id === item.medicineId || m.presentations.some((p) => p.id === item.presentationId),
  );
  const presentation = medicine?.presentations.find((p) => p.id === item.presentationId);
  return {
    member: member?.name || 'Familiar',
    medicine: medicine?.name || 'Medicamento',
    presentation: presentation ? `${presentation.strength} · ${presentation.form}` : 'Apresentação',
  };
}
export function routinesPage(auth, family, items, choices) {
  const path = routinePath(family);
  return page(
    'Rotinas',
    `<section class="account-catalog routine-page"><a class="accounts-back" href="/families/${e(family.id)}">${icon('arrow_back')}${e(family.name)}</a><header class="medication-page-heading"><div><h1>Rotinas</h1><p>Organize os horários diários de quem você cuida.</p></div>${canEdit(family) ? `<a class="primary-button catalog-create" href="${path}/new">${icon('add')}Criar rotina</a>` : ''}</header>${!canEdit(family) ? '<p class="catalog-readonly">Você tem acesso de leitura às rotinas desta família.</p>' : ''}<div class="medication-bento-grid">${
      items
        .map((r) => {
          const text = labels(r, choices);
          return `<article class="medication-glass-card routine-card"><header class="medication-card-header"><div class="medication-card-person"><span class="medication-feature-icon">${icon('schedule')}</span><div><h2>${e(text.member)}</h2><p>${e(text.medicine)}</p></div></div></header><span class="routine-status ${r.active ? '' : 'routine-paused'}">${r.active ? 'Ativa' : 'Pausada'}</span><p class="routine-presentation">${e(text.presentation)}</p><p class="routine-quantity"><strong>Quantidade:</strong> ${e(r.quantity)}</p>${r.instruction ? `<p class="routine-instruction">${e(r.instruction)}</p>` : ''}<div class="medication-time-chips" aria-label="Horários diários">${r.times.map((time) => `<span>${icon('schedule')}${e(time)}</span>`).join('')}</div>${canEdit(family) ? `<footer class="catalog-card-actions"><a class="secondary-button" href="${path}/${e(r.id)}/edit">${icon('edit')}Editar rotina</a><form method="post" action="${path}/${e(r.id)}/status">${hidden('_csrf', auth.csrfToken)}${hidden('version', r.version)}${hidden('active', String(!r.active))}<button class="primary-button" type="submit">${icon(r.active ? 'pause' : 'play_arrow')}${r.active ? 'Pausar' : 'Reativar'}</button></form></footer>` : ''}</article>`;
        })
        .join('') ||
      `<section class="family-add-card"><span aria-hidden="true">${icon('schedule')}</span><h2>Nenhuma rotina cadastrada</h2><p>As rotinas aparecerão aqui após o cadastro.</p></section>`
    }</div></section>`,
    auth,
  );
}
export function routineFormPage(auth, family, choices, item = {}, error = '', conflict = false) {
  const editing = Boolean(item.id),
    path = routinePath(family),
    action = path + (editing ? `/${e(item.id)}` : '');
  const title = editing ? 'Editar rotina' : 'Criar rotina';
  const ready = choices.members.length && choices.medicines.some((m) => m.presentations.length);
  const text = labels(item, choices);
  const selected = (a, b) => (a === b ? ' selected' : '');
  const times = Array.isArray(item.times) ? item.times.join(', ') : item.times;
  const references = editing
    ? `<p class="catalog-parent"><strong>${e(text.member)}</strong><br>${e(text.medicine)} · ${e(text.presentation)}</p><small class="form-hint">Para trocar o familiar ou a apresentação, pause esta rotina e crie outra.</small>`
    : `<label>Familiar<select name="memberId" aria-label="Familiar"><option value="">Selecione o familiar</option>${choices.members.map((m) => `<option value="${e(m.id)}"${selected(item.memberId, m.id)}>${e(m.name)}</option>`).join('')}</select></label><label>Medicamento e apresentação<select name="presentationId" aria-label="Medicamento e apresentação"><option value="">Selecione a apresentação</option>${choices.medicines
        .filter((m) => m.presentations.length)
        .map(
          (m) =>
            `<optgroup label="${e(m.name)}">${m.presentations.map((p) => `<option value="${e(p.id)}"${selected(item.presentationId, p.id)}>${e(m.name)} · ${e(p.strength)} · ${e(p.form)}</option>`).join('')}</optgroup>`,
        )
        .join('')}</select></label>`;
  return page(
    title,
    `<section class="family-page"><a class="accounts-back" href="${path}">${icon('arrow_back')}Rotinas de ${e(family.name)}</a><header class="family-page-heading"><div><h1>${title}</h1><p>Registre os cuidados e os horários da rotina.</p></div></header><section class="family-profile-card family-detail">${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}${!ready ? `<h2>Prepare os cadastros da família</h2><p>Você precisa de um familiar e de um medicamento com apresentação para criar uma rotina.</p><a class="secondary-button" href="/families/${e(family.id)}/members">Ver familiares</a><a class="secondary-button" href="/families/${e(family.id)}/medicines">Ver medicamentos</a>` : conflict ? `<p>Suas alterações não foram salvas. Confira os dados atuais antes de editar novamente.</p><a class="primary-button" href="${action}/edit">Abrir versão atual</a>` : `<form class="account-form catalog-form routine-form" method="post" action="${action}" novalidate>${hidden('_csrf', auth.csrfToken)}${editing ? hidden('version', item.version) : ''}<div class="form-fields">${references}<label>Quantidade por dose<input name="quantity" value="${e(item.quantity)}" autocomplete="off"></label><label>Horários diários<input name="times" value="${e(times)}" placeholder="08:00, 20:00" autocomplete="off"></label><small class="form-hint">Separe os horários por vírgula. Use o formato de 24 horas, como 08:00, 20:00.</small><label>Instruções<textarea name="instruction" aria-label="Instruções" rows="4">${e(item.instruction)}</textarea></label><label>Estado da rotina<select name="active" aria-label="Estado da rotina"><option value="true"${item.active === false || item.active === 'false' ? '' : ' selected'}>Ativa</option><option value="false"${item.active === false || item.active === 'false' ? ' selected' : ''}>Pausada</option></select></label></div><footer><a class="secondary-button" href="${path}">Cancelar</a><button class="primary-button" type="submit">${icon('check')}Salvar rotina</button></footer></form>`}</section></section>`,
    auth,
  );
}
