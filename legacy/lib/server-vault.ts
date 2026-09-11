import type { AppState } from "./health-state";

type EncryptedPayload = {
  version: 1;
  algorithm: "AES-256-GCM";
  iv: string;
  ciphertext: string;
};

const ADDITIONAL_DATA = new TextEncoder().encode("cura-familia-state-v1");
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey(encodedKey: string) {
  let rawKey: Uint8Array<ArrayBuffer>;
  try {
    rawKey = decodeBase64(encodedKey);
  } catch {
    throw new Error("LOCAL_DATA_ENCRYPTION_KEY inválida");
  }
  if (rawKey.byteLength !== 32) throw new Error("LOCAL_DATA_ENCRYPTION_KEY deve ter 32 bytes");
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<EncryptedPayload>;
  return candidate.version === 1
    && candidate.algorithm === "AES-256-GCM"
    && typeof candidate.iv === "string"
    && candidate.iv.length === 16
    && BASE64_PATTERN.test(candidate.iv)
    && typeof candidate.ciphertext === "string"
    && candidate.ciphertext.length >= 24
    && candidate.ciphertext.length <= 12 * 1024 * 1024
    && BASE64_PATTERN.test(candidate.ciphertext);
}

export async function encryptStatePayload(state: AppState, encodedKey: string): Promise<EncryptedPayload> {
  const key = await importEncryptionKey(encodedKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(state));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: ADDITIONAL_DATA }, key, plaintext);
  return { version: 1, algorithm: "AES-256-GCM", iv: encodeBase64(iv), ciphertext: encodeBase64(ciphertext) };
}

export async function decryptStatePayload(payload: EncryptedPayload, encodedKey: string): Promise<unknown> {
  const key = await importEncryptionKey(encodedKey);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBase64(payload.iv), additionalData: ADDITIONAL_DATA },
      key,
      decodeBase64(payload.ciphertext),
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("Não foi possível descriptografar o estado familiar");
  }
}
