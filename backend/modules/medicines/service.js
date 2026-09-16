/** Autorização e criptografia do catálogo. Nenhuma regra depende do navegador. */
import { randomUUID } from 'node:crypto';
import { transaction } from '../../database/postgres/pool.js';
import { createVault } from '../../services/vault.js';
import { HttpError } from '../../shared/errors.js';
import { familyRepository } from '../families/repository.js';
import { medicineRepository as repository } from './repository.js';
import { medicineInput, presentationInput } from './validation.js';
export function createMedicinesService(pool, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error('Chave clínica PostgreSQL ausente ou inválida.');
  const vault = createVault(key);
  // O contexto da apresentação autentica também o medicamento ao qual pertence.
  const context = (row) =>
    row.medicine_id
      ? `postgres:medicine_presentations:${row.family_id}:${row.medicine_id}:${row.id}:content`
      : `postgres:medicines:${row.family_id}:${row.id}:content`;
  const content = (row) => vault.open(row.content_ciphertext, context(row));
  const decode = (row) => ({
    ...content(row),
    id: row.id,
    familyId: row.family_id,
    version: row.version,
    ...(row.medicine_id ? { medicineId: row.medicine_id } : {}),
  });
  async function access(client, userId, familyId, write = false) {
    const family = await familyRepository.get(client, userId, familyId);
    if (!family) throw new HttpError(404, 'Família não encontrada.');
    if (write && !['owner', 'caregiver'].includes(family.role))
      throw new HttpError(403, 'Seu acesso permite apenas consultar medicamentos.');
    return family;
  }
  async function find(client, familyId, id) {
    const row = await repository.get(client, familyId, id);
    if (!row) throw new HttpError(404, 'Medicamento não encontrado.');
    return row;
  }
  async function findPresentation(client, familyId, medicineId, id) {
    const row = await repository.getPresentation(client, familyId, medicineId, id);
    if (!row) throw new HttpError(404, 'Apresentação não encontrada.');
    return row;
  }
  function changed(row) {
    if (!row)
      throw new HttpError(
        409,
        'Este registro foi alterado. Abra a versão atual antes de editar novamente.',
      );
    return decode(row);
  }
  return {
    authorize: (userId, familyId, write = false) =>
      transaction(pool, userId, (c) => access(c, userId, familyId, write)),
    list: (userId, familyId) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId);
        const medicines = await repository.list(c, familyId);
        const presentations = await repository.presentations(
          c,
          familyId,
          medicines.map((m) => m.id),
        );
        const grouped = new Map(medicines.map((m) => [m.id, []]));
        for (const row of presentations) grouped.get(row.medicine_id).push(decode(row));
        return medicines.map((m) => ({ ...decode(m), presentations: grouped.get(m.id) }));
      }),
    get: (userId, familyId, id) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId);
        return decode(await find(c, familyId, id));
      }),
    getPresentation: (userId, familyId, medicineId, id) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId);
        await find(c, familyId, medicineId);
        return decode(await findPresentation(c, familyId, medicineId, id));
      }),
    create: (userId, familyId, body) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        const input = medicineInput(body);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 2))', [familyId]);
        if ((await repository.count(c, familyId)) >= 100)
          throw new HttpError(422, 'Limite de 100 medicamentos por família atingido.');
        const row = { id: randomUUID(), family_id: familyId };
        return decode(
          await repository.create(c, familyId, row.id, vault.seal(input, context(row))),
        );
      }),
    createPresentation: (userId, familyId, medicineId, body) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        await find(c, familyId, medicineId);
        const input = presentationInput(body);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 3))', [medicineId]);
        if ((await repository.countPresentations(c, familyId, medicineId)) >= 20)
          throw new HttpError(422, 'Limite de 20 apresentações por medicamento atingido.');
        const row = { id: randomUUID(), family_id: familyId, medicine_id: medicineId };
        return decode(
          await repository.createPresentation(
            c,
            familyId,
            medicineId,
            row.id,
            vault.seal(input, context(row)),
          ),
        );
      }),
    update: (userId, familyId, id, body, expected) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        const row = await find(c, familyId, id);
        const next = { ...content(row), ...medicineInput(body, true) };
        return changed(
          await repository.update(c, familyId, id, vault.seal(next, context(row)), expected),
        );
      }),
    updatePresentation: (userId, familyId, medicineId, id, body, expected) =>
      transaction(pool, userId, async (c) => {
        await access(c, userId, familyId, true);
        await find(c, familyId, medicineId);
        const row = await findPresentation(c, familyId, medicineId, id);
        const next = { ...content(row), ...presentationInput(body, true) };
        return changed(
          await repository.updatePresentation(
            c,
            familyId,
            medicineId,
            id,
            vault.seal(next, context(row)),
            expected,
          ),
        );
      }),
  };
}
