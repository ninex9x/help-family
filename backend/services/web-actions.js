/** Traduz comandos do site em operações validadas. Relógio, iniciais e regras ficam no servidor. */
import { AppError } from './family.js';
import { prepareResource } from './uploads.js';
import { localClock } from '../shared/local-clock.js';
const resources = {
  member: 'members',
  drug: 'medicines',
  presentation: 'presentations',
  routine: 'routines',
  document: 'documents',
};
const allowed = {
  member: ['name', 'relationship', 'color', 'medicalNotes', 'photoFile', 'removePhoto'],
  drug: ['name', 'color'],
  presentation: ['drugId', 'strength', 'form'],
  routine: ['memberId', 'drugId', 'presentationId', 'quantity', 'times', 'instruction'],
  document: ['title', 'memberId', 'category', 'date', 'documentFile'],
};
export function strictFields(body, keys) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((k) => !keys.includes(k))
  )
    throw new AppError(422, 'Campos inválidos.');
}
export async function formCommand(kind, body) {
  if (!Object.hasOwn(resources, kind)) throw new AppError(404, 'Formulário não encontrado.');
  strictFields(body, allowed[kind]);
  const text = (key) => {
    if (body[key] !== undefined && typeof body[key] !== 'string')
      throw new AppError(422, 'Campo de texto inválido.');
    return (body[key] || '').trim();
  };
  let item;
  if (kind === 'member') {
    item = {
      name: text('name'),
      relationship: text('relationship'),
      color: text('color'),
      medicalNotes: text('medicalNotes') || null,
    };
    if (body.photoFile) {
      if (typeof body.photoFile !== 'object' || typeof body.photoFile.dataUrl !== 'string')
        throw new AppError(422, 'Foto inválida.');
      item.photo = body.photoFile.dataUrl;
    } else if (body.removePhoto === 'on') item.photo = null;
  } else if (kind === 'drug') item = { name: text('name'), color: text('color') };
  else if (kind === 'presentation')
    item = { drugId: text('drugId'), strength: text('strength'), form: text('form') };
  else if (kind === 'routine')
    item = {
      memberId: text('memberId'),
      drugId: text('drugId'),
      presentationId: text('presentationId'),
      quantity: text('quantity'),
      times: text('times')
        .split(',')
        .map((t) => t.trim())
        .sort(),
      instruction: text('instruction') || 'Conforme orientação médica',
    };
  else {
    const file = body.documentFile;
    if (!file || typeof file !== 'object' || typeof file.dataUrl !== 'string')
      throw new AppError(422, 'Escolha um arquivo de até 1 MB.');
    item = {
      title: text('title'),
      memberId: text('memberId'),
      category: text('category'),
      date: text('date'),
      fileName: file.name,
      mimeType: file.type,
      dataUrl: file.dataUrl,
    };
  }
  return { resource: resources[kind], body: await prepareResource(resources[kind], item) };
}

/** A referência à pessoa e o instante da confirmação nunca vêm do navegador. */
export function doseCommand(service, body, expected, now = new Date()) {
  strictFields(body, ['routineId', 'scheduledTime', 'status']);
  const routine = service.list('routines').find((item) => item.id === body.routineId);
  if (!routine) throw new AppError(404, 'Regra de uso não encontrada.');
  if (routine.active === false) throw new AppError(422, 'Esta regra de uso está inativa.');
  if (!routine.times.includes(body.scheduledTime))
    throw new AppError(422, 'Horário não pertence à regra de uso.');
  return service.change(
    'dose-logs',
    'POST',
    undefined,
    {
      ...body,
      memberId: routine.memberId,
      date: localClock(now).date,
      recordedAt: localClock(now).time,
    },
    expected,
  );
}
