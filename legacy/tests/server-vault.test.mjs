import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  decryptStatePayload,
  encryptStatePayload,
  isEncryptedPayload,
} from "../lib/server-vault.ts";

const state = {
  members: [{ id: "maria", name: "Maria da Silva", relationship: "Titular", initials: "MS", color: "#075fab" }],
  drugs: [],
  presentations: [],
  routines: [],
  logs: [],
  documents: [],
};

function encryptionKey() {
  return randomBytes(32).toString("base64");
}

test("encrypts and decrypts the complete family state", async () => {
  const key = encryptionKey();
  const encrypted = await encryptStatePayload(state, key);

  assert.equal(isEncryptedPayload(encrypted), true);
  assert.doesNotMatch(JSON.stringify(encrypted), /Maria da Silva|maria/);
  assert.deepEqual(await decryptStatePayload(encrypted, key), state);
});

test("rejects a wrong key or tampered ciphertext", async () => {
  const key = encryptionKey();
  const encrypted = await encryptStatePayload(state, key);

  await assert.rejects(decryptStatePayload(encrypted, encryptionKey()), /descriptografar/);
  const tampered = { ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -4)}AAAA` };
  await assert.rejects(decryptStatePayload(tampered, key), /descriptografar/);
});

test("requires an exact 256-bit key", async () => {
  await assert.rejects(encryptStatePayload(state, randomBytes(16).toString("base64")), /32 bytes/);
});
