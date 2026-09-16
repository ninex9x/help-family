/** Data civil e horários validados no servidor, sem aceitar identidades ou snapshots do navegador. */
import { fields } from '../auth/validation.js';
import { catalogId } from '../medicines/validation.js';
import { HttpError } from '../../shared/errors.js';
export const timeZone = 'America/Sao_Paulo';
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
export function localDay(now) {
  const parts = Object.fromEntries(formatter.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
export function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new HttpError(422, 'Data inválida.');
  const parsed = new Date(`${value}T12:00:00Z`);
  if (
    Number(value.slice(0, 4)) < 1900 ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new HttpError(422, 'Data inválida.');
  return value;
}
export function doseInput(body) {
  fields(body, ['routineId', 'date', 'time', 'status', 'note', 'context']);
  if (typeof body.context !== 'string' || !/^[0-9a-f]{64}$/.test(body.context))
    throw new HttpError(422, 'Recarregue a agenda para obter o contexto atual da dose.');
  const routineId = catalogId(body.routineId);
  if (typeof body.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.time))
    throw new HttpError(422, 'Horário inválido.');
  if (!['taken', 'skipped'].includes(body.status))
    throw new HttpError(422, 'Escolha tomada ou não tomada.');
  if (
    body.note !== undefined &&
    (typeof body.note !== 'string' ||
      body.note.length > 500 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.note))
  )
    throw new HttpError(422, 'Observação inválida (até 500 caracteres).');
  return {
    routineId,
    context: body.context,
    date: date(body.date),
    time: body.time,
    status: body.status,
    note: body.note?.trim() || '',
  };
}
export function dayQuery(query) {
  fields(query, ['memberId', 'page']);
  const memberId = query.memberId ? catalogId(query.memberId) : undefined;
  const page = query.page === undefined ? 1 : Number(query.page);
  if (
    (query.page !== undefined &&
      (typeof query.page !== 'string' || !/^[1-9]\d*$/.test(query.page))) ||
    !Number.isInteger(page) ||
    page > 1000
  )
    throw new HttpError(422, 'Página inválida.');
  return { memberId, page };
}
export function historyQuery(query, today) {
  fields(query, ['memberId', 'from', 'to', 'cursor']);
  const to = date(query.to || today);
  const from = date(
    query.from ||
      new Date(new Date(`${to}T12:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(0, 10),
  );
  const days = (new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86400000;
  if (days < 0 || days > 30) throw new HttpError(422, 'Escolha um intervalo de até 31 dias.');
  let cursor;
  if (query.cursor !== undefined) {
    try {
      if (typeof query.cursor !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(query.cursor))
        throw new Error();
      cursor = JSON.parse(Buffer.from(query.cursor, 'base64url').toString());
      if (
        !Array.isArray(cursor) ||
        cursor.length !== 2 ||
        typeof cursor[0] !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor[0]) ||
        new Date(cursor[0]).toISOString() !== cursor[0]
      )
        throw new Error();
      date(cursor[0].slice(0, 10));
      cursor[1] = catalogId(cursor[1]);
    } catch {
      throw new HttpError(422, 'Cursor inválido.');
    }
  }
  return { from, to, memberId: query.memberId ? catalogId(query.memberId) : undefined, cursor };
}
