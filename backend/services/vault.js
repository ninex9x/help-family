/** Criptografia autenticada dos campos; a chave permanece no diretório privado de dados. */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

export function loadKey(directory, databaseExists = false) {
  const path = join(directory, 'encryption.key');
  if (!existsSync(path)) {
    if (databaseExists)
      throw new Error(
        'Chave local ausente. Restaure encryption.key do backup; o banco não foi alterado.',
      );
    writeFileSync(path, randomBytes(32), { flag: 'wx', mode: 0o600 });
  }
  chmodSync(path, 0o600);
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error('Chave local inválida.');
  return key;
}

/** O contexto autentica tabela, ID e coluna; trocar campos cifrados causa falha. */
export function createVault(key) {
  return {
    seal(value, context) {
      if (value === undefined || value === null) return null;
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(context));
      const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    },
    open(value, context) {
      if (value === null) return undefined;
      const data = Buffer.from(value, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      decipher.setAAD(Buffer.from(context));
      decipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString(),
      );
    },
    index(value) {
      return createHmac('sha256', key).update(value).digest('hex');
    },
  };
}
