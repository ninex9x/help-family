/** Chave independente do SQLite. Nunca gerar uma substituta quando já houver dados cifrados. */
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
export async function ensureClinicalKey(client, path) {
  let key;
  try {
    key = await readFile(path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await client.query('BEGIN');
    try {
      await client.query(
        'LOCK TABLE members, medicines, medicine_presentations, routines IN SHARE MODE',
      );
      if (
        (
          await client.query(
            'SELECT 1 FROM members UNION ALL SELECT 1 FROM medicines UNION ALL SELECT 1 FROM medicine_presentations UNION ALL SELECT 1 FROM routines LIMIT 1',
          )
        ).rowCount
      )
        throw new Error(
          'Chave clínica ausente com dados existentes. Restaure clinical.key do backup.',
        );
      key = randomBytes(32);
      await writeFile(path, key, { flag: 'wx', mode: 0o600 });
      await client.query('COMMIT');
    } catch (failure) {
      await client.query('ROLLBACK');
      throw failure;
    }
  }
  if (key.length !== 32) throw new Error('Chave clínica inválida. Restaure o backup.');
  await chmod(path, 0o600);
}
