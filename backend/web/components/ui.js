/** HTML compartilhado, escape de valores, formatação e notificações acessíveis. */
/** Use para todo valor dinâmico inserido em texto ou atributo HTML entre aspas. */
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const icon = (name) =>
  /* HTML */ `<span class="material-symbols-outlined" aria-hidden="true"
    >${escapeHtml(name)}</span
  >`;
export function avatar(member, size = '') {
  if (!member) return '';
  return member.photo
    ? /* HTML */ `<img
        class="avatar member-photo ${size}"
        src="${escapeHtml(member.photo)}"
        alt="Foto de ${escapeHtml(member.name)}"
      />`
    : /* HTML */ `<span class="avatar ${size}" style="background:${escapeHtml(member.color)}"
        >${escapeHtml(member.initials)}</span
      >`;
}
export const button = (label, action, id = '', className = 'primary-button') =>
  /* HTML */ `<button
    type="button"
    class="${className}"
    data-action="${action}"
    data-id="${escapeHtml(id)}"
    ${className === 'icon-button' ? `aria-label="${action === 'document-download' ? 'Baixar documento' : 'Editar familiar'}"` : ''}
  >
    ${label}
  </button>`;
export const empty = (message) =>
  /* HTML */ `<div class="empty-state">
    ${icon('info')}
    <p>${escapeHtml(message)}</p>
  </div>`;
export { localDate } from '../../shared/local-clock.js';
export const dateLabel = (date) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`));
export const options = (items, selected, label = (item) => item.name) =>
  items
    .map(
      (item) =>
        /* HTML */ `<option
          value="${escapeHtml(item.id)}"
          ${item.id === selected ? 'selected' : ''}
        >
          ${escapeHtml(label(item))}
        </option>`,
    )
    .join('');
export const categoryLabels = { prescription: 'Receita', exam: 'Exame', certificate: 'Atestado' };
export function memberFilter(state, value, name, all = true) {
  return /* HTML */ `<select aria-label="Filtrar por familiar" data-filter="${name}">
    ${all ? '<option value="all">Todos os familiares</option>' : ''}${options(state.members, value)}
  </select>`;
}
/** Botões de filtro reutilizados no histórico e nos documentos; a seleção fica em ui. */
export function filterChips(items, selected, key) {
  return items
    .map(
      (item) =>
        `<button type="button" class="${item.id === selected ? 'active' : ''}" data-action="filter" data-filter-key="${escapeHtml(key)}" data-value="${escapeHtml(item.id)}" aria-pressed="${item.id === selected}">${escapeHtml(item.name)}</button>`,
    )
    .join('');
}
export function formatDose(state, routine) {
  const drug = state.drugs.find((item) => item.id === routine.drugId);
  const presentation = state.presentations.find((item) => item.id === routine.presentationId);
  return {
    name: drug?.name ?? '',
    strength: presentation?.strength ?? '',
    form: presentation?.form ?? '',
  };
}
