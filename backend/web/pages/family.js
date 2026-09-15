/** Perfis com progresso diário calculado somente sobre as regras de uso ativas. */
import { avatar, button, escapeHtml as e, icon, localDate } from '../components/ui.js';
export function renderFamily(state) {
  const today = localDate();
  return /* HTML */ `<section class="family-page">
    <header class="family-page-heading">
      <div>
        <h1>Familiares</h1>
        <p>Gerencie os perfis de quem você cuida.</p>
      </div>
      ${button(`${icon('add')}Adicionar Familiar`, 'member-new')}
    </header>
    <div class="family-bento-grid">
      ${state.members
        .map((member) => {
          const routines = state.routines.filter(
            (r) => r.memberId === member.id && r.active !== false,
          );
          const doses = routines.flatMap((routine) =>
            routine.times.map((time) => ({ routine, time })),
          );
          const taken = doses.filter(({ routine, time }) =>
            state.logs.some(
              (log) =>
                log.routineId === routine.id &&
                log.date === today &&
                log.scheduledTime === time &&
                log.status === 'taken',
            ),
          ).length;
          const progress = doses.length ? Math.round((taken / doses.length) * 100) : 0;
          const medicines = new Set(routines.map((r) => r.drugId)).size;
          return /* HTML */ `<article class="family-profile-card">
            <div class="family-card-decoration" aria-hidden="true"></div>
            <header class="family-card-header">
              <div class="family-card-person">
                ${avatar(member, 'family-card-avatar')}
                <div>
                  <h2 title="${e(member.name)}">${e(member.name)}</h2>
                  <p>${e(member.relationship)}</p>
                </div>
              </div>
              <button
                class="family-more-button"
                data-action="member-edit"
                data-id="${e(member.id)}"
                aria-label="Editar familiar"
              >
                ${icon('edit')}
              </button>
            </header>
            <div class="family-dose-summary">
              <div>
                <span
                  >${icon('medication')}${medicines}
                  ${medicines === 1 ? 'medicamento ativo' : 'medicamentos ativos'}</span
                ><strong class="${progress === 100 ? 'complete' : ''}"
                  >${taken}/${doses.length} doses hoje</strong
                >
              </div>
              <div
                class="family-progress-track"
                role="progressbar"
                aria-label="Doses de ${e(member.name)}"
                aria-valuenow="${progress}"
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <span style="width:${progress}%"></span>
              </div>
            </div>
            ${member.medicalNotes ? /* HTML */ `<p class="family-medical-note">${icon('medical_information')}<span>${e(member.medicalNotes)}</span></p>` : ''}
            <div class="family-card-actions">
              ${button(`${icon('medication')}Medicamentos`, 'member-medicines', member.id, 'family-medicine-button')}${button(`Ver Histórico${icon('arrow_forward')}`, 'member-history', member.id, 'family-history-button')}${button(`${icon('folder_open')}Ver Documentos`, 'member-documents', member.id, 'family-documents-button')}
            </div>
          </article>`;
        })
        .join('')}<button class="family-add-card" data-action="member-new">
        <span>${icon('group_add')}</span><strong>Adicionar novo familiar</strong>
        <p>Cuide de quem é importante para você.</p>
      </button>
    </div>
  </section>`;
}
