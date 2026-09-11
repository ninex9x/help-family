/** Formulários por entidade: coleta dados da interface; a API valida as regras definitivas. */
import { escapeHtml as e, options, localDate, categoryLabels } from './ui.js';
import { mountDialog as mount } from './modal.js';
import { readFile, memberPhoto } from './files.js';
const field = (label, name, value = '', type = 'text', extra = '') =>
  /* HTML */ `<label
    >${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}
  /></label>`;
const select = (label, name, items, value, formatter) =>
  /* HTML */ `<label
    >${label}<select name="${name}" aria-label="${e(label)}" required>
      ${options(items, value, formatter)}
    </select></label
  >`;
export function openForm(kind, state, id, context = {}) {
  const collection = {
    member: 'members',
    drug: 'drugs',
    routine: 'routines',
    presentation: 'presentations',
    document: 'documents',
  }[kind];
  const item = state[collection].find((entry) => entry.id === id) || {};
  let title, fields;
  if (kind === 'member') {
    title = item.id ? 'Editar Familiar' : 'Adicionar Familiar';
    fields = `${field('Nome', 'name', item.name, 'text', 'required maxlength="80"')}${field('Parentesco', 'relationship', item.relationship, 'text', 'required maxlength="40"')}${field('Cor do perfil', 'color', item.color || '#a43c12', 'color')}<label>Observações<textarea aria-label="Observações" name="medicalNotes" maxlength="2000">${e(item.medicalNotes)}</textarea></label><label>Foto<input name="photoFile" type="file" accept="image/jpeg,image/png,image/webp"></label>${item.photo ? '<label class="checkbox"><input name="removePhoto" type="checkbox">Remover foto atual</label>' : ''}`;
  } else if (kind === 'drug') {
    title = item.id ? 'Editar Medicamento' : 'Cadastrar Medicamento';
    fields = `${field('Nome', 'name', item.name, 'text', 'required maxlength="120"')}${field('Cor', 'color', item.color || '#016b54', 'color')}<p class="form-hint">Após cadastrar, adicione as apresentações e crie as regras de uso.</p>`;
  } else if (kind === 'presentation') {
    title = 'Nova apresentação';
    fields = `${select('Medicamento', 'drugId', state.drugs, context.drugId)}${field('Concentração / dosagem', 'strength', '', 'text', 'required placeholder="Ex.: 500 mg" maxlength="80"')}${field('Apresentação', 'form', '', 'text', 'required placeholder="Ex.: comprimido, gotas" maxlength="60"')}`;
  } else if (kind === 'routine') {
    title = item.id ? 'Editar Regra de Uso' : 'Criar Regra de Uso';
    const drugId = item.drugId || state.drugs[0]?.id;
    fields = `${select('Familiar', 'memberId', state.members, item.memberId || context.memberId)}${select('Medicamento', 'drugId', state.drugs, drugId)}${select(
      'Apresentação',
      'presentationId',
      state.presentations.filter((p) => p.drugId === drugId),
      item.presentationId,
      (p) => `${p.strength} · ${p.form}`,
    )}${field('Quantidade por dose', 'quantity', item.quantity || '', 'text', 'required placeholder="Ex.: 1 comprimido" maxlength="120"')}${field('Horários separados por vírgula', 'times', item.times?.join(', ') || '08:00', 'text', 'required placeholder="08:00, 20:00"')}<label>Instruções<textarea aria-label="Instruções" name="instruction" maxlength="500">${e(item.instruction || 'Conforme orientação médica')}</textarea></label>`;
  } else {
    title = 'Adicionar Documento';
    fields = `${field('Título', 'title', '', 'text', 'required maxlength="200"')}${select('Familiar', 'memberId', state.members, context.memberId)}${select(
      'Categoria',
      'category',
      Object.entries(categoryLabels).map(([id, name]) => ({ id, name })),
      'prescription',
    )}${field('Data', 'date', localDate(), 'date', 'required')}<label>Arquivo (PDF, imagem ou TXT; até 1 MB)<input name="documentFile" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" required></label><p class="form-hint">O documento fica criptografado no banco deste computador.</p>`;
  }
  const dialog = mount(
    title,
    /* HTML */ `<form data-form="${kind}" data-id="${e(item.id || '')}">
      <div class="form-fields">${fields}</div>
      <p class="form-error" role="alert"></p>
      <footer>
        <button type="button" class="secondary-button" data-action="close-dialog">Cancelar</button
        ><button type="submit" class="primary-button">Salvar</button>
      </footer>
    </form>`,
  );
  if (kind === 'routine') {
    dialog.querySelector('[name="drugId"]').addEventListener('change', (event) => {
      dialog.querySelector('[name="presentationId"]').innerHTML = options(
        state.presentations.filter((p) => p.drugId === event.target.value),
        '',
        (p) => `${p.strength} · ${p.form}`,
      );
    });
  }
}

export async function formPayload(form, state) {
  const data = new FormData(form);
  const text = (name) => String(data.get(name) || '').trim();
  switch (form.dataset.form) {
    case 'member': {
      const item = state.members.find((m) => m.id === form.dataset.id);
      const file = data.get('photoFile');
      return {
        resource: 'members',
        body: {
          name: text('name'),
          relationship: text('relationship'),
          initials: text('name')
            .split(/\s+/)
            .slice(0, 2)
            .map((s) => s[0])
            .join('')
            .toUpperCase(),
          color: text('color'),
          medicalNotes: text('medicalNotes') || null,
          photo: file?.size
            ? await memberPhoto(file)
            : data.has('removePhoto')
              ? null
              : item?.photo,
        },
      };
    }
    case 'drug':
      return { resource: 'medicines', body: { name: text('name'), color: text('color') } };
    case 'presentation':
      return {
        resource: 'presentations',
        body: { drugId: text('drugId'), strength: text('strength'), form: text('form') },
      };
    case 'routine':
      return {
        resource: 'routines',
        body: {
          memberId: text('memberId'),
          drugId: text('drugId'),
          presentationId: text('presentationId'),
          quantity: text('quantity'),
          times: [
            ...new Set(
              text('times')
                .split(',')
                .map((t) => t.trim()),
            ),
          ].sort(),
          instruction: text('instruction') || 'Conforme orientação médica',
        },
      };
    case 'document': {
      const file = data.get('documentFile');
      if (!file?.size || file.size > 1_000_000) throw new Error('Escolha um arquivo de até 1 MB.');
      if (
        !['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'].includes(
          file.type,
        )
      )
        throw new Error('Formato de arquivo não permitido.');
      return {
        resource: 'documents',
        body: {
          title: text('title'),
          memberId: text('memberId'),
          category: text('category'),
          date: text('date'),
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          dataUrl: await readFile(file),
        },
      };
    }
  }
}
