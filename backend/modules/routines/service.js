/** Rotinas com vínculos fixos, horários cifrados e versão por registro; uso exclusivamente local. */
import { randomUUID } from 'node:crypto';
import { transaction } from '../../database/postgres/pool.js';
import { createVault } from '../../services/vault.js';
import { HttpError } from '../../shared/errors.js';
import { familyRepository } from '../families/repository.js';
import { routineRepository as repository } from './repository.js';
import { routineInput } from './validation.js';
export function createRoutinesService(pool, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('Chave clínica inválida.');
  const vault = createVault(key);
  const context = (row) =>
    `postgres:routines:${row.family_id}:${row.member_id}:${row.medicine_id}:${row.presentation_id}:${row.id}:content`;
  const content = (row) => vault.open(row.content_ciphertext, context(row));
  const decode = (row) => ({
    ...content(row),
    id: row.id,
    familyId: row.family_id,
    memberId: row.member_id,
    medicineId: row.medicine_id,
    presentationId: row.presentation_id,
    version: row.version,
  });
  async function access(c, userId, familyId, write = false) {
    const family = await familyRepository.get(c, userId, familyId);
    if (!family) throw new HttpError(404, 'Família não encontrada.');
    if (write && !['owner', 'caregiver'].includes(family.role))
      throw new HttpError(403, 'Seu acesso permite apenas consultar rotinas.');
    return family;
  }
  async function find(c, familyId, id) {
    const row = await repository.get(c, familyId, id);
    if (!row) throw new HttpError(404, 'Rotina não encontrada.');
    return row;
  }
  return {
    authorize: (userId, familyId, write = false) =>
      transaction(pool, userId, (c) => access(c, userId, familyId, write)),
    list: (userId, familyId) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId);
        return (await repository.list(c, familyId)).map(decode);
      }),
    get: (userId, familyId, id) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId);
        return decode(await find(c, familyId, id));
      }),
    create: (userId, familyId, body) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        const { memberId, presentationId, ...input } = routineInput(body);
        const references = await repository.references(c, familyId, memberId, presentationId);
        if (!references)
          throw new HttpError(404, 'Familiar ou apresentação não encontrado nesta família.');
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 4))', [familyId]);
        if ((await repository.count(c, familyId)) >= 500)
          throw new HttpError(422, 'Limite de 500 rotinas por família atingido.');
        const row = {
          id: randomUUID(),
          family_id: familyId,
          member_id: memberId,
          medicine_id: references.medicine_id,
          presentation_id: presentationId,
        };
        row.content_ciphertext = vault.seal(input, context(row));
        return decode(await repository.create(c, row));
      }),
    update: (userId, familyId, id, body, expected) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        const row = await find(c, familyId, id);
        const input = { ...content(row), ...routineInput(body, true) };
        const changed = await repository.update(
          c,
          familyId,
          id,
          vault.seal(input, context(row)),
          expected,
        );
        if (!changed)
          throw new HttpError(
            409,
            'Esta rotina foi alterada. Abra a versão atual antes de editar novamente.',
          );
        return decode(changed);
      }),
  };
}
