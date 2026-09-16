/** Agenda e histórico SSR com filtros nativos e cartões existentes. Nenhum relógio no cliente. */
import { page } from '../templates.js';
import { escapeHtml as e, icon } from '../../components/ui.js';
import { timeZone } from '../../../modules/doses/validation.js';
export const dosesPath = (family) => `/families/${e(family.id)}/doses`;
const hidden = (name, value) => `<input type="hidden" name="${name}" value="${e(value)}">`;
const dateLabel = (value) => value.split('-').reverse().join('/');
const timestamp = new Intl.DateTimeFormat('pt-BR', {
  timeZone,
  dateStyle: 'short',
  timeStyle: 'short',
});
const statusLabel = { pending: 'Pendente', taken: 'Tomada', skipped: 'Não tomada' };
const memberSelect = (members, selected) =>
  `<label>Familiar<select name="memberId" aria-label="Familiar"><option value="">Todos os familiares</option>${members.map((m) => `<option value="${e(m.id)}"${m.id === selected ? ' selected' : ''}>${e(m.name)}</option>`).join('')}</select></label>`;
function card(item, form = '') {
  return `<article class="medication-glass-card dose-card"><header class="medication-card-header"><div class="medication-card-person"><span class="medication-feature-icon">${icon('medication')}</span><div><h2>${e(item.memberName)}</h2><p>${e(item.medicineName)}</p></div></div></header><span class="dose-status dose-${item.status}">${statusLabel[item.status]}</span><p class="routine-presentation">${e(item.strength)} · ${e(item.form)}</p><p class="routine-quantity"><strong>Quantidade:</strong> ${e(item.quantity)}</p>${item.instruction ? `<p class="routine-instruction">${e(item.instruction)}</p>` : ''}<p class="dose-time">${icon('schedule')}${e(dateLabel(item.date))} · ${e(item.time)}</p>${item.recordedAt ? `<p class="dose-recorded">Registrada em ${e(timestamp.format(new Date(item.recordedAt)))}</p>` : ''}${item.note ? `<p class="dose-note">${e(item.note)}</p>` : ''}${form}</article>`;
}
export function todayPage(auth, family, data, members, error = '') {
  const path = dosesPath(family),
    write = ['owner', 'caregiver'].includes(family.role);
  const url = (page) =>
    `${path}?${new URLSearchParams({ ...(data.memberId ? { memberId: data.memberId } : {}), page: String(page) })}`;
  return page(
    'Doses de hoje',
    `<section class="account-catalog dose-page"><a class="accounts-back" href="/families/${e(family.id)}">${icon('arrow_back')}${e(family.name)}</a><header class="medication-page-heading"><div><h1>Doses de hoje</h1><p>${e(dateLabel(data.date))} · Horário de São Paulo</p></div><a class="secondary-button catalog-create" href="${path}/history">${icon('history')}Ver histórico</a></header>${error ? `<p class="form-error" role="alert">${e(error)}</p>` : ''}<form class="account-form catalog-form dose-filters" method="get" action="${path}" novalidate>${memberSelect(members, data.memberId)}<button class="secondary-button" type="submit">Filtrar</button></form><p class="dose-summary">${data.counts.pending} pendentes · ${data.counts.taken} tomadas · ${data.counts.skipped} não tomadas</p>${!write ? '<p class="catalog-readonly">Você tem acesso de leitura à agenda e ao histórico.</p>' : ''}<div class="medication-bento-grid">${data.items.map((item) => card(item, item.status === 'pending' && write ? `<form class="account-form dose-form" method="post" action="${path}" novalidate>${hidden('_csrf', auth.csrfToken)}${hidden('routineId', item.routineId)}${hidden('date', item.date)}${hidden('time', item.time)}${hidden('version', item.version)}${hidden('context', item.context)}<details><summary>Adicionar observação</summary><label>Observação<textarea name="note" aria-label="Observação" rows="2"></textarea></label></details><div class="dose-actions"><button class="primary-button" name="status" value="taken" type="submit">${icon('check')}Tomada</button><button class="secondary-button" name="status" value="skipped" type="submit">${icon('close')}Não tomada</button></div></form>` : '')).join('') || '<section class="family-add-card"><h2>Nenhuma dose para hoje</h2><p>As rotinas ativas com horários aparecem nesta agenda.</p></section>'}</div><nav class="dose-pagination" aria-label="Páginas da agenda">${data.page > 1 ? `<a class="secondary-button" href="${e(url(data.page - 1))}">Anterior</a>` : ''}<span>Página ${data.page} de ${data.pages}</span>${data.page < data.pages ? `<a class="secondary-button" href="${e(url(data.page + 1))}">Próxima</a>` : ''}</nav></section>`,
    auth,
  );
}
export function historyPage(auth, family, data, members) {
  const path = dosesPath(family),
    query = new URLSearchParams({
      from: data.from,
      to: data.to,
      ...(data.memberId ? { memberId: data.memberId } : {}),
      ...(data.nextCursor ? { cursor: data.nextCursor } : {}),
    });
  return page(
    'Histórico de doses',
    `<section class="account-catalog dose-page"><a class="accounts-back" href="${path}">${icon('arrow_back')}Doses de hoje</a><header class="medication-page-heading"><div><h1>Histórico de doses</h1><p>Consulte os registros de ${e(family.name)}.</p></div></header><form class="account-form catalog-form dose-filters history-filters" method="get" action="${path}/history" novalidate>${memberSelect(members, data.memberId)}<label>De<input name="from" type="date" value="${e(data.from)}"></label><label>Até<input name="to" type="date" value="${e(data.to)}"></label><button class="secondary-button" type="submit">Filtrar histórico</button></form><p class="dose-summary">Horário de São Paulo · Até 31 dias por consulta</p><div class="medication-bento-grid">${data.items.map((item) => card(item)).join('') || '<section class="family-add-card"><h2>Nenhum registro neste período</h2><p>Os registros aparecerão aqui após a confirmação na agenda.</p></section>'}</div>${data.nextCursor ? `<nav class="dose-pagination" aria-label="Páginas do histórico"><a class="secondary-button" href="${path}/history?${e(query.toString())}">Mais registros</a></nav>` : ''}</section>`,
    auth,
  );
}
