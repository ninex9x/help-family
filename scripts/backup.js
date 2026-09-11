import Database from 'better-sqlite3';
import { mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// SQLite's online backup API includes committed WAL data while the app is running.
process.umask(0o077);
const directory = fileURLToPath(new URL('../data/', import.meta.url));
const destination = join(
  directory,
  'backups',
  `sqlite-${new Date().toISOString().replaceAll(':', '-')}`,
);
mkdirSync(destination, { recursive: true, mode: 0o700 });
const db = new Database(resolve(directory, 'help-family.sqlite'), {
  readonly: true,
  fileMustExist: true,
});
try {
  await db.backup(join(destination, 'help-family.sqlite'));
  copyFileSync(join(directory, 'encryption.key'), join(destination, 'encryption.key'));
  chmodSync(join(destination, 'encryption.key'), 0o600);
  console.log(`Backup local concluído: ${destination}`);
} finally {
  db.close();
}
