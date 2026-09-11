/** Visualização e download locais. Conteúdo textual nunca é interpretado como HTML. */
import { escapeHtml as e } from './ui.js';
import { mountDialog as mount, setDialogCleanup } from './modal.js';
function documentBlob(doc, state) {
  if (!doc.dataUrl) {
    if (doc.nativeDocumentId)
      throw new Error(
        'Este arquivo está no armazenamento do Android. Abra-o no aplicativo original.',
      );
    return new Blob(
      [
        `help-family\n\n${doc.title}\nFamiliar: ${state.members.find((m) => m.id === doc.memberId)?.name || ''}\nData: ${doc.date}\n\nDocumento de demonstração.`,
      ],
      { type: 'text/plain' },
    );
  }
  const comma = doc.dataUrl.indexOf(',');
  const bytes = doc.dataUrl.slice(0, comma).includes(';base64')
    ? Uint8Array.from(atob(doc.dataUrl.slice(comma + 1)), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(doc.dataUrl.slice(comma + 1)));
  return new Blob([bytes], { type: doc.mimeType });
}
export function downloadDocument(doc, state) {
  const url = URL.createObjectURL(documentBlob(doc, state));
  const link = document.createElement('a');
  link.href = url;
  link.download = doc.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function viewDocument(doc, state) {
  const blob = documentBlob(doc, state);
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
