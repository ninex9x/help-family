/** Contrato compartilhado por HTML e API; permissões e identidade nunca vêm do formulário. */
import { fields, name } from '../auth/validation.js';
import { HttpError } from '../../shared/errors.js';
export const memberFields = ['name', 'relationship', 'color', 'medicalNotes'];
export const colors = ['#7c8f69', '#6586a3', '#b88387', '#aa8a58', '#9581ac', '#4f9188'];
export function memberId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new HttpError(404, 'Familiar não encontrado.');
  return value.toLowerCase();
}
function optionalText(value, limit, label) {
  if (value === undefined) return '';
  if (
    typeof value !== 'string' ||
    value.length > limit ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new HttpError(422, `${label} inválido ou muito longo (máximo ${limit} caracteres).`);
  return value.trim();
}
export function memberInput(body, partial = false) {
  fields(body, memberFields);
  if (partial && !Object.keys(body).length) throw new HttpError(422, 'Informe uma alteração.');
  const result = {};
  if (!partial || Object.hasOwn(body, 'name')) result.name = name(body.name);
  if (!partial || Object.hasOwn(body, 'relationship'))
    result.relationship = optionalText(body.relationship, 80, 'Parentesco');
  if (!partial || Object.hasOwn(body, 'medicalNotes'))
    result.medicalNotes = optionalText(body.medicalNotes, 4000, 'Campo de observações');
  if (!partial || Object.hasOwn(body, 'color')) {
    result.color = body.color ?? colors[0];
    if (!colors.includes(result.color))
      throw new HttpError(422, 'Escolha uma das cores disponíveis.');
  }
  return result;
}
