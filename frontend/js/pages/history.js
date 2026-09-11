/** Filtra e pagina em memória os registros de doses confirmados pela API. */
import {
  escapeHtml as e,
  icon,
  empty,
  memberFilter,
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
  ui.historyPage = Math.min(ui.historyPage, pages);
  return /* HTML */ `<section class="page-heading">
      <div>
        <span class="eyebrow">ACOMPANHAMENTO</span>
        <h1>Histórico de Registros</h1>
        <p>Consulte as doses registradas para cada familiar.</p>
      </div>
    </section>
    <section class="filter-bar">
      ${memberFilter(state, ui.historyMember, 'historyMember')}<label class="search-field"
        >${icon('search')}<input
          type="search"
          placeholder="Buscar medicamento"
          aria-label="Buscar medicamento no histórico"
          data-search="historySearch"
          value="${e(ui.historySearch)}"
      /></label>
    </section>
    ${
      entries.length
        ? /* HTML */ `<div class="table-scroll">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Familiar</th>
                    <th>Medicamento</th>
                    <th>Horário</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${entries
                    .slice((ui.historyPage - 1) * 10, ui.historyPage * 10)
                    .map(
                      (log) =>
                        /* HTML */ `<tr>
                          <td>${dateLabel(log.date)}</td>
                          <td>${e(state.members.find((m) => m.id === log.memberId)?.name)}</td>
                          <td>${e(formatDose(state, log.routine).name)}</td>
                          <td>
                            ${e(log.scheduledTime)}<small>Registrada ${e(log.recordedAt)}</small>
                          </td>
                          <td>
                            <span class="status-badge ${log.status}"
                              >${log.status === 'taken' ? 'Tomada' : 'Não foi tomada'}</span
                            >
                          </td>
                        </tr>`,
                    )
                    .join('')}
                </tbody>
              </table>
            </div>
            <div class="history-pagination">
              <span>${entries.length} registros · Página ${ui.historyPage} de ${pages}</span>
              <div>
                <button
                  data-action="history-page"
                  data-id="${ui.historyPage - 1}"
                  ${ui.historyPage === 1 ? 'disabled' : ''}
                >
                  Anterior</button
                ><button
                  data-action="history-page"
                  data-id="${ui.historyPage + 1}"
                  ${ui.historyPage === pages ? 'disabled' : ''}
                >
                  Próxima
                </button>
              </div>
            </div>`
        : empty('Nenhum registro encontrado.')
    }`;
}
