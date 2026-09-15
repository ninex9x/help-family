/** Cadastro atômico: conta, família vazia e sessão. Acervos existentes nunca são apropriados. */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { transaction } from '../../database/postgres/pool.js';
import { HttpError } from '../../shared/errors.js';
import { authRepository as repository } from './repository.js';
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = ({ id, name, email }) => ({ id, name, email });
function newSession() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: tokenHash(token), csrf: randomBytes(32).toString('base64url') };
}
export function createAuthService(pool, passwords) {
  return {
    async register(input) {
      const hash = await passwords.hash(input.password);
      const user = { id: randomUUID(), name: input.name, email: input.email };
      const session = newSession();
      try {
        await transaction(pool, user.id, async (client) => {
          await repository.insertUser(client, user, hash);
          await client.query('SELECT create_owned_family($1)', [input.familyName]);
          await repository.insertSession(client, user.id, session);
        });
      } catch (error) {
        if (error.code === '23505')
          throw new HttpError(
            409,
            'Não foi possível cadastrar essa conta. Confira os dados ou faça login.',
          );
        throw error;
      }
      return { user, session };
    },
    async login(input, previousToken) {
      const user = await repository.findUser(pool, input.email);
      const valid = await passwords.verify(user?.password_hash, input.password);
      if (!user || !valid) throw new HttpError(401, 'E-mail ou senha inválidos.');
      const session = newSession();
      await transaction(pool, user.id, async (client) => {
        if (previousToken) await repository.deleteSession(client, tokenHash(previousToken));
        await repository.insertSession(client, user.id, session);
      });
      return { user: publicUser(user), session };
    },
    async authenticate(token) {
      if (!token) return null;
      const hash = tokenHash(token);
      const session = await repository.session(pool, hash);
      if (!session) return null;
      await repository.touchSession(pool, hash);
      return {
        user: publicUser(session),
        csrfToken: session.csrf_token,
        expiresAt: session.expires_at,
        hash,
      };
    },
    async logout(auth) {
      await repository.deleteSession(pool, auth.hash);
    },
  };
}
