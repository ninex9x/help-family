import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type RuntimeEnv = {
  DB?: D1Database;
  LOCAL_DATA_ENCRYPTION_KEY?: string;
};

async function getRuntimeEnv(): Promise<RuntimeEnv> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

async function getBinding() {
  const runtimeEnv = await getRuntimeEnv();
  if (!runtimeEnv.DB) {
    throw new Error(
      "O binding D1 `DB` não está disponível. Execute o projeto pelo servidor local configurado."
    );
  }

  return runtimeEnv.DB;
}

export async function getEncryptionKey() {
  const runtimeEnv = await getRuntimeEnv();
  if (!runtimeEnv.LOCAL_DATA_ENCRYPTION_KEY) {
    throw new Error("LOCAL_DATA_ENCRYPTION_KEY não está configurada");
  }
  return runtimeEnv.LOCAL_DATA_ENCRYPTION_KEY;
}

export function getDb() {
  return getBinding().then((binding) => drizzle(binding, { schema }));
}

export async function ensureDbSchema() {
  const binding = await getBinding();
  await binding.prepare(`
    CREATE TABLE IF NOT EXISTS family_state (
      scope TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}
