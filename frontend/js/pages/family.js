/** Apresenta perfis e pontos de entrada para os cuidados de cada familiar. */
import { avatar, button, empty, escapeHtml as e, icon } from '../components/ui.js';
export function renderFamily(state) {
  return /* HTML */ `<section class="page-heading">
      <div>
        <span class="eyebrow">QUEM VOCÊ CUIDA</span>
        <h1>Meus Familiares</h1>
        <p>Perfis e cuidados de quem está perto de você.</p>
      </div>
      ${button(`${icon('add')}Adicionar Familiar`, 'member-new')}
    </section>
    <div class="family-bento-grid">
      ${
        state.members
          .map((member) => {
            const routines = state.routines.filter(
              (r) => r.memberId === member.id && r.active !== false,
            );
            return /* HTML */ `<article class="family-profile-card">
              <div class="profile-heading">
                ${avatar(member, 'avatar-large')}
                <div>
                  <h2>${e(member.name)}</h2>
                  <p>${e(member.relationship)}</p>
                </div>
                ${button(icon('edit'), 'member-edit', member.id, 'icon-button')}
              </div>
              <p>${routines.length} rotinas ativas</p>
              <p class="medical-notes">
                ${e(member.medicalNotes || 'Nenhuma observação cadastrada.')}
              </p>
              <div class="profile-actions">
                ${button('Medicamentos', 'member-medicines', member.id, 'secondary-button')}${button('Ver Histórico', 'member-history', member.id, 'secondary-button')}${button('Ver Documentos', 'member-documents', member.id, 'secondary-button')}
              </div>
              ${button(`${icon('add')}Criar Regra de Uso`, 'routine-new', member.id, 'family-medicine-button')}
            </article>`;
          })
          .join('') || empty('Adicione o primeiro familiar para começar.')
      }
    </div>`;
}
