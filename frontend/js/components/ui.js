/** HTML compartilhado, escape de valores, formatação e notificações acessíveis. */
/** Use para todo valor dinâmico inserido em texto ou atributo HTML entre aspas. */
export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char],
  );
export const icon = (name) =>
  /* HTML */ `<span class="material-symbols-outlined" aria-hidden="true"
    >${escapeHtml(name)}</span
  >`;
let toastTimer;
export function toast(message) {
  const container = document.querySelector('#notifications');
  container.innerHTML = /* HTML */ `<div class="toast">
    ${icon('info')}<span>${escapeHtml(message)}</span>
  </div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => container.replaceChildren(), 5000);
}
