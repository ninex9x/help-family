/** Um cartão por medicamento reúne apresentações e regras, evitando duplicar o catálogo. */
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
  const drugs = state.drugs.filter(
    (drug) => ui.medicineMember === 'all' || routines.some((r) => r.drugId === drug.id),
  );
  return /* HTML */ `<section class="medication-management-page">
    <header class="medication-page-heading">
      <div>
        <h1>Medicamentos</h1>
        <p>Gerencie o catálogo e as regras de uso da sua família.</p>
      </div>
      ${button(`${icon('add')}Cadastrar Medicamento`, 'drug-new')}
    </header>
    <div class="filter-bar">
      ${memberFilter(state, ui.medicineMember, 'medicineMember')}${button(`${icon('add')}Criar Regra de Uso`, 'routine-new', ui.medicineMember === 'all' ? '' : ui.medicineMember, 'text-button')}
    </div>
    <div class="medication-bento-grid">
      ${
        drugs
          .map((drug) => {
            const presentations = state.presentations.filter((p) => p.drugId === drug.id);
            const linked = routines.filter((r) => r.drugId === drug.id);
            return /* HTML */ `<article class="medication-glass-card catalog-drug-card">
              <div
                class="medication-card-decoration"
                style="background:${e(drug.color)}"
                aria-hidden="true"
              ></div>
              <header class="medication-card-header">
                <div class="medication-card-person">
                  <span
                    class="medication-feature-icon"
                    style="background:${e(drug.color)}1f;color:${e(drug.color)}"
                    >${icon(/insulina|gota|xarope|líquido/i.test(drug.name) ? 'medication_liquid' : 'pill')}</span
                  >
                  <div>
                    <h2 title="${e(drug.name)}">${e(drug.name)}</h2>
                    <p>
                      ${presentations.length}
                      ${presentations.length === 1 ? 'apresentação' : 'apresentações'}
                    </p>
                  </div>
                </div>
                <button
                  class="family-more-button"
                  data-action="drug-edit"
                  data-id="${e(drug.id)}"
                  aria-label="Editar medicamento ${e(drug.name)}"
                >
                  ${icon('edit')}
                </button>
              </header>
              <div class="catalog-presentations">
                <small>Apresentações</small>
                <div>
                  ${presentations.map((p) => /* HTML */ `<span>${e(p.strength)} · ${e(p.form)}</span>`).join('') || '<p class="catalog-no-routines">Adicione a primeira apresentação.</p>'}
                </div>
              </div>
              <div class="catalog-routines">
                <small>Regras de uso</small>${
                  linked
                    .map((routine) => {
                      const member = state.members.find((m) => m.id === routine.memberId);
                      const dose = formatDose(state, routine);
                      return /* HTML */ `<div
                        class="catalog-routine-row ${routine.active === false ? 'inactive' : ''}"
                      >
                        <div>
                          <strong>${e(member?.name)}</strong
                          ><span>${e(dose.strength)} · ${e(routine.quantity)}</span
                          ><small>${icon('schedule')}${routine.times.map(e).join(' · ')}</small>
                        </div>
                        <button
                          class="routine-edit-button"
                          data-action="routine-edit"
                          data-id="${e(routine.id)}"
                          aria-label="Editar regra de ${e(member?.name)} para ${e(drug.name)}"
                        >
                          ${icon('edit')}</button
                        ><button
                          class="medicine-switch"
                          role="switch"
                          aria-checked="${routine.active !== false}"
                          aria-label="Ativar regra de ${e(member?.name)} para ${e(drug.name)}"
                          data-action="routine-toggle"
                          data-id="${e(routine.id)}"
                        >
                          <span></span>
                        </button>
                      </div>`;
                    })
                    .join('') ||
                  '<p class="catalog-no-routines">Nenhuma regra de uso vinculada.</p>'
                }
              </div>
              <footer class="catalog-card-actions">
                ${button(`${icon('add_circle')}Apresentação`, 'presentation-new', drug.id, 'secondary-button')}<button
                  data-action="routine-new"
                  data-drug-id="${e(drug.id)}"
                  data-id="${e(ui.medicineMember === 'all' ? '' : ui.medicineMember)}"
                >
                  ${icon('link')}Vincular
                </button>
              </footer>
            </article>`;
          })
          .join('') ||
        empty('Nenhum medicamento para este filtro. Cadastre um medicamento para começar.')
      }
    </div>
  </section>`;
}
