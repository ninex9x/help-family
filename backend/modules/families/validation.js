/** Contratos de família: proprietário e permissões vêm da sessão, nunca do corpo HTTP. */
import { fields, name } from '../auth/validation.js';
import { HttpError } from '../../shared/errors.js';
export function familyInput(body) {
  fields(body, ['name']);
  return { name: name(body.name) };
}
export function familyId(value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new HttpError(404, 'Família não encontrada.');
  return value.toLowerCase();
}
export function version(value) {
  if (typeof value !== 'string' || !/^(?:[1-9]\d*|"[1-9]\d*")$/.test(value))
    throw new HttpError(428, 'Informe a versão atual em If-Match.');
  const number = Number(value.replaceAll('"', ''));
  if (!Number.isSafeInteger(number)) throw new HttpError(428, 'Versão inválida.');
  return number;
}
