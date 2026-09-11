/** Filtros por familiar e busca textual, com paginação dos registros confirmados pela API. */
import {
  avatar,
  escapeHtml as e,
  icon,
  filterChips,
  dateLabel,
  formatDose,
} from '../components/ui.js';
export function renderHistory(state, ui) {
  const search = ui.historySearch.toLocaleLowerCase('pt-BR');
  const entries = state.logs
    .filter((log) => ui.historyMember === 'all' || log.memberId === ui.historyMember)
    .map((log) => ({ ...log, routine: state.routines.find((r) => r.id === log.routineId) }))
    .filter(
      (log) =>
        log.routine &&
        formatDose(state, log.routine).name.toLocaleLowerCase('pt-BR').includes(search),
    )
    .sort((a, b) => `${b.date}${b.scheduledTime}`.localeCompare(`${a.date}${a.scheduledTime}`));
  const pages = Math.max(1, Math.ceil(entries.length / 10));
  ui.historyPage = Math.max(1, Math.min(ui.historyPage, pages));
  return /* HTML */ `<section class="history-page">
    <header class="history-page-heading">
      <h1>Histórico de Registros</h1>
      <p>Acompanhe as doses e os cuidados de cada familiar.</p>
    </header>
    <section class="history-filter-card">
      <div class="history-family-filter">
        <span>Filtrar por familiar</span>
        <div class="history-filter-chips">
          ${filterChips([{ id: 'all', name: 'Todos' }, ...state.members], ui.historyMember, 'historyMember')}
        </div>
      </div>
      <label class="history-search"
        >${icon('search')}<input
          type="search"
          placeholder="Buscar medicamento"
          aria-label="Buscar medicamento no histórico"
          data-search="historySearch"
          value="${e(ui.historySearch)}"
      /></label>
    </section>
    <div class="history-table-card">
      <div class="history-table-scroll" tabindex="0" role="region" aria-label="Registros de doses">
        <table class="history-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Familiar</th>
              <th>Medicamento</th>
              <th>Dose</th>
              <th>Horário</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${
              entries
                .slice((ui.historyPage - 1) * 10, ui.historyPage * 10)
                .map((log) => {
                  const member = state.members.find((m) => m.id === log.memberId);
                  const dose = formatDose(state, log.routine);
                  return /* HTML */ `<tr class="${log.status === 'skipped' ? 'missed' : ''}">
                    <td><time datetime="${e(log.date)}">${dateLabel(log.date)}</time></td>
                    <td>
                      <span class="history-member-cell"
                        >${avatar(member, 'history-member-avatar')}${e(member?.name)}</span
                      >
                    </td>
                    <td>
                      <span class="history-medicine-name">${e(dose.name)}</span
                      ><small>${e(dose.strength)}</small>
                    </td>
                    <td class="history-dose">${e(log.routine.quantity)}</td>
                    <td>
                      <strong>${e(log.scheduledTime)}</strong
                      ><small>Registrada ${e(log.recordedAt)}</small>
                    </td>
                    <td>
                      <span class="history-status ${log.status}"
                        >${icon(log.status === 'taken' ? 'check_circle' : 'cancel')}${log.status === 'taken' ? 'Tomada' : 'Não foi tomada'}</span
                      >
                    </td>
                  </tr>`;
                })
                .join('') ||
              `<tr><td colspan="6" class="history-empty-row">${icon('history')}<strong>Nenhum registro encontrado</strong><span>Altere os filtros ou registre uma dose na agenda.</span></td></tr>`
            }
          </tbody>
        </table>
      </div>
      <footer class="history-pagination">
        <span>${entries.length} registros · Página ${ui.historyPage} de ${pages}</span>
        <div>
          <button
            data-action="history-page"
            data-id="${ui.historyPage - 1}"
            aria-label="Página anterior"
            ${ui.historyPage === 1 ? 'disabled' : ''}
          >
            ${icon('chevron_left')}</button
          ><button
            data-action="history-page"
            data-id="${ui.historyPage + 1}"
            aria-label="Próxima página"
            ${ui.historyPage === pages ? 'disabled' : ''}
          >
            ${icon('chevron_right')}
          </button>
        </div>
      </footer>
    </div>
  </section>`;
}
