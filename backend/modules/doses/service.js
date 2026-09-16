/** Agenda e histórico no servidor; registro único por rotina/data/horário e snapshots imutáveis. */
import { randomUUID } from 'node:crypto';
import { transaction } from '../../database/postgres/pool.js';
import { createVault } from '../../services/vault.js';
import { HttpError } from '../../shared/errors.js';
import { familyRepository } from '../families/repository.js';
import { memberRepository } from '../members/repository.js';
import { doseRepository as repository } from './repository.js';
import { doseInput, dayQuery, historyQuery, localDay, timeZone } from './validation.js';
export function createDosesService(pool, key, { now = () => new Date() } = {}) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Chave clínica inválida.');
  const vault = createVault(key);
  const occurrence = (family, routine, date, time) =>
    vault.index(`dose:${family}:${routine}:${date}:${time}`);
  // Vincula a confirmação aos dados exibidos, inclusive mudanças fora da versão da rotina.
  const confirmation = (row, labels) =>
    vault.index(`dose-view:${row.family_id}:${row.id}:${JSON.stringify(labels)}`);
  const context = (r) =>
    `postgres:dose_logs:${r.family_id}:${r.routine_id}:${r.member_id}:${r.id}:${r.scheduled_date}:${r.occurrence_key}:${r.recorded_by}:${r.recorded_at.toISOString()}`;
  const decode = (r) => ({
    ...vault.open(r.content_ciphertext, context(r)),
    id: r.id,
    familyId: r.family_id,
    routineId: r.routine_id,
    memberId: r.member_id,
    date: r.scheduled_date,
    recordedAt: r.recorded_at.toISOString(),
  });
  function snapshot(r) {
    const family = r.family_id;
    const routine = vault.open(
      r.content_ciphertext,
      `postgres:routines:${family}:${r.member_id}:${r.medicine_id}:${r.presentation_id}:${r.id}:content`,
    );
    const member = vault.open(
      r.member_content,
      `postgres:members:${family}:${r.member_id}:profile`,
    );
    const medicine = vault.open(
      r.medicine_content,
      `postgres:medicines:${family}:${r.medicine_id}:content`,
    );
    const presentation = vault.open(
      r.presentation_content,
      `postgres:medicine_presentations:${family}:${r.medicine_id}:${r.presentation_id}:content`,
    );
    return {
      routine,
      labels: {
        memberName: member.name,
        medicineName: medicine.name,
        strength: presentation.strength,
        form: presentation.form,
        quantity: routine.quantity,
        instruction: routine.instruction,
        routineVersion: r.version,
      },
    };
  }
  async function access(c, userId, familyId, write = false, memberId) {
    const family = await familyRepository.get(c, userId, familyId);
    if (!family) throw new HttpError(404, 'Família não encontrada.');
    if (write && !['owner', 'caregiver'].includes(family.role))
      throw new HttpError(403, 'Seu acesso permite apenas consultar doses.');
    if (memberId && !(await memberRepository.get(c, familyId, memberId)))
      throw new HttpError(404, 'Familiar não encontrado.');
    return family;
  }
  return {
    authorize: (userId, familyId) => transaction(pool, userId, (c) => access(c, userId, familyId)),
    today: (userId, familyId, query = {}) =>
      transaction(pool, userId, async (c) => {
        const filter = dayQuery(query),
          date = localDay(now());
        await access(c, userId, familyId, false, filter.memberId);
        const rows = await repository.routines(c, familyId, filter.memberId);
        const logs = await repository.day(c, familyId, date, filter.memberId);
        const items = new Map();
        for (const row of rows) {
          const { routine, labels } = snapshot(row);
          if (!routine.active) continue;
          for (const time of routine.times)
            items.set(occurrence(familyId, row.id, date, time), {
              ...labels,
              routineId: row.id,
              memberId: row.member_id,
              date,
              time,
              status: 'pending',
              version: row.version,
              context: confirmation(row, labels),
            });
        }
        for (const row of logs) items.set(row.occurrence_key, decode(row));
        const all = [...items.values()].sort(
          (a, b) =>
            a.time.localeCompare(b.time) ||
            a.memberName.localeCompare(b.memberName) ||
            a.routineId.localeCompare(b.routineId),
        );
        const counts = { pending: 0, taken: 0, skipped: 0 };
        for (const item of all) counts[item.status]++;
        return {
          date,
          timeZone,
          items: all.slice((filter.page - 1) * 50, filter.page * 50),
          page: filter.page,
          pages: Math.max(1, Math.ceil(all.length / 50)),
          counts,
          memberId: filter.memberId,
        };
      }),
    history: (userId, familyId, query = {}) =>
      transaction(pool, userId, async (c) => {
        const filter = historyQuery(query, localDay(now()));
        await access(c, userId, familyId, false, filter.memberId);
        const rows = await repository.history(c, familyId, filter),
          more = rows.length > 25;
        const items = rows.slice(0, 25).map(decode),
          last = items.at(-1);
        return {
          items,
          from: filter.from,
          to: filter.to,
          memberId: filter.memberId,
          timeZone,
          nextCursor: more
            ? Buffer.from(JSON.stringify([last.recordedAt, last.id])).toString('base64url')
            : null,
        };
      }),
    record: (userId, familyId, body, expected) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        const input = doseInput(body);
        const row = await repository.lockedRoutine(c, familyId, input.routineId);
        if (!row) throw new HttpError(404, 'Rotina não encontrada.');
        const { routine, labels } = snapshot(row);
        if (row.version !== expected)
          throw new HttpError(409, 'A rotina mudou. Recarregue a agenda antes de registrar.');
        if (!routine.active) throw new HttpError(409, 'Esta rotina está pausada.');
        if (!routine.times.includes(input.time))
          throw new HttpError(422, 'Horário não previsto nesta rotina.');
        if (input.context !== confirmation(row, labels))
          throw new HttpError(
            409,
            'Os dados do familiar ou medicamento mudaram. Recarregue a agenda.',
          );
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 5))', [familyId]);
        // Leia o relógio depois das travas: uma requisição que cruzar meia-noite deve ser recusada.
        const recordedAt = now(),
          today = localDay(recordedAt);
        if (input.date !== today)
          throw new HttpError(409, 'A data da agenda mudou. Recarregue a página.');
        if ((await repository.countDay(c, familyId, today)) >= 12000)
          throw new HttpError(422, 'Limite diário de registros atingido.');
        const log = {
          id: randomUUID(),
          family_id: familyId,
          routine_id: row.id,
          member_id: row.member_id,
          scheduled_date: today,
          occurrence_key: occurrence(familyId, row.id, today, input.time),
          recorded_by: userId,
          recorded_at: recordedAt,
        };
        log.content_ciphertext = vault.seal(
          { ...labels, time: input.time, status: input.status, note: input.note, timeZone },
          context(log),
        );
        const inserted = await repository.create(c, log);
        if (!inserted)
          throw new HttpError(409, 'Esta dose já foi registrada. Recarregue a agenda.');
        return decode(inserted);
      }),
  };
}
