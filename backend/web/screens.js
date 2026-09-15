/** HTML das telas clínicas gerado exclusivamente no servidor. */
import { icon } from './components/ui.js';
import { renderToday } from './pages/today.js';
import { renderFamily } from './pages/family.js';
import { renderMedicines } from './pages/medicines.js';
import { renderHistory } from './pages/history.js';
import { renderDocuments } from './pages/documents.js';
export const screens = {
  today: renderToday,
  family: renderFamily,
  medicines: renderMedicines,
  history: renderHistory,
  documents: renderDocuments,
};
const navigation = [
  ['today', 'Hoje', 'today'],
  ['family', 'Familiares', 'family_restroom'],
  ['medicines', 'Medicamentos', 'medication'],
  ['history', 'Histórico', 'history'],
  ['documents', 'Documentos', 'description'],
];
export function renderScreen(page, state, ui, theme) {
  const label = theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro';
  const themeButton = /* HTML */ `<button
    class="theme-toggle"
    data-action="theme"
    aria-label="${label}"
  >
    ${icon(theme === 'dark' ? 'light_mode' : 'dark_mode')}<span
      >${theme === 'dark' ? 'Modo claro' : 'Modo escuro'}</span
    >
  </button>`;
  const links = navigation
    .map(
      ([id, label, glyph]) =>
        /* HTML */ `<a
          href="#${id}"
          class="${id === page ? 'active' : ''}"
          ${id === page ? 'aria-current="page"' : ''}
          >${icon(glyph)}<span>${label}</span></a
        >`,
    )
    .join('');
  return /* HTML */ `<main class="help-app">
    <aside class="desktop-sidebar">
      <a class="brand-block" href="#today"
        ><strong>help-family</strong><span>Gestão de Saúde</span></a
      >
      <nav class="desktop-navigation" aria-label="Navegação principal">${links}</nav>
      <div class="sidebar-footer-actions">
        ${themeButton}<small>${icon('lock')} Dados neste dispositivo</small>
      </div>
    </aside>
    <section class="app-canvas">
      <header class="mobile-topbar">
        <a class="mobile-brand" href="#today">help-family</a>${themeButton}
      </header>
      <div class="content-container">
        ${screens[page](state, ui)}
        <footer class="app-disclaimer">
          ${icon('health_and_safety')}Este aplicativo não substitui orientação médica.
        </footer>
      </div>
    </section>
    <nav class="mobile-bottom-nav" aria-label="Navegação móvel">${links}</nav>
  </main>`;
}
