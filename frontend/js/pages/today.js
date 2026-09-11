/** Apresenta as doses do dia, divididas por período e filtradas por familiar. */
import {
  avatar,
  button,
  empty,
  escapeHtml as e,
  icon,
  localDate,
  formatDose,
} from '../components/ui.js';
export function renderToday(state, ui) {
  const today = localDate();
  const member = state.members.find((item) => item.id === ui.memberId) ?? state.members[0];
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const doses = state.routines
    .filter((r) => r.memberId === member?.id && r.active !== false)
    .flatMap((routine) =>
      routine.times.map((time) => ({
        routine,
        time,
        log: state.logs.find(
          (log) => log.routineId === routine.id && log.date === today && log.scheduledTime === time,
        ),
      })),
    )
    .sort((a, b) => a.time.localeCompare(b.time));
  const taken = doses.filter((dose) => dose.log?.status === 'taken').length;
  const progress = doses.length ? Math.round((taken / doses.length) * 100) : 0;
  const greeting =
    now.getHours() < 12 ? 'Bom dia' : now.getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  return /* HTML */ `<section class="greeting-section">
      <h1>${greeting}!</h1>
      <p>
        ${icon('calendar_today')}${e(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now))}
      </p>
    </section>
    <section class="family-selector-section">
      <div class="section-heading">
        <h2>Familiares acompanhados</h2>
        ${button('Adicionar Familiar', 'member-new', '', 'text-button')}
      </div>
      <div class="family-selector">
        ${state.members.map((item) => /* HTML */ `<button class="member-chip ${item.id === member?.id ? 'selected' : ''}" data-action="select-member" data-id="${e(item.id)}">${avatar(item)}<span>${e(item.name)}</span></button>`).join('')}
      </div>
    </section>
    <section class="daily-progress-card">
      <div>
        <span class="eyebrow">CUIDADO DIÁRIO</span>
        <h2>Progresso Diário</h2>
        <p>${taken} de ${doses.length} doses tomadas${member ? ` por ${e(member.name)}` : ''}</p>
      </div>
      <div class="progress-meter">
        <strong>${progress}%</strong
        ><progress value="${progress}" max="100" aria-label="Doses tomadas"></progress>
      </div>
    </section>
    <section class="agenda-section">
      <div class="section-heading">
        <h2>Agenda de Hoje</h2>
        ${button('Criar Regra de Uso', 'routine-new', member?.id || '', 'text-button')}
      </div>
      ${
        !doses.length
          ? empty('Nenhuma dose agendada. Cadastre um familiar, medicamento e regra de uso.')
          : ['Manhã', 'Tarde', 'Noite']
              .map((period, index) => {
                const entries = doses.filter((d) =>
                  index === 0
                    ? d.time < '12:00'
                    : index === 1
                      ? d.time >= '12:00' && d.time < '18:00'
                      : d.time >= '18:00',
                );
                if (!entries.length) return '';
                return /* HTML */ `<section class="period-section">
                  <h3>${icon(['light_mode', 'wb_sunny', 'dark_mode'][index])}${period}</h3>
                  <div class="dose-list">
                    ${entries
                      .map(({ routine, time, log }) => {
                        const drug = formatDose(state, routine);
                        return /* HTML */ `<article
                          class="dose-card ${log ? 'dose-completed' : ''}"
                        >
                          <div class="dose-time">${e(time)}</div>
                          <div class="dose-info">
                            <h3>${e(drug.name)}</h3>
                            <p>${e(drug.strength)} · ${e(routine.quantity)}</p>
                            <small>${e(routine.instruction)}</small
                            >${!log && time < clock ? '<span class="status-badge late">Pendente</span>' : ''}
                          </div>
                          <div class="dose-actions">
                            ${log ? /* HTML */ `<span class="status-badge">${log.status === 'taken' ? 'Tomada' : 'Não foi tomada'}</span>` : ''}<button
                              class="${log ? 'text-button' : 'primary-button'}"
                              data-action="dose"
                              data-id="${e(routine.id)}"
                              data-time="${e(time)}"
                              data-status="taken"
                            >
                              ${icon('check')} ${log ? 'Marcar tomada' : 'Tomei'}</button
                            ><button
                              class="text-button"
                              data-action="dose"
                              data-id="${e(routine.id)}"
                              data-time="${e(time)}"
                              data-status="skipped"
                            >
                              Não foi tomada
                            </button>
                          </div>
                        </article>`;
                      })
                      .join('')}
                  </div>
                </section>`;
              })
              .join('')
      }
    </section>`;
}
