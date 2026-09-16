/** Etapa multiusuário isolada: autenticação e famílias. Não expõe os cadastros SQLite antigos. */
import express from 'express';
import { openPool } from './database/postgres/pool.js';
import { localAccess } from './middleware/local-access.js';
import { createPasswords } from './shared/security/passwords.js';
import { createAttemptLimiter } from './shared/security/attempts.js';
import { HttpError, errorResponse } from './shared/errors.js';
import { createAuthService } from './modules/auth/service.js';
import { authRoutes } from './modules/auth/routes.js';
import { createFamilyAccountsService } from './modules/families/service.js';
import { familyRoutes } from './modules/families/routes.js';
import { accountWebRoutes } from './web/accounts/routes.js';
import { createMembersService } from './modules/members/service.js';
import { memberRoutes } from './modules/members/routes.js';
import { createMedicinesService } from './modules/medicines/service.js';
import { medicineRoutes } from './modules/medicines/routes.js';
import { createRoutinesService } from './modules/routines/service.js';
import { routineRoutes } from './modules/routines/routes.js';
export async function createAccountsApp(database, { attempts, clinicalKey } = {}) {
  const pool = await openPool(database);
  try {
    const auth = createAuthService(pool, await createPasswords());
    const families = createFamilyAccountsService(pool);
    const members = createMembersService(pool, clinicalKey);
    const medicines = createMedicinesService(pool, clinicalKey);
    const routines = createRoutinesService(pool, clinicalKey);
    const app = express();
    app.disable('x-powered-by');
    app.use(
      localAccess,
      express.json({ limit: '16kb' }),
      express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 12 }),
    );
    app.get('/api/health', async (_req, res) => {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', storage: 'postgresql', localOnly: true, stage: 'accounts' });
    });
    const attemptLimiter = createAttemptLimiter(attempts);
    app.use('/api/auth', authRoutes(auth, attemptLimiter));
    app.use('/api/families', familyRoutes(families, auth));
    app.use('/api/families/:familyId/members', memberRoutes(members, auth));
    app.use('/api/families/:familyId/medicines', medicineRoutes(medicines, auth));
    app.use('/api/families/:familyId/routines', routineRoutes(routines, auth));
    app.use(accountWebRoutes(auth, families, attemptLimiter, members, medicines, routines));
    app.use((_req, _res, next) => next(new HttpError(404, 'Endpoint não encontrado.')));
    app.use(errorResponse);
    return { app, pool };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
