/** Argon2id assíncrono; limita o trabalho simultâneo em vez de criar uma fila ilimitada. */
import { hash, verify, Algorithm } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';
import { HttpError } from '../errors.js';
const options = { algorithm: Algorithm.Argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };
export async function createPasswords() {
  const dummy = await hash(randomBytes(32), options);
  let active = 0;
  async function bounded(work) {
    if (active >= 2)
      throw new HttpError(503, 'Autenticação ocupada. Tente novamente em instantes.');
    active++;
    try {
      return await work();
    } finally {
      active--;
    }
  }
  return {
    hash: (password) => bounded(() => hash(password, options)),
    verify: (encoded, password) => bounded(() => verify(encoded || dummy, password)),
  };
}
