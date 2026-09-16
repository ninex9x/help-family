/** Regras clínicas no servidor. RLS reforça a autorização; AES-GCM vincula conteúdo a família/ID. */
import { randomUUID } from 'node:crypto';
import { transaction } from '../../database/postgres/pool.js';
import { createVault } from '../../services/vault.js';
import { preparePhoto } from '../../services/uploads.js';
import { AppError } from '../../services/family.js';
import { HttpError } from '../../shared/errors.js';
import { familyRepository } from '../families/repository.js';
import { memberRepository as repository } from './repository.js';
import { memberInput } from './validation.js';
export function createMembersService(pool, key) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error('Chave clínica PostgreSQL ausente ou inválida.');
  const vault = createVault(key);
  const context = (familyId, id, field) => `postgres:members:${familyId}:${id}:${field}`;
  const decode = (row) => ({
    ...vault.open(row.profile_ciphertext, context(row.family_id, row.id, 'profile')),
    id: row.id,
    familyId: row.family_id,
    version: row.version,
    hasPhoto: row.has_photo,
  });
  async function access(client, userId, familyId, write = false) {
    const family = await familyRepository.get(client, userId, familyId);
    if (!family) throw new HttpError(404, 'Família não encontrada.');
    if (write && !['owner', 'caregiver'].includes(family.role))
      throw new HttpError(403, 'Seu acesso permite apenas consultar familiares.');
    return family;
  }
  async function find(client, familyId, id) {
    const row = await repository.get(client, familyId, id);
    if (!row) throw new HttpError(404, 'Familiar não encontrado.');
    return row;
  }
  const authorize = (userId, familyId, write = false) =>
    transaction(pool, userId, (client) => access(client, userId, familyId, write));
  async function photoValue(value) {
    if (value === undefined || value === null) return value;
    try {
      return await preparePhoto(value);
    } catch (error) {
      if (error instanceof AppError) throw new HttpError(error.status, error.message);
      throw error;
    }
  }
  return {
    authorize,
    list: (userId, familyId) =>
      transaction(pool, userId, async (client) => {
        await access(client, userId, familyId);
        return (await repository.list(client, familyId)).map(decode);
      }),
    get: (userId, familyId, id) =>
      transaction(pool, userId, async (client) => {
        await access(client, userId, familyId);
        return decode(await find(client, familyId, id));
      }),
    photo: (userId, familyId, id) =>
      transaction(pool, userId, async (client) => {
        await access(client, userId, familyId);
        await find(client, familyId, id);
        const photo = await repository.photo(client, familyId, id);
        if (!photo) throw new HttpError(404, 'Foto não encontrada.');
        const value = vault.open(photo, context(familyId, id, 'photo'));
        return Buffer.from(value.split(',')[1], 'base64');
      }),
    async create(userId, familyId, input, photo) {
      await authorize(userId, familyId, true);
      const profile = memberInput(input);
      const prepared = await photoValue(photo);
      return transaction(pool, userId, async (client) => {
        await access(client, userId, familyId, true);
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 1))', [familyId]);
        if ((await repository.list(client, familyId)).length >= 100)
          throw new HttpError(422, 'Limite de 100 familiares atingido.');
        const id = randomUUID();
        return decode(
          await repository.create(
            client,
            familyId,
            id,
            vault.seal(profile, context(familyId, id, 'profile')),
            vault.seal(prepared, context(familyId, id, 'photo')),
          ),
        );
      });
    },
    async update(userId, familyId, id, input, expected, photo) {
      await authorize(userId, familyId, true);
      const patch =
        photo !== undefined && Object.keys(input).length === 0 ? {} : memberInput(input, true);
      const prepared = await photoValue(photo);
      return transaction(pool, userId, async (client) => {
        await access(client, userId, familyId, true);
        const current = await find(client, familyId, id);
        const profile = {
          ...vault.open(current.profile_ciphertext, context(familyId, id, 'profile')),
          ...patch,
        };
        const updated = await repository.update(
          client,
          familyId,
          id,
          vault.seal(profile, context(familyId, id, 'profile')),
          expected,
          prepared === undefined ? undefined : vault.seal(prepared, context(familyId, id, 'photo')),
        );
        if (!updated)
          throw new HttpError(
            409,
            'Este familiar foi alterado. Recarregue a página antes de editar novamente.',
          );
        return decode(updated);
      });
    },
  };
}
