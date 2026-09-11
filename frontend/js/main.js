/** Coordena navegação, eventos da interface e estado confirmado pela API local. */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/material-symbols-outlined/400.css';
import '../css/base.css';
import '../css/layout.css';
import '../css/components.css';
import { loadState, save } from './api.js';
import { currentPage, navigate, navigation } from './router.js';
import { icon, escapeHtml as e, toast, localDate } from './components/ui.js';
import { openForm, formPayload } from './components/forms.js';
import { closeDialog } from './components/modal.js';
import { viewDocument, downloadDocument } from './components/documents.js';
import { renderToday } from './pages/today.js';
import { renderFamily } from './pages/family.js';
import { renderMedicines } from './pages/medicines.js';
import { renderHistory } from './pages/history.js';
import { renderDocuments } from './pages/documents.js';

let state;
const ui = {
  memberId: '',
  medicineMember: 'all',
  historyMember: 'all',
  historySearch: '',
  historyPage: 1,
  documentMember: 'all',
  documentCategory: 'all',
  documentSearch: '',
};
const screens = {
  today: renderToday,
  family: renderFamily,
  medicines: renderMedicines,
  history: renderHistory,
  documents: renderDocuments,
};
let theme = 'light';
try {
  theme =
    localStorage.getItem('help-family-theme') ||
    localStorage.getItem('cura-family-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch {
  /* Use default if storage is disabled. */
}
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === 'dark' ? '#0f0f0f' : '#f4f1ea';
}
applyTheme();
function render() {
  if (!state) return;
  const page = currentPage();
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
  document.querySelector('#app').innerHTML = /* HTML */ `<main class="help-app">
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
async function mutate(resource, body, id, method) {
  state = await save(resource, body, id, method);
  render();
}
document.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id } = target.dataset;
  try {
    switch (action) {
      case 'theme':
        theme = theme === 'dark' ? 'light' : 'dark';
        try {
          localStorage.setItem('help-family-theme', theme);
        } catch {}
        applyTheme();
        render();
        break;
      case 'close-dialog':
        closeDialog();
        break;
      case 'select-member':
        ui.memberId = id;
        render();
        break;
      case 'member-new':
        openForm('member', state);
        break;
      case 'member-edit':
        openForm('member', state, id);
        break;
      case 'drug-new':
        openForm('drug', state);
        break;
      case 'drug-edit':
        openForm('drug', state, id);
        break;
      case 'presentation-new':
        openForm('presentation', state, undefined, { drugId: id });
        break;
      case 'routine-new':
        if (!state.members.length) {
          toast('Cadastre um familiar primeiro.');
          openForm('member', state);
          break;
        }
        if (!state.drugs.length) {
          toast('Cadastre um medicamento primeiro.');
          openForm('drug', state);
          break;
        }
        if (!state.presentations.length) {
          toast('Cadastre uma apresentação primeiro.');
          openForm('presentation', state, undefined, { drugId: state.drugs[0].id });
          break;
        }
        openForm('routine', state, undefined, { memberId: id || ui.memberId });
        break;
      case 'routine-edit':
        openForm('routine', state, id);
        break;
      case 'routine-toggle':
        await mutate(
          'routines',
          { active: state.routines.find((r) => r.id === id).active === false },
          id,
        );
        toast('Regra de uso atualizada.');
        break;
      case 'member-medicines':
        ui.medicineMember = id;
        navigate('medicines');
        break;
      case 'member-history':
        ui.historyMember = id;
        ui.historySearch = '';
        ui.historyPage = 1;
        navigate('history');
        break;
      case 'member-documents':
        ui.documentMember = id;
        ui.documentCategory = 'all';
        ui.documentSearch = '';
        navigate('documents');
        break;
      case 'history-page':
        ui.historyPage = Number(id);
        render();
        break;
      case 'dose': {
        const routine = state.routines.find((r) => r.id === id);
        const now = new Date();
        await mutate('dose-logs', {
          routineId: id,
          memberId: routine.memberId,
          date: localDate(now),
          scheduledTime: target.dataset.time,
          status: target.dataset.status,
          recordedAt: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        });
        toast('Dose registrada.');
        break;
      }
      case 'document-new':
        if (!state.members.length) {
          toast('Cadastre um familiar primeiro.');
          break;
        }
        openForm('document', state, undefined, { memberId: ui.documentMember });
        break;
      case 'document-view':
        await viewDocument(
          state.documents.find((d) => d.id === id),
          state,
        );
        break;
      case 'document-download':
        downloadDocument(
          state.documents.find((d) => d.id === id),
          state,
        );
        break;
      case 'document-delete':
        if (confirm('Excluir este documento deste computador?')) {
          await mutate('documents', {}, id, 'DELETE');
          closeDialog();
          toast('Documento excluído.');
        }
        break;
    }
  } catch (error) {
    toast(error.message);
  }
});
document.addEventListener('change', (event) => {
  const key = event.target.dataset.filter;
  if (key && Object.hasOwn(ui, key)) {
    ui[key] = event.target.value;
    ui.historyPage = 1;
    render();
  }
});
document.addEventListener('input', (event) => {
  const key = event.target.dataset.search;
  if (key && Object.hasOwn(ui, key)) {
    const start = event.target.selectionStart;
    ui[key] = event.target.value;
    ui.historyPage = 1;
    render();
    const replacement = document.querySelector(`[data-search="${key}"]`);
    replacement.focus();
    replacement.setSelectionRange(start, start);
  }
});
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-form]');
  if (!form) return;
  event.preventDefault();
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  form.querySelector('.form-error').textContent = '';
  try {
    const { resource, body } = await formPayload(form, state);
    await mutate(resource, body, form.dataset.id || undefined);
    if (form.isConnected) closeDialog();
    toast('Salvo neste dispositivo.');
  } catch (error) {
    form.querySelector('.form-error').textContent = error.message;
    submit.disabled = false;
  }
});
window.addEventListener('hashchange', () => {
  closeDialog();
  render();
});
window.addEventListener('storage', (event) => {
  if (event.key === 'help-family-theme') {
    theme = event.newValue === 'dark' ? 'dark' : 'light';
    applyTheme();
    render();
  }
});
setInterval(() => {
  if (currentPage() === 'today' && !document.querySelector('dialog')) render();
}, 60000);
try {
  state = await loadState();
  ui.memberId = state.members[0]?.id || '';
  render();
} catch (error) {
  document.querySelector('#app').innerHTML = /* HTML */ `<div class="load-error">
    <h1>help-family</h1>
    <p>${e(error.message)}</p>
    <p>Não foi possível acessar o banco local. Recarregue a página para tentar novamente.</p>
  </div>`;
}
