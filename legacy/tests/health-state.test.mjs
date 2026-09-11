import assert from "node:assert/strict";
import test from "node:test";
import { validateAppState } from "../lib/health-state.ts";

function validState() {
  return {
    members: [{
      id: "member-1",
      name: "Pessoa de Teste",
      relationship: "Meu perfil",
      initials: "PT",
      color: "#075fab",
      medicalNotes: "",
    }],
    drugs: [{ id: "drug-1", name: "Medicamento", color: "#016b54" }],
    presentations: [{ id: "presentation-1", drugId: "drug-1", strength: "10 mg", form: "comprimido" }],
    routines: [{
      id: "routine-1",
      drugId: "drug-1",
      presentationId: "presentation-1",
      memberId: "member-1",
      quantity: "1 comprimido",
      times: ["08:00"],
      instruction: "Após o café",
      active: true,
    }],
    logs: [{
      id: "log-1",
      routineId: "routine-1",
      memberId: "member-1",
      date: "2026-08-29",
      scheduledTime: "08:00",
      status: "taken",
      recordedAt: "08:03",
    }],
    documents: [],
  };
}

test("accepts and sanitizes a valid family state", () => {
  const input = validState();
  input.untrusted = "ignored";
  const result = validateAppState(input);

  assert.equal(result.success, true);
  assert.equal("untrusted" in result.state, false);
  assert.equal("medicalNotes" in result.state.members[0], false);
});

test("rejects broken entity relationships", () => {
  const input = validState();
  input.routines[0].memberId = "missing-member";
  const result = validateAppState(input);

  assert.equal(result.success, false);
  assert.match(result.errors.join("\n"), /memberId não existe/);
});

test("rejects unsafe identifiers and oversized embedded files", () => {
  const input = validState();
  input.members[0].id = "../../private";
  input.documents.push({
    id: "document-1",
    title: "Exame",
    memberId: "../../private",
    category: "exam",
    date: "2026-08-29",
    fileName: "exame.pdf",
    mimeType: "application/pdf",
    dataUrl: `data:application/pdf;base64,${"A".repeat(1_500_001)}`,
  });
  const result = validateAppState(input);

  assert.equal(result.success, false);
  assert.match(result.errors.join("\n"), /formato inválido|1500000 caracteres/);
});
