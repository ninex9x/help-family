/** Agenda por familiar: destaca a primeira dose pendente e resume as confirmações do dia. */
import {
  avatar,
  button,
  empty,
  escapeHtml as e,
  icon,
  localDate,
  formatDose,
} from '../components/ui.js';

/** Usa o mesmo comando no destaque e na agenda, mantendo horário e rotina explícitos. */
function doseButton(dose, status, label, className, ariaLabel = label) {
  return /* HTML */ `<button
    class="${className}"
    data-action="dose"
    data-id="${e(dose.routine.id)}"
    data-time="${e(dose.time)}"
    data-status="${status}"
    aria-label="${e(ariaLabel)}"
  >
    ${icon(status === 'taken' ? 'check' : 'close')}${className === 'quick-dose-button' ? '' : e(label)}
  </button>`;
}
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
  const focus = doses.find((dose) => !dose.log);
  const drug = focus && formatDose(state, focus.routine);
  const late = focus?.time < clock;
  return /* HTML */ `<section class="greeting-section">
      <h1>${greeting}!</h1>
      <p>
        ${icon('calendar_today')}${e(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(now))}
      </p>
    </section>
    <section class="family-selector-section" aria-label="Selecionar familiar">
      <h2>Familiares acompanhados</h2>
      <div class="family-selector">
        ${state.members.map((item) => /* HTML */ `<button class="family-option ${item.id === member?.id ? 'selected' : ''}" data-action="select-member" data-id="${e(item.id)}" aria-pressed="${item.id === member?.id}" aria-label="Selecionar ${e(item.name)}"><span class="family-avatar-ring">${avatar(item, 'avatar-family')}</span><span>${e(item.name)}</span></button>`).join('')}
        <button
          class="family-option add-family-option"
          data-action="member-new"
          aria-label="Adicionar Familiar"
        >
          <span class="family-avatar-ring"
            ><span class="avatar avatar-family add-avatar">${icon('add')}</span></span
          ><span>Novo</span>
        </button>
      </div>
    </section>
    <section class="daily-progress-card">
      <div>
        <h2>Progresso Diário</h2>
        <p>${taken} de ${doses.length} doses tomadas${member ? ` por ${e(member.name)}` : ''}</p>
      </div>
      <strong>${progress}%</strong>
      <div
        class="progress-bar"
        role="progressbar"
        aria-label="Progresso diário"
        aria-valuenow="${progress}"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span style="width:${progress}%"></span>
      </div>
    </section>
    ${
      focus
        ? /* HTML */ `<section
            class="next-dose-section ${late ? 'late' : 'upcoming'}"
            aria-label="Dose em destaque"
          >
            <div class="dose-alert-label">
              ${icon(late ? 'schedule' : 'notifications_active')}${late ? 'Dose atrasada' : 'Próxima dose'}
            </div>
            <article class="next-dose-card">
              <div class="next-dose-title">
                <span class="dose-main-icon">${icon('medication')}</span>
                <div>
                  <h2>${e(drug.name)}</h2>
                  <p>${e(drug.strength)} · ${e(focus.routine.quantity)}</p>
                </div>
              </div>
              <div class="dose-details-grid">
                <div><small>Horário programado</small><strong>${e(focus.time)}</strong></div>
                <div><small>Familiar</small><strong>${e(member?.name)}</strong></div>
                ${focus.routine.instruction ? /* HTML */ `<p>${icon('info')}${e(focus.routine.instruction)}</p>` : ''}
              </div>
              <div class="dose-action-buttons">
                ${doseButton(focus, 'taken', 'Registrar tomada', 'confirm-dose-button')}${doseButton(focus, 'skipped', 'Não foi tomada', 'skip-dose-button')}
              </div>
            </article>
          </section>`
        : doses.length
          ? /* HTML */ `<section class="all-done-card">
              ${icon('task_alt')}
              <div>
                <h2>Registros do dia concluídos</h2>
                <p>
                  ${taken === doses.length ? 'Todas as doses foram marcadas como tomadas.' : 'Todas as doses têm registro. Consulte os detalhes na agenda.'}
                </p>
              </div>
            </section>`
          : ''
    }
    <section class="today-agenda-section">
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
                return /* HTML */ `<section class="agenda-period">
                  <h3>${icon(['light_mode', 'wb_sunny', 'dark_mode'][index])}${period}</h3>
                  <div class="agenda-list">
                    ${entries
                      .map((dose) => {
                        const drug = formatDose(state, dose.routine);
                        const status = dose.log?.status || (dose.time < clock ? 'late' : 'pending');
                        return /* HTML */ `<article class="agenda-item ${status}">
                          <time>${e(dose.time)}</time
                          ><span class="agenda-status-icon"
                            >${icon({ taken: 'check', skipped: 'close', late: 'priority_high', pending: 'schedule' }[status])}</span
                          >
                          <div>
                            <h4>${e(drug.name)} <span>${e(drug.strength)}</span></h4>
                            <p>${e(member?.name)} · ${e(dose.routine.quantity)}</p>
                          </div>
                          <span class="agenda-status-label"
                            >${{ taken: 'Tomada', skipped: 'Não tomada', late: 'Atrasada', pending: 'Pendente' }[status]}</span
                          >${doseButton(dose, dose.log?.status === 'taken' ? 'skipped' : 'taken', '', 'quick-dose-button', `${dose.log?.status === 'taken' ? 'Marcar não tomada' : 'Registrar tomada'}: ${drug.name} às ${dose.time}`)}
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
