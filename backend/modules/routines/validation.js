/** Horários diários informados pelo usuário; não calcula doses nem decide tratamentos. */
import { fields } from '../auth/validation.js';
import { catalogId } from '../medicines/validation.js';
import { HttpError } from '../../shared/errors.js';
export const editableFields = ['quantity', 'instruction', 'times', 'active'];
export const creationFields = ['memberId', 'presentationId', ...editableFields];
function text(value, max, label, optional = false) {
  if (optional && value === undefined) return '';
  if (
    typeof value !== 'string' ||
    (!optional && !value.trim()) ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new HttpError(422, `Informe ${label} válido (até ${max} caracteres).`);
  return value.trim();
}
export function routineInput(body, editing = false) {
  fields(body, editing ? editableFields : creationFields);
  if (editing && !Object.keys(body).length) throw new HttpError(422, 'Informe uma alteração.');
  const result = {};
  if (!editing) {
    try {
      result.memberId = catalogId(body.memberId);
      result.presentationId = catalogId(body.presentationId);
    } catch {
      throw new HttpError(422, 'Selecione um familiar e uma apresentação válidos.');
    }
  }
  if (!editing || Object.hasOwn(body, 'quantity'))
    result.quantity = text(body.quantity, 120, 'uma quantidade');
  if (!editing || Object.hasOwn(body, 'instruction'))
    result.instruction = text(body.instruction, 500, 'um texto de instruções', true);
  if (!editing || Object.hasOwn(body, 'times')) {
    if (
      !Array.isArray(body.times) ||
      !body.times.length ||
      body.times.length > 24 ||
      body.times.some(
        (time) => typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time),
      ) ||
      new Set(body.times).size !== body.times.length
    )
      throw new HttpError(422, 'Informe de 1 a 24 horários diferentes no formato HH:mm.');
    result.times = [...body.times].sort();
  }
  if (!editing || Object.hasOwn(body, 'active')) {
    result.active = body.active === undefined ? true : body.active;
    if (typeof result.active !== 'boolean') throw new HttpError(422, 'Estado da rotina inválido.');
  }
  return result;
}
/** Apenas conversão de transporte HTML. O validador acima continua sendo obrigatório. */
export function routineForm(body, editing) {
  fields(body, [
    ...(editing ? editableFields : creationFields),
    '_csrf',
    ...(editing ? ['version'] : []),
  ]);
  const input = {};
  for (const key of editing ? editableFields : creationFields)
    if (Object.hasOwn(body, key)) input[key] = body[key];
  if (Object.hasOwn(input, 'times')) {
    if (typeof input.times !== 'string') throw new HttpError(422, 'Horários inválidos.');
    input.times = input.times.split(',').map((time) => time.trim());
  }
  if (Object.hasOwn(input, 'active')) {
    if (!['true', 'false'].includes(input.active))
      throw new HttpError(422, 'Estado da rotina inválido.');
    input.active = input.active === 'true';
  }
  return input;
}
