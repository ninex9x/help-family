/** Migrações PostgreSQL independentes do SQLite; somente a credencial de migração aplica DDL. */
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
export async function migrate(config, runtimeRole) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(runtimeRole)) throw new Error('Papel PostgreSQL inválido.');
  const client = new Client(config);
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(17290115)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const folder = new URL('./migrations/', import.meta.url);
    for (const name of (await readdir(folder)).filter((name) => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, folder), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = (
        await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name])
      ).rows[0];
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(`Migração aplicada foi alterada: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [
        name,
        checksum,
      ]);
    }
    await client.query(`GRANT USAGE ON SCHEMA public TO "${runtimeRole}"`);
    await client.query(`GRANT SELECT, INSERT ON users TO "${runtimeRole}"`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO "${runtimeRole}"`);
    await client.query(`GRANT SELECT, UPDATE ON families TO "${runtimeRole}"`);
    await client.query(`GRANT SELECT ON family_memberships TO "${runtimeRole}"`);
    await client.query(`GRANT SELECT, INSERT ON routines TO "${runtimeRole}"`);
    await client.query(
      `GRANT UPDATE (content_ciphertext, version, updated_at) ON routines TO "${runtimeRole}"`,
    );
    await client.query(`GRANT SELECT, INSERT ON members TO "${runtimeRole}"`);
    await client.query(
      `GRANT SELECT, INSERT ON medicines, medicine_presentations TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT UPDATE (content_ciphertext, version, updated_at) ON medicines, medicine_presentations TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT UPDATE (profile_ciphertext, photo_ciphertext, version, updated_at) ON members TO "${runtimeRole}"`,
    );
    await client.query(
      `GRANT EXECUTE ON FUNCTION request_user_id(), create_owned_family(text) TO "${runtimeRole}"`,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
