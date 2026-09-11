/** Abre o SQLite com chaves estrangeiras, WAL e migrações versionadas. */
import Database from 'better-sqlite3';
import { mkdirSync, existsSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createVault, loadKey } from '../services/vault.js';

export function openDatabase(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const path = join(directory, 'help-family.sqlite');
  const vault = createVault(loadKey(directory, existsSync(path)));
  const db = new Database(path);
  chmodSync(path, 0o600);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  if (db.pragma('user_version', { simple: true }) === 0) {
    db.transaction(() =>
      db.exec(readFileSync(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8')),
    )();
  }
  if (db.pragma('user_version', { simple: true }) !== 1) {
    db.close();
    throw new Error('Versão do banco incompatível.');
  }
  return { db, vault };
}
