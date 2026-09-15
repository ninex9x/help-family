/** Validação estrita de entrada; IDs, papéis e hashes não podem vir do cadastro HTTP. */
import { HttpError } from '../../shared/errors.js';
export function fields(body, allowed) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  )
    throw new HttpError(422, 'Campos inválidos.');
}
export function name(value) {
  if (
    typeof value !== 'string' ||
    value.trim().length < 1 ||
    value.trim().length > 120 ||
    /[\u0000-\u001f]/.test(value)
  )
    throw new HttpError(422, 'Informe um nome de até 120 caracteres.');
  return value.trim();
}
export function credentials(body, registration = false) {
  fields(body, registration ? ['name', 'email', 'password', 'familyName'] : ['email', 'password']);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (
    email.length > 254 ||
    !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)
  )
    throw new HttpError(422, 'Informe um e-mail válido.');
  if (
    typeof body.password !== 'string' ||
    body.password.length < (registration ? 15 : 1) ||
    body.password.length > 128
  )
    throw new HttpError(422, 'A senha deve ter entre 15 e 128 caracteres.');
  return {
    email,
    password: body.password,
    ...(registration ? { name: name(body.name), familyName: name(body.familyName) } : {}),
  };
}
