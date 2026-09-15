/** Formulários gerados no servidor; o navegador apenas apresenta campos e envia entradas. */
import { escapeHtml as e, options, localDate, categoryLabels } from './ui.js';
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
export function renderForm(kind, state, id, context = {}) {
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
    const drugId = item.drugId || context.drugId || state.drugs[0]?.id;
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
  const html = /* HTML */ `<form novalidate data-form="${kind}" data-id="${e(item.id || '')}">
    <div class="form-fields">${fields}</div>
    <p class="form-error" role="alert"></p>
    <footer>
      <button type="button" class="secondary-button" data-action="close-dialog">Cancelar</button
      ><button type="submit" class="primary-button">Salvar</button>
    </footer>
  </form>`;
  return { title, html, kind };
}
