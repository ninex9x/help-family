/** Contratos do catálogo. Concentração é texto cadastrado, sem cálculo ou recomendação de dose. */
import { fields } from '../auth/validation.js';
import { HttpError } from '../../shared/errors.js';
export const medicineColors = ['#016b54', '#6586a3', '#b88387', '#aa8a58', '#9581ac', '#a43c12'];
export const medicineFields = ['name', 'color'];
export const presentationFields = ['strength', 'form'];
export function catalogId(value) {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new HttpError(404, 'Registro não encontrado.');
  return value.toLowerCase();
}
function text(value, max, label) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new HttpError(422, `Informe ${label} de até ${max} caracteres.`);
  return value.trim();
}
function contract(body, allowed, partial) {
  fields(body, allowed);
  if (partial && !Object.keys(body).length) throw new HttpError(422, 'Informe uma alteração.');
}
export function medicineInput(body, partial = false) {
  contract(body, medicineFields, partial);
  const input = {};
  if (!partial || Object.hasOwn(body, 'name')) input.name = text(body.name, 160, 'um nome');
  if (!partial || Object.hasOwn(body, 'color')) {
    input.color = body.color === undefined ? medicineColors[0] : body.color;
    if (!medicineColors.includes(input.color))
      throw new HttpError(422, 'Escolha uma das cores disponíveis.');
  }
  return input;
}
export function presentationInput(body, partial = false) {
  contract(body, presentationFields, partial);
  const input = {};
  if (!partial || Object.hasOwn(body, 'strength'))
    input.strength = text(body.strength, 80, 'uma concentração');
  if (!partial || Object.hasOwn(body, 'form')) input.form = text(body.form, 80, 'uma apresentação');
  return input;
}
