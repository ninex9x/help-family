/** Ciclo de vida dos diálogos: foco, tecla Escape e liberação de recursos. */
import { escapeHtml, icon } from './ui.js';
let opener;
let cleanup;
let currentDialog;

export function closeDialog() {
  cleanup?.();
  cleanup = undefined;
  currentDialog = undefined;
  document.querySelector('#dialogs').replaceChildren();
  opener?.focus();
}

/** Registra limpeza apenas para o diálogo que ainda está aberto. */
export function setDialogCleanup(dialog, callback) {
  if (dialog !== currentDialog) {
    callback();
    return;
  }
  cleanup = callback;
}

export function mountDialog(title, body, footer = '') {
  if (currentDialog) closeDialog();
  opener = document.activeElement;
  document.querySelector('#dialogs').innerHTML = /* HTML */ `<dialog
    class="app-dialog"
    aria-labelledby="dialog-title"
  >
    <header>
      <h2 id="dialog-title">${escapeHtml(title)}</h2>
      <button type="button" data-action="close-dialog" aria-label="Fechar">${icon('close')}</button>
    </header>
    ${body}${footer}
  </dialog>`;
  currentDialog = document.querySelector('dialog');
  currentDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeDialog();
  });
  currentDialog.showModal();
  currentDialog.querySelector('input:not([type="hidden"]), select, textarea')?.focus();
  return currentDialog;
}
