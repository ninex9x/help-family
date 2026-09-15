/** Coordena navegação, eventos da interface e estado confirmado pela API local. */
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/material-symbols-outlined/400.css';
import '../css/base.css';
import '../css/layout.css';
import '../css/components.css';
import '../css/forms.css';
import '../css/pages/today.css';
import '../css/pages/family.css';
import '../css/pages/medicines.css';
import '../css/pages/history.css';
import '../css/pages/documents.css';
import { request, acceptRevision, command } from './api.js';
import { currentPage, navigate } from './router.js';
import { toast, escapeHtml as e } from './components/ui.js';
import { openForm, formPayload } from './components/forms.js';
import { closeDialog } from './components/modal.js';
import { viewDocument, downloadDocument } from './components/documents.js';

// Estado exclusivamente visual. Não guarda registros clínicos, permissões ou resultados calculados.
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
let renderId = 0;
let theme = 'light';
try {
  theme =
    localStorage.getItem('help-family-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch {}
function applyTheme() {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]').content =
    theme === 'dark' ? '#0f0f0f' : '#f4f1ea';
}
applyTheme();
async function render() {
  const ticket = ++renderId;
  const result = await request(`/views/${currentPage()}?${new URLSearchParams({ ...ui, theme })}`);
  if (ticket !== renderId) return;
  // Mantém foco e seleção ao substituir o fragmento após uma busca assíncrona.
  const focused = document.activeElement;
  const search = focused?.dataset.search;
  const start = focused?.selectionStart;
  const end = focused?.selectionEnd;
  acceptRevision(result.revision);
  document.querySelector('#app').innerHTML = result.html;
  if (search) {
    const input = document.querySelector(`[data-search="${search}"]`);
    input?.focus({ preventScroll: true });
    input?.setSelectionRange(start, end);
  }
}
async function mutate(path, body, method) {
  renderId++;
  await command(path, body, method);
  await render();
}
const report = (error) => toast(error.message);
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
        await render();
        break;
      case 'close-dialog':
        closeDialog();
        break;
      case 'filter': {
        const key = target.dataset.filterKey;
        if (!Object.hasOwn(ui, key)) break;
        ui[key] = target.dataset.value;
        ui.historyPage = 1;
        await render();
        document
          .querySelector(`[data-filter-key="${key}"][aria-pressed="true"]`)
          ?.focus({ preventScroll: true });
        break;
      }
      case 'select-member':
        ui.memberId = id;
        await render();
        break;
      case 'member-new':
        await openForm('member');
        break;
      case 'member-edit':
        await openForm('member', id);
        break;
      case 'drug-new':
        await openForm('drug');
        break;
      case 'drug-edit':
        await openForm('drug', id);
        break;
      case 'presentation-new':
        await openForm('presentation', undefined, { drugId: id });
        break;
      case 'routine-new':
        await openForm('routine', undefined, {
          memberId: id || ui.memberId,
          drugId: target.dataset.drugId || '',
        });
        break;
      case 'routine-edit':
        await openForm('routine', id);
        break;
      case 'routine-toggle':
        await mutate(`/actions/routines/${encodeURIComponent(id)}/toggle`, {});
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
        ui.historyPage = id;
        await render();
        break;
      case 'dose':
        await mutate('/actions/doses', {
          routineId: id,
          scheduledTime: target.dataset.time,
          status: target.dataset.status,
        });
        toast('Dose registrada.');
        break;
      case 'document-new':
        await openForm('document', undefined, { memberId: ui.documentMember });
        break;
      case 'document-view':
        await viewDocument(id);
        break;
      case 'document-download':
        downloadDocument(id);
        break;
      case 'document-delete':
        if (confirm('Excluir este documento deste computador?')) {
          await mutate(`/documents/${encodeURIComponent(id)}`, {}, 'DELETE');
          closeDialog();
          toast('Documento excluído.');
        }
        break;
    }
  } catch (error) {
    report(error);
  }
});
document.addEventListener('change', (event) => {
  const key = event.target.dataset.filter;
  if (key && Object.hasOwn(ui, key)) {
    ui[key] = event.target.value;
    ui.historyPage = 1;
    render().catch(report);
  }
});
document.addEventListener('input', (event) => {
  const key = event.target.dataset.search;
  if (key && Object.hasOwn(ui, key)) {
    ui[key] = event.target.value;
    ui.historyPage = 1;
    render().catch(report);
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
    await mutate(
      `/actions/forms/${encodeURIComponent(form.dataset.form)}?${new URLSearchParams({ id: form.dataset.id || '' })}`,
      await formPayload(form),
    );
    if (form.isConnected) closeDialog();
    toast('Salvo neste dispositivo.');
  } catch (error) {
    form.querySelector('.form-error').textContent = error.message;
    submit.disabled = false;
  }
});
window.addEventListener('hashchange', () => {
  closeDialog();
  render().catch(report);
});
window.addEventListener('storage', (event) => {
  if (event.key === 'help-family-theme') {
    theme = event.newValue === 'dark' ? 'dark' : 'light';
    applyTheme();
    render().catch(report);
  }
});
setInterval(() => {
  if (currentPage() === 'today' && !document.querySelector('dialog')) render().catch(report);
}, 60000);
try {
  await render();
} catch (error) {
  document.querySelector('#app').innerHTML =
    `<div class="load-error"><h1>help-family</h1><p>${e(error.message)}</p><p>Não foi possível acessar o servidor local. Recarregue para tentar novamente.</p></div>`;
}
