/** Apresenta catálogo, apresentações e rotinas; as ações são tratadas pelo coordenador. */
import {
  button,
  empty,
  escapeHtml as e,
  icon,
  memberFilter,
  formatDose,
} from '../components/ui.js';
export function renderMedicines(state, ui) {
  const routines = state.routines.filter(
    (r) => ui.medicineMember === 'all' || r.memberId === ui.medicineMember,
  );
  return /* HTML */ `<section class="page-heading">
      <div>
        <span class="eyebrow">ROTINA DE CUIDADOS</span>
        <h1>Medicamentos</h1>
        <p>Organize o catálogo e as regras de uso da família.</p>
      </div>
      ${button(`${icon('add')}Cadastrar Medicamento`, 'drug-new')}
    </section>
    <section class="filter-bar">
      ${memberFilter(state, ui.medicineMember, 'medicineMember')}${button('Criar Regra de Uso', 'routine-new')}
    </section>
    <div class="medication-bento-grid">
      ${
        routines
          .map((routine) => {
            const drug = formatDose(state, routine);
            const member = state.members.find((item) => item.id === routine.memberId);
            return /* HTML */ `<article class="medication-glass-card">
              <span class="eyebrow">${e(member?.name)}</span>
              <h2>${e(drug.name)}</h2>
              <p>${e(drug.strength)} · ${e(drug.form)}</p>
              <strong>${e(routine.quantity)}</strong>
              <div class="time-tags">
                ${routine.times.map((time) => /* HTML */ `<span>${e(time)}</span>`).join('')}
              </div>
              <p>${e(routine.instruction)}</p>
              <div class="card-footer">
                <span>${routine.active === false ? 'Pausado' : 'Ativo'}</span
                >${button(routine.active === false ? 'Reativar' : 'Pausar', 'routine-toggle', routine.id, 'secondary-button')}${button('Editar', 'routine-edit', routine.id, 'text-button')}
              </div>
            </article>`;
          })
          .join('') || empty('Nenhuma regra de uso para este filtro.')
      }
    </div>
    <section class="catalog-section">
      <div class="section-heading"><h2>Catálogo de medicamentos</h2></div>
      ${
        state.drugs
          .map(
            (drug) =>
              /* HTML */ `<article class="catalog-item">
                <div>
                  <h3>${e(drug.name)}</h3>
                  <div class="time-tags">
                    ${state.presentations
                      .filter((p) => p.drugId === drug.id)
                      .map((p) => /* HTML */ `<span>${e(p.strength)} · ${e(p.form)}</span>`)
                      .join('')}
                  </div>
                </div>
                <div class="catalog-card-actions">
                  ${button('Nova apresentação', 'presentation-new', drug.id, 'secondary-button')}${button('Editar', 'drug-edit', drug.id, 'text-button')}
                </div>
              </article>`,
          )
          .join('') || empty('Cadastre um medicamento e suas apresentações.')
      }
    </section>`;
}
