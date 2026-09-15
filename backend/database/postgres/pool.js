/** Um cliente por transação; o contexto RLS expira antes de a conexão voltar ao pool. */
import { Pool } from 'pg';
export async function openPool(config) {
  if (!['127.0.0.1', 'localhost', '::1'].includes(config.host))
    throw new Error('PostgreSQL deve estar em localhost.');
  const pool = new Pool({
    ...config,
    max: 4,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
  });
  // Erros de conexão ociosa não derrubam o processo nem imprimem detalhes privados.
  pool.on('error', () => console.error('Conexão PostgreSQL local interrompida.'));
  try {
    const result = await pool.query(`SELECT r.rolsuper, r.rolbypassrls,
      EXISTS (SELECT 1 FROM pg_class c WHERE c.relname IN ('families','family_memberships') AND c.relowner=r.oid) AS owns_tables
      FROM pg_roles r WHERE r.rolname=current_user`);
    if (
      !result.rows[0] ||
      result.rows[0].rolsuper ||
      result.rows[0].rolbypassrls ||
      result.rows[0].owns_tables
    )
      throw new Error(
        'A aplicação exige papel sem privilégios administrativos e sem propriedade das tabelas.',
      );
    await pool.query('SELECT id FROM users LIMIT 0');
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}
/**
 * @param {import('pg').Pool} pool Pool da aplicação, sem privilégios administrativos.
 * @param {string|null} userId Identidade da sessão validada, nunca do corpo da requisição.
 * @param {(client: import('pg').PoolClient) => Promise<any>} work Operação no mesmo cliente.
 * @returns {Promise<any>} Resultado confirmado; falhas desfazem a transação.
 */
export async function transaction(pool, userId, work) {
  const client = await pool.connect();
  let broken;
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('help_family.user_id', $1, true)", [userId || '']);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (failure) {
      broken = failure;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}
