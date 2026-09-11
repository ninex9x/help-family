import { and, eq } from "drizzle-orm";
import { ensureDbSchema, getDb, getEncryptionKey } from "../../../db";
import { familyState } from "../../../db/schema";
import { validateAppState } from "../../../lib/health-state";
import { decryptStatePayload, encryptStatePayload, isEncryptedPayload } from "../../../lib/server-vault";

export const dynamic = "force-dynamic";

const STATE_SCOPE = "local-family";
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "app.local"]);

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

function isLocalRequest(request: Request) {
  try {
    return LOCAL_HOSTS.has(new URL(request.url).hostname);
  } catch {
    return false;
  }
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function currentRow() {
  await ensureDbSchema();
  const db = await getDb();
  const [row] = await db.select().from(familyState).where(eq(familyState.scope, STATE_SCOPE)).limit(1);
  return row;
}

export async function GET(request: Request) {
  if (!isLocalRequest(request)) return json({ error: "Backend disponível somente em localhost" }, 403);

  try {
    const row = await currentRow();
    if (!row) return json({ state: null, revision: 0, updatedAt: null });

    const stored = JSON.parse(row.payload) as unknown;
    const encryptionKey = await getEncryptionKey();
    const decrypted = isEncryptedPayload(stored)
      ? await decryptStatePayload(stored, encryptionKey)
      : stored;
    const parsed = validateAppState(decrypted);
    if (!parsed.success) return json({ error: "O estado persistido está corrompido" }, 500);

    if (!isEncryptedPayload(stored)) {
      const encrypted = await encryptStatePayload(parsed.state, encryptionKey);
      const db = await getDb();
      await db.update(familyState).set({ payload: JSON.stringify(encrypted), updatedAt: new Date().toISOString() })
        .where(and(eq(familyState.scope, STATE_SCOPE), eq(familyState.revision, row.revision)));
    }
    return json({ state: parsed.state, revision: row.revision, updatedAt: row.updatedAt });
  } catch (error) {
    console.error("Falha ao carregar o estado familiar", error);
    return json({ error: "Não foi possível carregar os dados locais" }, 500);
  }
}

export async function PUT(request: Request) {
  if (!isLocalRequest(request)) return json({ error: "Backend disponível somente em localhost" }, 403);
  if (!isSameOrigin(request)) return json({ error: "Origem não permitida" }, 403);

  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) return json({ error: "Estado excede o limite de 8 MB" }, 413);

  let body: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return json({ error: "Estado excede o limite de 8 MB" }, 413);
    }
    body = JSON.parse(raw);
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }
  const payload = body as { state?: unknown; expectedRevision?: unknown };
  const validation = validateAppState(payload.state);
  if (!validation.success) return json({ error: "Estado inválido", details: validation.errors }, 422);
  if (!Number.isSafeInteger(payload.expectedRevision) || (payload.expectedRevision as number) < 0) {
    return json({ error: "expectedRevision deve ser um inteiro não negativo" }, 400);
  }

  try {
    await ensureDbSchema();
    const db = await getDb();
    const encryptionKey = await getEncryptionKey();
    const expectedRevision = payload.expectedRevision as number;
    const serialized = JSON.stringify(await encryptStatePayload(validation.state, encryptionKey));
    const now = new Date().toISOString();

    if (expectedRevision === 0) {
      const inserted = await db.insert(familyState).values({
        scope: STATE_SCOPE,
        payload: serialized,
        revision: 1,
        updatedAt: now,
      }).onConflictDoNothing().returning({ revision: familyState.revision, updatedAt: familyState.updatedAt });
      if (inserted.length) return json(inserted[0], 201);
    } else {
      const updated = await db.update(familyState).set({
        payload: serialized,
        revision: expectedRevision + 1,
        updatedAt: now,
      }).where(and(eq(familyState.scope, STATE_SCOPE), eq(familyState.revision, expectedRevision)))
        .returning({ revision: familyState.revision, updatedAt: familyState.updatedAt });
      if (updated.length) return json(updated[0]);
    }

    const row = await currentRow();
    return json({ error: "Os dados foram alterados em outra sessão", revision: row?.revision ?? 0 }, 409);
  } catch (error) {
    console.error("Falha ao salvar o estado familiar", error);
    return json({ error: "Não foi possível salvar os dados locais" }, 500);
  }
}
