/** Importação única do D1 legado: leitura somente, backup consistente e transação no destino. */
import Database from 'better-sqlite3';
import { createDecipheriv } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp } from '../backend/app.js';

export function decryptLegacy(payload, key) {
  if (payload.algorithm !== 'AES-256-GCM') return payload;
  const bytes = Buffer.from(payload.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAAD(Buffer.from('cura-familia-state-v1'));
  decipher.setAuthTag(bytes.subarray(-16));
  return JSON.parse(
    Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString(),
  );
}

function sqliteFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sqliteFiles(path) : entry.name.endsWith('.sqlite') ? [path] : [];
  });
}

export async function migrateLegacy(root) {
  process.umask(0o077);
  const destination = resolve(root, 'data');
  const sources = sqliteFiles(resolve(root, 'legacy/.wrangler/state/v3/d1')).filter((path) => {
    const source = new Database(path, { readonly: true });
    try {
      return Boolean(
        source.prepare("SELECT name FROM sqlite_master WHERE name='family_state'").get(),
      );
    } finally {
      source.close();
    }
  });
  if (sources.length !== 1)
    throw new Error('Esperado um banco legado com family_state; nenhuma alteração realizada.');
  const source = new Database(sources[0], { readonly: true });
  try {
    const row = source.prepare("SELECT payload FROM family_state WHERE scope='local-family'").get();
    if (!row) {
      console.log('Banco antigo vazio. A nova instalação começará sem cadastros.');
      return;
    }
    const keyPath = resolve(root, 'legacy/.dev.vars');
    const match = readFileSync(keyPath, 'utf8').match(/^LOCAL_DATA_ENCRYPTION_KEY=(.+)$/m);
    if (!match) throw new Error('Chave do banco antigo não encontrada.');
    const state = decryptLegacy(JSON.parse(row.payload), Buffer.from(match[1].trim(), 'base64'));
    const backup = join(destination, 'backups', new Date().toISOString().replaceAll(':', '-'));
    mkdirSync(backup, { recursive: true, mode: 0o700 });
    await source.backup(join(backup, 'legacy.sqlite'));
    copyFileSync(keyPath, join(backup, 'legacy.dev.vars'));
    chmodSync(join(backup, 'legacy.dev.vars'), 0o600);
    const { db, service } = createApp(destination);
    try {
      const migrated = service.importState(state);
      console.log(
        'Migração concluída:',
        Object.entries(migrated.state)
          .map(([name, values]) => `${name}: ${values.length}`)
          .join(', '),
      );
      console.log('Originais preservados; backup criptografado em data/backups/.');
    } finally {
      db.close();
    }
  } finally {
    source.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await migrateLegacy(fileURLToPath(new URL('../', import.meta.url)));
}
