/** Regras de família e concorrência por registro. Cada operação usa a identidade autenticada. */
import { transaction } from '../../database/postgres/pool.js';
import { HttpError } from '../../shared/errors.js';
import { familyRepository as repository } from './repository.js';
export function createFamilyAccountsService(pool) {
  return {
    list: (userId) => transaction(pool, userId, (client) => repository.list(client, userId)),
    get: (userId, id) =>
      transaction(pool, userId, async (client) => {
        const family = await repository.get(client, userId, id);
        if (!family) throw new HttpError(404, 'Família não encontrada.');
        return family;
      }),
    create: (userId, name) =>
      transaction(pool, userId, async (client) => {
        // Serializa a quota de famílias criadas pela mesma conta.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [userId]);
        if ((await repository.list(client, userId)).length >= 100)
          throw new HttpError(422, 'Limite de famílias atingido.');
        const id = await repository.create(client, name);
        return repository.get(client, userId, id);
      }),
    rename: (userId, id, name, expected) =>
      transaction(pool, userId, async (client) => {
        const family = await repository.get(client, userId, id);
        if (!family) throw new HttpError(404, 'Família não encontrada.');
        if (family.role !== 'owner')
          throw new HttpError(403, 'Somente o proprietário pode editar a família.');
        const changed = await repository.rename(client, id, name, expected);
        if (!changed)
          throw new HttpError(409, 'A família foi alterada. Recarregue antes de salvar.');
        return { ...changed, role: family.role };
      }),
  };
}
