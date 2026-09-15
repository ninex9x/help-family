/** Visualização e download locais. Conteúdo textual nunca é interpretado como HTML. */
import { escapeHtml as e } from './ui.js';
import { mountDialog as mount, setDialogCleanup } from './modal.js';
import { request } from '../api.js';
export function downloadDocument(id) {
  const link = document.createElement('a');
  link.href = `/api/files/${encodeURIComponent(id)}?download=1`;
  link.download = '';
  link.click();
}
export async function viewDocument(id) {
  const { item: doc } = await request(`/file-info/${encodeURIComponent(id)}`);
  const response = await fetch(`/api/files/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!response.ok) throw new Error((await response.json()).error);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const dialog = mount(
    doc.title,
    '<div class="document-preview"><p>Carregando documento…</p></div>',
    /* HTML */ `<footer>
      <button class="secondary-button" data-action="document-delete" data-id="${e(doc.id)}">
        Excluir documento</button
      ><button class="primary-button" data-action="document-download" data-id="${e(doc.id)}">
        Baixar
      </button>
    </footer>`,
  );
  setDialogCleanup(dialog, () => URL.revokeObjectURL(url));
  const content = dialog.querySelector('.document-preview');
  try {
    if (blob.type === 'application/pdf') {
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      const task = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
      setDialogCleanup(dialog, () => {
        task.destroy();
        URL.revokeObjectURL(url);
      });
      const pdf = await task.promise;
      if (!dialog.isConnected) {
        task.destroy();
        return;
      }
      content.replaceChildren();
      for (let index = 1; index <= pdf.numPages && dialog.isConnected; index++) {
        const page = await pdf.getPage(index);
        const canvas = document.createElement('canvas');
        const viewport = page.getViewport({ scale: 1.3 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.setAttribute('aria-label', `Página ${index}`);
        content.append(canvas);
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    } else if (blob.type.startsWith('image/')) {
      const img = new Image();
      img.alt = doc.title;
      img.src = url;
      content.replaceChildren(img);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = await blob.text();
      content.replaceChildren(pre);
    }
  } catch {
    if (dialog.isConnected)
      content.textContent = 'Não foi possível visualizar. Use Baixar para abrir o arquivo.';
  }
}
