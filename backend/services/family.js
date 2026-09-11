/** Executa alterações atômicas com validação relacional e revisão otimista global. */
import { randomUUID } from 'node:crypto';
import { validateAppState } from './validation.js';
import { resources } from '../repositories/family.js';

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Todas as alterações executam dentro de uma transação síncrona do SQLite. */
export function createFamilyService(db, repository) {
  function validate(state) {
    const result = validateAppState(state);
    if (!result.success)
      throw new AppError(422, `Dados inválidos: ${result.errors.slice(0, 3).join('; ')}`);
    return result.state;
  }
  /** Recusa gravações baseadas em uma fotografia antiga, sem alterar o banco. */
  function checkRevision(expected) {
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new AppError(428, 'Informe a revisão atual em If-Match.');
    if (expected !== repository.revision())
      throw new AppError(
        409,
        'Os dados mudaram em outra sessão. Recarregue a página antes de salvar.',
      );
  }
  return {
    snapshot: repository.snapshot,
    list(resource) {
      return repository.list(resource);
    },
    change: db.transaction((resource, method, id, body, expected) => {
      checkRevision(expected);
      const spec = resources[resource];
      const { state } = repository.snapshot();
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AppError(400, 'Corpo inválido.');
      const existing = state[spec.key].find((item) => item.id === id);
      if (method !== 'POST' && !existing) throw new AppError(404, 'Registro não encontrado.');
      let item = { ...existing, ...body, id: existing?.id ?? randomUUID() };
      // Explicit null clears optional profile fields; omitted fields retain their value.
      if (resource === 'members')
        for (const field of ['photo', 'medicalNotes']) if (body[field] === null) delete item[field];
      if (resource === 'dose-logs' && method === 'POST') {
        const previous = state.logs.find(
          (log) =>
            log.routineId === item.routineId &&
            log.date === item.date &&
            log.scheduledTime === item.scheduledTime,
        );
        if (previous) item.id = previous.id;
      }
      state[spec.key] = state[spec.key].filter((entry) => entry.id !== item.id);
      if (method !== 'DELETE') state[spec.key].push(item);
      const normalized = validate(state);
      if (method === 'DELETE') repository.remove(resource, item.id);
      else {
        item = normalized[spec.key].find((entry) => entry.id === item.id);
        repository.put(resource, item);
      }
      return { item: method === 'DELETE' ? null : item, revision: repository.increment() };
    }),
    importState: db.transaction((raw) => {
      if (repository.revision() !== 0)
        throw new AppError(409, 'O banco já contém dados; importação recusada.');
      const state = validate(raw);
      for (const [resource, spec] of Object.entries(resources))
        for (const item of state[spec.key]) repository.put(resource, item);
      db.prepare('UPDATE metadata SET imported=1 WHERE id=1').run();
      repository.increment();
      return repository.snapshot();
    }),
  };
}
