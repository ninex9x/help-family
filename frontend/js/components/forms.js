/** Exibe o formulário do servidor e serializa entradas sem normalizar ou decidir regras. */
import { request, acceptRevision } from '../api.js';
import { mountDialog } from './modal.js';
import { readFile } from './files.js';
import { toast } from './ui.js';
export async function openForm(kind, id, context = {}) {
  const result = await request(
    `/forms/${encodeURIComponent(kind)}?${new URLSearchParams({ ...context, ...(id ? { id } : {}) })}`,
  );
  acceptRevision(result.revision);
  const dialog = mountDialog(result.title, result.html);
  dialog.classList.add('form-dialog');
  dialog.dataset.formKind = result.kind;
  if (result.notice) toast(result.notice);
  let selection = 0;
  dialog.addEventListener('change', async (event) => {
    if (event.target.name !== 'drugId' || result.kind !== 'routine') return;
    const ticket = ++selection;
    const select = dialog.querySelector('[name="presentationId"]');
    select.disabled = true;
    try {
      const options = await request(
        `/forms/presentations?${new URLSearchParams({ drugId: event.target.value })}`,
      );
      if (ticket === selection && dialog.isConnected) select.innerHTML = options.html;
    } catch (error) {
      toast(error.message);
    } finally {
      if (ticket === selection) select.disabled = false;
    }
  });
}
export async function formPayload(form) {
  const payload = {};
  for (const [name, value] of new FormData(form)) {
    if (value instanceof File) {
      if (value.name)
        payload[name] = { name: value.name, type: value.type, dataUrl: await readFile(value) };
    } else payload[name] = value;
  }
  return payload;
}
