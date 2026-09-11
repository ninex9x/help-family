export type DoseStatus = "taken" | "skipped";
export type DocumentCategory = "prescription" | "exam" | "certificate";

export type Member = {
  id: string;
  name: string;
  relationship: string;
  initials: string;
  color: string;
  photo?: string;
  medicalNotes?: string;
};

export type Drug = {
  id: string;
  name: string;
  color: string;
};

export type MedicationPresentation = {
  id: string;
  drugId: string;
  strength: string;
  form: string;
};

export type MedicationRoutine = {
  id: string;
  drugId: string;
  presentationId: string;
  memberId: string;
  quantity: string;
  times: string[];
  instruction: string;
  active?: boolean;
};

export type DoseLog = {
  id: string;
  routineId: string;
  memberId: string;
  date: string;
  scheduledTime: string;
  status: DoseStatus;
  recordedAt: string;
};

export type HealthDocument = {
  id: string;
  title: string;
  memberId: string;
  category: DocumentCategory;
  date: string;
  fileName: string;
  mimeType: string;
  dataUrl?: string;
  nativeDocumentId?: string;
  fileSize?: number;
};

export type AppState = {
  members: Member[];
  drugs: Drug[];
  presentations: MedicationPresentation[];
  routines: MedicationRoutine[];
  logs: DoseLog[];
  documents: HealthDocument[];
};

export type AppStateValidation =
  | { success: true; state: AppState }
  | { success: false; errors: string[] };

type UnknownRecord = Record<string, unknown>;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,/i;
const DOCUMENT_DATA_PATTERN = /^data:(?:application\/pdf|image\/(?:jpeg|png|webp)|text\/plain)(?:;[^,]*)?,/i;
const FILE_NAME_PATTERN = /^[^\\/:*?"<>|\u0000-\u001f]+$/;
const DOCUMENT_CATEGORIES = new Set<DocumentCategory>(["prescription", "exam", "certificate"]);
const DOSE_STATUSES = new Set<DoseStatus>(["taken", "skipped"]);
const DOCUMENT_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]);

const ARRAY_LIMITS = {
  members: 50,
  drugs: 500,
  presentations: 1_000,
  routines: 2_000,
  logs: 50_000,
  documents: 500,
} as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  source: UnknownRecord,
  key: string,
  path: string,
  errors: string[],
  options: { max: number; pattern?: RegExp; optional?: boolean },
): string | undefined {
  const value = source[key];
  if (value === undefined && options.optional) return undefined;
  if (value === "" && options.optional) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > options.max) {
    errors.push(`${path}.${key} deve ser um texto entre 1 e ${options.max} caracteres`);
    return undefined;
  }
  if (options.pattern && !options.pattern.test(value)) {
    errors.push(`${path}.${key} tem formato inválido`);
    return undefined;
  }
  return value;
}

function readArray(source: UnknownRecord, key: keyof typeof ARRAY_LIMITS, errors: string[]): unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    errors.push(`${key} deve ser uma lista`);
    return [];
  }
  if (value.length > ARRAY_LIMITS[key]) errors.push(`${key} excede o limite de ${ARRAY_LIMITS[key]} itens`);
  return value.slice(0, ARRAY_LIMITS[key]);
}

function ensureUniqueIds(items: { id: string }[], path: string, errors: string[]) {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`${path} contém o id duplicado ${item.id}`);
    ids.add(item.id);
  }
}

function parseMember(value: unknown, index: number, errors: string[]): Member | null {
  const path = `members[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const name = readString(value, "name", path, errors, { max: 120 });
  const relationship = readString(value, "relationship", path, errors, { max: 80 });
  const initials = readString(value, "initials", path, errors, { max: 8 });
  const color = readString(value, "color", path, errors, { max: 7, pattern: COLOR_PATTERN });
  const photo = readString(value, "photo", path, errors, { max: 1_500_000, pattern: PHOTO_PATTERN, optional: true });
  const medicalNotes = readString(value, "medicalNotes", path, errors, { max: 2_000, optional: true });
  if (!id || !name || !relationship || !initials || !color) return null;
  return { id, name, relationship, initials, color, ...(photo ? { photo } : {}), ...(medicalNotes ? { medicalNotes } : {}) };
}

function parseDrug(value: unknown, index: number, errors: string[]): Drug | null {
  const path = `drugs[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const name = readString(value, "name", path, errors, { max: 160 });
  const color = readString(value, "color", path, errors, { max: 7, pattern: COLOR_PATTERN });
  return id && name && color ? { id, name, color } : null;
}

function parsePresentation(value: unknown, index: number, errors: string[]): MedicationPresentation | null {
  const path = `presentations[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const drugId = readString(value, "drugId", path, errors, { max: 128, pattern: ID_PATTERN });
  const strength = readString(value, "strength", path, errors, { max: 80 });
  const form = readString(value, "form", path, errors, { max: 80 });
  return id && drugId && strength && form ? { id, drugId, strength, form } : null;
}

function parseRoutine(value: unknown, index: number, errors: string[]): MedicationRoutine | null {
  const path = `routines[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const drugId = readString(value, "drugId", path, errors, { max: 128, pattern: ID_PATTERN });
  const presentationId = readString(value, "presentationId", path, errors, { max: 128, pattern: ID_PATTERN });
  const memberId = readString(value, "memberId", path, errors, { max: 128, pattern: ID_PATTERN });
  const quantity = readString(value, "quantity", path, errors, { max: 120 });
  const instruction = readString(value, "instruction", path, errors, { max: 500 });
  const times = Array.isArray(value.times)
    ? value.times.filter((time): time is string => typeof time === "string" && TIME_PATTERN.test(time)).slice(0, 24)
    : [];
  if (!Array.isArray(value.times) || times.length !== value.times.length || times.length === 0) {
    errors.push(`${path}.times deve conter de 1 a 24 horários HH:mm válidos`);
  }
  const active = value.active;
  if (active !== undefined && typeof active !== "boolean") errors.push(`${path}.active deve ser booleano`);
  if (!id || !drugId || !presentationId || !memberId || !quantity || !instruction || !times.length) return null;
  return { id, drugId, presentationId, memberId, quantity, times, instruction, ...(typeof active === "boolean" ? { active } : {}) };
}

function parseLog(value: unknown, index: number, errors: string[]): DoseLog | null {
  const path = `logs[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const routineId = readString(value, "routineId", path, errors, { max: 128, pattern: ID_PATTERN });
  const memberId = readString(value, "memberId", path, errors, { max: 128, pattern: ID_PATTERN });
  const date = readString(value, "date", path, errors, { max: 10, pattern: DATE_PATTERN });
  const scheduledTime = readString(value, "scheduledTime", path, errors, { max: 5, pattern: TIME_PATTERN });
  const recordedAt = readString(value, "recordedAt", path, errors, { max: 5, pattern: TIME_PATTERN });
  const status = value.status;
  if (typeof status !== "string" || !DOSE_STATUSES.has(status as DoseStatus)) errors.push(`${path}.status é inválido`);
  if (!id || !routineId || !memberId || !date || !scheduledTime || !recordedAt || !DOSE_STATUSES.has(status as DoseStatus)) return null;
  return { id, routineId, memberId, date, scheduledTime, status: status as DoseStatus, recordedAt };
}

function parseDocument(value: unknown, index: number, errors: string[]): HealthDocument | null {
  const path = `documents[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${path} deve ser um objeto`);
    return null;
  }
  const id = readString(value, "id", path, errors, { max: 128, pattern: ID_PATTERN });
  const title = readString(value, "title", path, errors, { max: 200 });
  const memberId = readString(value, "memberId", path, errors, { max: 128, pattern: ID_PATTERN });
  const date = readString(value, "date", path, errors, { max: 10, pattern: DATE_PATTERN });
  const fileName = readString(value, "fileName", path, errors, { max: 240, pattern: FILE_NAME_PATTERN });
  const mimeType = readString(value, "mimeType", path, errors, { max: 120 });
  const dataUrl = readString(value, "dataUrl", path, errors, { max: 1_500_000, pattern: DOCUMENT_DATA_PATTERN, optional: true });
  const nativeDocumentId = readString(value, "nativeDocumentId", path, errors, { max: 36, pattern: UUID_PATTERN, optional: true });
  const category = value.category;
  if (typeof category !== "string" || !DOCUMENT_CATEGORIES.has(category as DocumentCategory)) errors.push(`${path}.category é inválida`);
  if (mimeType && !DOCUMENT_MIME_TYPES.has(mimeType)) errors.push(`${path}.mimeType não é permitido`);
  if (dataUrl && mimeType && !dataUrl.toLocaleLowerCase("en-US").startsWith(`data:${mimeType.toLocaleLowerCase("en-US")}`)) {
    errors.push(`${path}.dataUrl não corresponde ao mimeType`);
  }
  const fileSize = value.fileSize;
  if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || (fileSize as number) < 0 || (fileSize as number) > 100_000_000)) {
    errors.push(`${path}.fileSize é inválido`);
  }
  if (!id || !title || !memberId || !date || !fileName || !mimeType || !DOCUMENT_MIME_TYPES.has(mimeType) || !DOCUMENT_CATEGORIES.has(category as DocumentCategory)) return null;
  return {
    id,
    title,
    memberId,
    category: category as DocumentCategory,
    date,
    fileName,
    mimeType,
    ...(dataUrl ? { dataUrl } : {}),
    ...(nativeDocumentId ? { nativeDocumentId } : {}),
    ...(typeof fileSize === "number" ? { fileSize } : {}),
  };
}

export function validateAppState(value: unknown): AppStateValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { success: false, errors: ["state deve ser um objeto"] };

  const members = readArray(value, "members", errors).map((item, index) => parseMember(item, index, errors)).filter((item): item is Member => item !== null);
  const drugs = readArray(value, "drugs", errors).map((item, index) => parseDrug(item, index, errors)).filter((item): item is Drug => item !== null);
  const presentations = readArray(value, "presentations", errors).map((item, index) => parsePresentation(item, index, errors)).filter((item): item is MedicationPresentation => item !== null);
  const routines = readArray(value, "routines", errors).map((item, index) => parseRoutine(item, index, errors)).filter((item): item is MedicationRoutine => item !== null);
  const logs = readArray(value, "logs", errors).map((item, index) => parseLog(item, index, errors)).filter((item): item is DoseLog => item !== null);
  const documents = readArray(value, "documents", errors).map((item, index) => parseDocument(item, index, errors)).filter((item): item is HealthDocument => item !== null);

  for (const [path, items] of Object.entries({ members, drugs, presentations, routines, logs, documents })) {
    ensureUniqueIds(items, path, errors);
  }

  const memberIds = new Set(members.map((item) => item.id));
  const drugIds = new Set(drugs.map((item) => item.id));
  const presentationsById = new Map(presentations.map((item) => [item.id, item]));
  const routineIds = new Set(routines.map((item) => item.id));
  presentations.forEach((item, index) => {
    if (!drugIds.has(item.drugId)) errors.push(`presentations[${index}].drugId não existe`);
  });
  routines.forEach((item, index) => {
    const presentation = presentationsById.get(item.presentationId);
    if (!memberIds.has(item.memberId)) errors.push(`routines[${index}].memberId não existe`);
    if (!drugIds.has(item.drugId)) errors.push(`routines[${index}].drugId não existe`);
    if (!presentation || presentation.drugId !== item.drugId) errors.push(`routines[${index}].presentationId não corresponde ao medicamento`);
  });
  logs.forEach((item, index) => {
    if (!memberIds.has(item.memberId)) errors.push(`logs[${index}].memberId não existe`);
    if (!routineIds.has(item.routineId)) errors.push(`logs[${index}].routineId não existe`);
  });
  documents.forEach((item, index) => {
    if (!memberIds.has(item.memberId)) errors.push(`documents[${index}].memberId não existe`);
  });

  return errors.length ? { success: false, errors: errors.slice(0, 50) } : {
    success: true,
    state: { members, drugs, presentations, routines, logs, documents },
  };
}
