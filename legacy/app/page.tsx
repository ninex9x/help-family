"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  validateAppState,
  type AppState,
  type DocumentCategory,
  type DoseLog,
  type DoseStatus,
  type Drug,
  type HealthDocument,
  type MedicationPresentation,
  type MedicationRoutine,
  type Member,
} from "../lib/health-state";

type View = "today" | "family" | "medicines" | "history" | "documents";
type Modal = "member" | "drug" | "presentation" | "routine" | "document" | "document-viewer" | null;
type Theme = "light" | "dark";
declare global {
  interface Window {
    CuraFamiliaDemo?: boolean;
    CuraFamiliaResetDemo?: () => void;
    CuraFamiliaAndroid?: {
      saveDocument: (fileName: string, mimeType: string, dataUrl: string) => void;
      saveStoredDocument?: (documentId: string, fileName: string, mimeType: string) => void;
      scanDocument?: () => void;
      loadState?: () => void;
      saveState?: (json: string) => boolean;
    };
    CuraFamiliaReceiveState?: (json: string | null) => void;
    CuraFamiliaStateError?: (message: string) => void;
    CuraFamiliaReceiveScan?: (fileName: string, mimeType: string, documentId: string, fileSize: number) => void;
    CuraFamiliaScanCancelled?: (message: string) => void;
  }
}

type TodayDose = {
  routine: MedicationRoutine;
  drug: Drug;
  presentation: MedicationPresentation;
  member: Member;
  time: string;
  log?: DoseLog;
  isLate: boolean;
};

type NativeDocumentScan = {
  fileName: string;
  mimeType: string;
  documentId: string;
  fileSize: number;
};

function PdfDocumentViewer({ sourceUrl, title }: { sourceUrl: string; title: string }) {
  const pagesRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Preparando documento...");

  useEffect(() => {
    let cancelled = false;
    let cancelLoading: (() => void) | undefined;

    async function renderPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        let bytes: Uint8Array;
        if (sourceUrl.startsWith("data:")) {
          const encoded = sourceUrl.slice(sourceUrl.indexOf(",") + 1);
          const binary = window.atob(encoded);
          bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        } else {
          const response = await fetch(sourceUrl);
          if (!response.ok) throw new Error("Documento indisponível");
          bytes = new Uint8Array(await response.arrayBuffer());
        }

        const loadingTask = pdfjs.getDocument({ data: bytes });
        cancelLoading = () => { void loadingTask.destroy(); };
        const pdf = await loadingTask.promise;
        if (cancelled || !pagesRef.current) return;

        const container = pagesRef.current;
        container.replaceChildren();
        const availableWidth = Math.max(280, container.clientWidth - 36);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) break;
          setStatus(`Carregando página ${pageNumber} de ${pdf.numPages}...`);
          const page = await pdf.getPage(pageNumber);
          const naturalViewport = page.getViewport({ scale: 1 });
          const cssScale = Math.min(1.6, availableWidth / naturalViewport.width);
          const viewport = page.getViewport({ scale: cssScale * pixelRatio });
          const canvas = window.document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) throw new Error("Canvas indisponível");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
          canvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
          canvas.setAttribute("aria-label", `${title}, página ${pageNumber}`);
          container.appendChild(canvas);
          await page.render({ canvas, canvasContext: context, viewport }).promise;
        }

        if (!cancelled) setStatus("");
      } catch {
        if (!cancelled) setStatus("Não foi possível visualizar este PDF.");
      }
    }

    void renderPdf();
    return () => {
      cancelled = true;
      cancelLoading?.();
    };
  }, [sourceUrl, title]);

  return <div className="pdf-document-viewer" aria-label={`PDF: ${title}`}>
    {status && <p className="pdf-viewer-status">{status}</p>}
    <div className="pdf-document-pages" ref={pagesRef} />
  </div>;
}

type LegacyMedicine = {
  id: string;
  name: string;
  dose: string;
  memberId: string;
  times: string[];
  instruction: string;
  color: string;
  active?: boolean;
};

type LegacyDoseLog = Omit<DoseLog, "routineId"> & { routineId?: string; medicineId?: string };

type PersistedState = {
  members?: Member[];
  drugs?: Drug[];
  presentations?: MedicationPresentation[];
  routines?: MedicationRoutine[];
  medicines?: LegacyMedicine[];
  logs?: LegacyDoseLog[];
  documents?: HealthDocument[];
};

const STORAGE_KEY = "cuidar-med-family-v1";
const THEME_STORAGE_KEY = "cura-family-theme";
const THEME_CHANGE_EVENT = "cura-family-theme-change";
const STATE_API_PATH = "/api/state";
const BACKEND_SAVE_DELAY_MS = 600;
const HISTORY_PAGE_SIZE = 5;
const DOCUMENT_CATEGORIES: { id: "all" | DocumentCategory; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "prescription", label: "Receitas" },
  { id: "exam", label: "Exames" },
  { id: "certificate", label: "Atestados" },
];
const DOCUMENT_CATEGORY_DETAILS: Record<DocumentCategory, { label: string; icon: string }> = {
  prescription: { label: "Receita", icon: "prescriptions" },
  exam: { label: "Exame", icon: "science" },
  certificate: { label: "Atestado", icon: "medical_information" },
};
const MEMBER_COLORS = ["#a43c12", "#016b54", "#075fab", "#7a4f9a", "#b17800"];
const MEDICINE_COLORS = ["#a43c12", "#016b54", "#075fab", "#8a4d8d", "#b46b00"];

function subscribeToTheme(onThemeChange: () => void) {
  window.addEventListener(THEME_CHANGE_EVENT, onThemeChange);
  return () => window.removeEventListener(THEME_CHANGE_EVENT, onThemeChange);
}

function getThemeSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function getServerThemeSnapshot(): Theme {
  return "light";
}

function Icon({ children, filled = false }: { children: string; filled?: boolean }) {
  return <span className={`material-symbols-outlined${filled ? " icon-filled" : ""}`} aria-hidden="true">{children}</span>;
}

function MemberAvatar({ member, avatarClassName, photoClassName }: { member: Member; avatarClassName: string; photoClassName: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string | undefined>();
  if (member.photo && failedPhoto !== member.photo) {
    return <img className={photoClassName} src={member.photo} alt={`Foto de ${member.name}`} onError={() => setFailedPhoto(member.photo)} />;
  }
  return <span className={avatarClassName} style={{ background: member.color }}>{member.initials}</span>;
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateDaysAgo(days: number, referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setDate(date.getDate() - days);
  return localDateKey(date);
}

function createDemoState(referenceDate = new Date()): AppState {
  const today = localDateKey(referenceDate);
  const members: Member[] = [
    { id: "joao", name: "João", relationship: "Pai", initials: "JO", color: "#a43c12" },
    { id: "ana", name: "Ana", relationship: "Mãe", initials: "AN", color: "#016b54" },
    { id: "maria", name: "Maria", relationship: "Meu perfil", initials: "MA", color: "#075fab" },
  ];
  const drugs: Drug[] = [
    { id: "drug-pantoprazol", name: "Pantoprazol", color: "#016b54" },
    { id: "drug-losartana", name: "Losartana Potássica", color: "#a43c12" },
    { id: "drug-metformina", name: "Metformina", color: "#075fab" },
    { id: "drug-anlodipino", name: "Anlodipino", color: "#8a4d8d" },
    { id: "drug-atorvastatina", name: "Atorvastatina", color: "#016b54" },
    { id: "drug-vitamina-d", name: "Vitamina D", color: "#075fab" },
    { id: "drug-dipirona", name: "Dipirona", color: "#8a4d8d" },
  ];
  const presentations: MedicationPresentation[] = [
    { id: "presentation-pantoprazol-40", drugId: "drug-pantoprazol", strength: "40 mg", form: "comprimido" },
    { id: "presentation-losartana-50", drugId: "drug-losartana", strength: "50 mg", form: "comprimido" },
    { id: "presentation-metformina-850", drugId: "drug-metformina", strength: "850 mg", form: "comprimido" },
    { id: "presentation-anlodipino-5", drugId: "drug-anlodipino", strength: "5 mg", form: "comprimido" },
    { id: "presentation-atorvastatina-20", drugId: "drug-atorvastatina", strength: "20 mg", form: "comprimido" },
    { id: "presentation-vitamina-d", drugId: "drug-vitamina-d", strength: "1.000 UI", form: "cápsula" },
    { id: "presentation-dipirona-500", drugId: "drug-dipirona", strength: "500 mg", form: "comprimido" },
    { id: "presentation-dipirona-1g", drugId: "drug-dipirona", strength: "1 g", form: "comprimido" },
    { id: "presentation-dipirona-gotas", drugId: "drug-dipirona", strength: "500 mg/mL", form: "gotas" },
  ];
  const routines: MedicationRoutine[] = [
    { id: "pantoprazol", drugId: "drug-pantoprazol", presentationId: "presentation-pantoprazol-40", memberId: "joao", quantity: "1 comprimido", times: ["07:00"], instruction: "Tomar em jejum" },
    { id: "losartana", drugId: "drug-losartana", presentationId: "presentation-losartana-50", memberId: "joao", quantity: "1 comprimido", times: ["08:00"], instruction: "Tomar logo após o café da manhã" },
    { id: "metformina", drugId: "drug-metformina", presentationId: "presentation-metformina-850", memberId: "joao", quantity: "1 comprimido", times: ["13:00"], instruction: "Tomar junto do almoço" },
    { id: "anlodipino", drugId: "drug-anlodipino", presentationId: "presentation-anlodipino-5", memberId: "joao", quantity: "1 comprimido", times: ["20:00"], instruction: "Conforme orientação médica" },
    { id: "atorvastatina", drugId: "drug-atorvastatina", presentationId: "presentation-atorvastatina-20", memberId: "ana", quantity: "1 comprimido", times: ["21:00"], instruction: "Conforme orientação médica" },
    { id: "vitamina-d", drugId: "drug-vitamina-d", presentationId: "presentation-vitamina-d", memberId: "maria", quantity: "1 cápsula", times: ["09:00"], instruction: "Após o café da manhã" },
    { id: "dipirona", drugId: "drug-dipirona", presentationId: "presentation-dipirona-1g", memberId: "ana", quantity: "1 comprimido", times: ["18:00"], instruction: "Se dor ou febre", active: false },
    { id: "dipirona-joao", drugId: "drug-dipirona", presentationId: "presentation-dipirona-500", memberId: "joao", quantity: "1 comprimido", times: ["18:00"], instruction: "Somente conforme orientação médica", active: false },
  ];
  const logs: DoseLog[] = [
    { id: "demo-1", routineId: "pantoprazol", memberId: "joao", date: today, scheduledTime: "07:00", status: "taken", recordedAt: "07:04" },
    { id: "demo-2", routineId: "atorvastatina", memberId: "ana", date: dateDaysAgo(1, referenceDate), scheduledTime: "21:00", status: "taken", recordedAt: "21:06" },
    { id: "demo-3", routineId: "losartana", memberId: "joao", date: dateDaysAgo(1, referenceDate), scheduledTime: "08:00", status: "taken", recordedAt: "08:02" },
    { id: "demo-4", routineId: "metformina", memberId: "joao", date: dateDaysAgo(2, referenceDate), scheduledTime: "13:00", status: "skipped", recordedAt: "15:20" },
  ];
  const documents: HealthDocument[] = [
    { id: "document-demo-1", title: "Receita Uso Contínuo - Losartana", memberId: "joao", category: "prescription", date: dateDaysAgo(13, referenceDate), fileName: "receita-losartana.txt", mimeType: "text/plain" },
    { id: "document-demo-2", title: "Hemograma Completo", memberId: "maria", category: "exam", date: dateDaysAgo(30, referenceDate), fileName: "hemograma-completo.txt", mimeType: "text/plain" },
    { id: "document-demo-3", title: "Atestado Médico - 5 dias", memberId: "ana", category: "certificate", date: dateDaysAgo(45, referenceDate), fileName: "atestado-medico.txt", mimeType: "text/plain" },
  ];
  return { members, drugs, presentations, routines, logs, documents };
}

function inferMedicationForm(value: string) {
  const normalized = value.toLocaleLowerCase("pt-BR");
  if (normalized.includes("gota")) return "gotas";
  if (normalized.includes("cápsula")) return "cápsula";
  if (normalized.includes("ml")) return "líquido";
  if (normalized.includes("ui")) return "aplicação";
  return "comprimido";
}

function migrateStoredState(raw: unknown): AppState {
  const defaults = createDemoState();
  if (!raw || typeof raw !== "object") return defaults;
  const parsed = raw as PersistedState;
  const members = Array.isArray(parsed.members) ? parsed.members : defaults.members;
  const documents = Array.isArray(parsed.documents) ? parsed.documents : defaults.documents;
  const migrateLogs = (logs: LegacyDoseLog[] | undefined) => {
    const sourceLogs: LegacyDoseLog[] = logs ?? defaults.logs;
    return sourceLogs.map((log) => ({
      id: log.id,
      routineId: log.routineId ?? log.medicineId ?? "",
      memberId: log.memberId,
      date: log.date,
      scheduledTime: log.scheduledTime,
      status: log.status,
      recordedAt: log.recordedAt,
    })).filter((log) => Boolean(log.routineId));
  };

  if (Array.isArray(parsed.drugs) && Array.isArray(parsed.presentations) && Array.isArray(parsed.routines)) {
    return { members, drugs: parsed.drugs, presentations: parsed.presentations, routines: parsed.routines, logs: migrateLogs(parsed.logs), documents };
  }

  if (!Array.isArray(parsed.medicines) || !parsed.medicines.length) return { ...defaults, members, documents };

  const drugs: Drug[] = [];
  const presentations: MedicationPresentation[] = [];
  const routines: MedicationRoutine[] = [];
  const drugIds = new Map<string, string>();
  const presentationIds = new Map<string, string>();

  parsed.medicines.forEach((legacy, index) => {
    const drugKey = legacy.name.trim().toLocaleLowerCase("pt-BR");
    let drugId = drugIds.get(drugKey);
    if (!drugId) {
      drugId = `migrated-drug-${index}-${legacy.id}`;
      drugIds.set(drugKey, drugId);
      drugs.push({ id: drugId, name: legacy.name, color: legacy.color || MEDICINE_COLORS[drugs.length % MEDICINE_COLORS.length] });
    }
    const doseParts = legacy.dose.split("·").map((part) => part.trim()).filter(Boolean);
    const hasSeparateQuantity = doseParts.length > 1;
    const strength = hasSeparateQuantity ? doseParts[0] : "Concentração não informada";
    const quantity = hasSeparateQuantity ? doseParts.slice(1).join(" · ") : legacy.dose || "Dose não informada";
    const form = inferMedicationForm(quantity);
    const presentationKey = `${drugId}|${strength}|${form}`.toLocaleLowerCase("pt-BR");
    let presentationId = presentationIds.get(presentationKey);
    if (!presentationId) {
      presentationId = `migrated-presentation-${presentations.length}-${legacy.id}`;
      presentationIds.set(presentationKey, presentationId);
      presentations.push({ id: presentationId, drugId, strength, form });
    }
    routines.push({ id: legacy.id, drugId, presentationId, memberId: legacy.memberId, quantity, times: legacy.times, instruction: legacy.instruction, active: legacy.active });
  });

  return { members, drugs, presentations, routines, logs: migrateLogs(parsed.logs), documents };
}

function parseStoredState(raw: unknown) {
  try {
    const migrated = migrateStoredState(raw);
    const validation = validateAppState(migrated);
    return validation.success ? validation.state : undefined;
  } catch {
    return undefined;
  }
}

type NativeStateResult =
  | { available: false }
  | { available: true; state?: string | null; error?: string };

function readNativeState(): Promise<NativeStateResult> {
  const bridge = window.CuraFamiliaAndroid;
  if (!bridge?.loadState || !bridge.saveState) return Promise.resolve({ available: false });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: NativeStateResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (window.CuraFamiliaReceiveState === receiveState) delete window.CuraFamiliaReceiveState;
      if (window.CuraFamiliaStateError === receiveError) delete window.CuraFamiliaStateError;
      resolve(result);
    };
    const receiveState = (json: string | null) => finish({ available: true, state: json });
    const receiveError = (message: string) => finish({ available: true, error: message });

    window.CuraFamiliaReceiveState = receiveState;
    window.CuraFamiliaStateError = receiveError;
    const timer = window.setTimeout(() => finish({ available: true, error: "Tempo esgotado ao abrir o armazenamento seguro" }), 3_000);
    try {
      bridge.loadState!();
    } catch {
      finish({ available: true, error: "Não foi possível abrir o armazenamento seguro" });
    }
  });
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function initialsFromName(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatHistoryDate(dateKey: string, today: string) {
  if (dateKey === today) return "Hoje";
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    .format(new Date(year, month - 1, day))
    .replace(/\./g, "");
}

function formatDocumentDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(year, month - 1, day));
}

function scannedDocumentFileName(title: string) {
  const safeTitle = title.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").replace(/[. ]+$/g, "");
  return `${safeTitle || "documento-digitalizado"}.pdf`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function optimizeMemberPhoto(file: File) {
  const source = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const preview = new Image();
    preview.onload = () => resolve(preview);
    preview.onerror = () => reject(new Error("Formato de imagem inválido"));
    preview.src = source;
  });
  const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - cropSize) / 2;
  const sourceY = (image.naturalHeight - cropSize) / 2;
  const outputSize = Math.min(640, cropSize);
  const canvas = window.document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a foto");
  context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export default function Home() {
  const demoMode = typeof window !== "undefined" && window.CuraFamiliaDemo === true;
  const [view, setView] = useState<View>("today");
  const [modal, setModal] = useState<Modal>(null);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [memberPhoto, setMemberPhoto] = useState("");
  const [state, setState] = useState<AppState>(() => createDemoState(new Date(2024, 0, 15, 12)));
  const [selectedMemberId, setSelectedMemberId] = useState("joao");
  const [medicineMemberId, setMedicineMemberId] = useState("joao");
  const [routineDrugId, setRoutineDrugId] = useState("drug-pantoprazol");
  const [routinePresentationId, setRoutinePresentationId] = useState("presentation-pantoprazol-40");
  const [presentationDrugId, setPresentationDrugId] = useState("drug-dipirona");
  const [historyMember, setHistoryMember] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyPage, setHistoryPage] = useState(1);
  const [documentFilter, setDocumentFilter] = useState<"all" | DocumentCategory>("all");
  const [documentMemberFilter, setDocumentMemberFilter] = useState("all");
  const [documentSearch, setDocumentSearch] = useState("");
  const [documentTitle, setDocumentTitle] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [nativeDocumentScan, setNativeDocumentScan] = useState<NativeDocumentScan | null>(null);
  const [documentPreparing, setDocumentPreparing] = useState(false);
  const documentSearchRef = useRef<HTMLInputElement>(null);
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [hydrated, setHydrated] = useState(false);
  const [clockMinutes, setClockMinutes] = useState(12 * 60);
  const [today, setToday] = useState("2024-01-15");
  const [toast, setToast] = useState("");
  const backendAvailableRef = useRef(false);
  const backendRevisionRef = useRef(0);
  const nativeStorageReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function hydrateState() {
      let savedState: AppState | undefined;
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) savedState = parseStoredState(JSON.parse(saved));
      } catch {
        // Dados antigos inválidos não impedem a abertura do aplicativo.
      }

      let parsed = savedState ?? createDemoState();
      const native = await readNativeState();
      if (cancelled) return;
      if (native.available) {
        if (native.error) {
          nativeStorageReadyRef.current = false;
          if (!cancelled) setToast(native.error);
        } else {
          nativeStorageReadyRef.current = true;
          if (native.state) {
            let secureState: AppState | undefined;
            try {
              secureState = parseStoredState(JSON.parse(native.state));
            } catch {
              nativeStorageReadyRef.current = false;
              if (!cancelled) setToast("Os dados seguros do aplicativo estão corrompidos");
            }
            if (secureState) {
              parsed = secureState;
              window.localStorage.removeItem(STORAGE_KEY);
            } else {
              nativeStorageReadyRef.current = false;
              if (!cancelled) setToast("Os dados seguros do aplicativo estão corrompidos");
            }
          }
        }
      } else {
        try {
          const response = await fetch(STATE_API_PATH, { cache: "no-store", signal: controller.signal });
          if (response.ok) {
            const backend = await response.json() as { state?: unknown; revision?: unknown };
            const backendState = backend.state ? parseStoredState(backend.state) : undefined;
            if (backendState) {
              parsed = backendState;
              window.localStorage.removeItem(STORAGE_KEY);
              backendRevisionRef.current = typeof backend.revision === "number" ? backend.revision : 0;
              backendAvailableRef.current = true;
            } else if (backend.state) {
              if (!cancelled) setToast("O backend local contém dados inválidos e não será sobrescrito");
            } else {
              backendRevisionRef.current = typeof backend.revision === "number" ? backend.revision : 0;
              backendAvailableRef.current = true;
            }
          } else {
            throw new Error("Backend indisponível");
          }
        } catch {
          if (!cancelled && !controller.signal.aborted) {
            setToast("Backend indisponível; mudanças ficarão somente nesta sessão");
          }
        }
      }

      if (cancelled) return;
      const now = new Date();
      setState(parsed);
      setToday(localDateKey(now));
      setClockMinutes(now.getHours() * 60 + now.getMinutes());
      if (parsed.members.length) {
        setSelectedMemberId((current) => parsed.members.some((member) => member.id === current) ? current : parsed.members[0].id);
      }
      setHydrated(true);
    }

    void hydrateState();
    const clockTimer = window.setInterval(() => {
      const now = new Date();
      setClockMinutes(now.getHours() * 60 + now.getMinutes());
      setToday(localDateKey(now));
    }, 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(clockTimer);
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const nativeBridge = window.CuraFamiliaAndroid;
    if (nativeBridge?.saveState) {
      if (!nativeStorageReadyRef.current) return;
      try {
        if (nativeBridge.saveState(JSON.stringify(state))) {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          console.warn("O armazenamento seguro do Android recusou a gravação");
          window.setTimeout(() => setToast("Não foi possível salvar no armazenamento seguro"), 0);
        }
      } catch (error) {
        console.warn("Não foi possível gravar no armazenamento seguro do Android", error);
        window.setTimeout(() => setToast("Não foi possível salvar no armazenamento seguro"), 0);
      }
      return;
    }

    if (!backendAvailableRef.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(STATE_API_PATH, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state, expectedRevision: backendRevisionRef.current }),
          signal: controller.signal,
        });
        const result = await response.json() as { revision?: unknown };
        if (response.status === 409) {
          backendAvailableRef.current = false;
          setToast("Dados alterados em outra sessão; recarregue antes de salvar");
          return;
        }
        if (!response.ok) throw new Error("Backend indisponível");
        if (typeof result.revision === "number") backendRevisionRef.current = result.revision;
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Persistência no backend local indisponível; dados mantidos apenas nesta sessão", error);
        backendAvailableRef.current = false;
        setToast("Falha ao salvar; dados mantidos apenas nesta sessão");
      }
    }, BACKEND_SAVE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [state, hydrated]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    window.CuraFamiliaReceiveScan = (_fileName, mimeType, documentId, fileSize) => {
      setDocumentFile(null);
      setNativeDocumentScan({ fileName: _fileName, mimeType, documentId, fileSize });
      setDocumentPreparing(false);
      setToast("Lote digitalizado e pronto para salvar");
    };
    window.CuraFamiliaScanCancelled = (message) => {
      setDocumentPreparing(false);
      if (message) setToast(message);
    };
    return () => {
      delete window.CuraFamiliaReceiveScan;
      delete window.CuraFamiliaScanCancelled;
    };
  }, []);

  const doses = useMemo<TodayDose[]>(() => state.routines.filter((routine) => routine.active !== false).flatMap((routine) =>
    routine.times.map((time) => {
      const member = state.members.find((item) => item.id === routine.memberId);
      const drug = state.drugs.find((item) => item.id === routine.drugId);
      const presentation = state.presentations.find((item) => item.id === routine.presentationId);
      if (!member || !drug || !presentation) return null;
      const log = state.logs.find((item) => item.date === today && item.routineId === routine.id && item.scheduledTime === time);
      return { routine, drug, presentation, member, time, log, isLate: !log && minutesFromTime(time) < clockMinutes };
    }).filter(Boolean) as TodayDose[],
  ).sort((a, b) => a.time.localeCompare(b.time)), [state, today, clockMinutes]);

  const selectedMember = state.members.find((member) => member.id === selectedMemberId) ?? state.members[0];
  const visibleDoses = doses.filter((dose) => dose.member.id === selectedMember?.id);
  const pendingDoses = visibleDoses.filter((dose) => !dose.log);
  const focusDose = pendingDoses.find((dose) => dose.isLate) ?? pendingDoses[0];
  const takenCount = visibleDoses.filter((dose) => dose.log?.status === "taken").length;
  const progress = visibleDoses.length ? Math.round((takenCount / visibleDoses.length) * 100) : 0;

  const periods = [
    { id: "morning", label: "Manhã", icon: "light_mode", doses: visibleDoses.filter((dose) => minutesFromTime(dose.time) < 12 * 60) },
    { id: "afternoon", label: "Tarde", icon: "wb_sunny", doses: visibleDoses.filter((dose) => minutesFromTime(dose.time) >= 12 * 60 && minutesFromTime(dose.time) < 18 * 60) },
    { id: "night", label: "Noite", icon: "dark_mode", doses: visibleDoses.filter((dose) => minutesFromTime(dose.time) >= 18 * 60) },
  ].filter((period) => period.doses.length);

  const navItems: { id: View; label: string; mobileLabel: string; icon: string }[] = [
    { id: "today", label: "Hoje", mobileLabel: "Hoje", icon: "today" },
    { id: "family", label: "Familiares", mobileLabel: "Familiares", icon: "family_restroom" },
    { id: "medicines", label: "Medicamentos", mobileLabel: "Meds", icon: "medication" },
    { id: "history", label: "Histórico", mobileLabel: "Histórico", icon: "history" },
    { id: "documents", label: "Documentos", mobileLabel: "Docs", icon: "description" },
  ];

  const greeting = clockMinutes < 12 * 60 ? "Bom dia" : clockMinutes < 18 * 60 ? "Boa tarde" : "Boa noite";
  const [todayYear, todayMonth, todayDay] = today.split("-").map(Number);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", weekday: "long" }).format(new Date(todayYear, todayMonth - 1, todayDay, 12));
  const memberById = (id: string) => state.members.find((member) => member.id === id);
  const drugById = (id: string) => state.drugs.find((drug) => drug.id === id);
  const presentationById = (id: string) => state.presentations.find((presentation) => presentation.id === id);
  const routineById = (id: string) => state.routines.find((routine) => routine.id === id);
  const availableRoutinePresentations = state.presentations.filter((presentation) => presentation.drugId === routineDrugId);
  const normalizedHistorySearch = historySearch.trim().toLocaleLowerCase("pt-BR");
  const filteredHistoryLogs = state.logs
    .filter((log) => historyMember === "all" || log.memberId === historyMember)
    .filter((log) => {
      const routine = routineById(log.routineId);
      return routine ? drugById(routine.drugId)?.name.toLocaleLowerCase("pt-BR").includes(normalizedHistorySearch) : false;
    })
    .sort((a, b) => `${b.date}${b.scheduledTime}${b.recordedAt}`.localeCompare(`${a.date}${a.scheduledTime}${a.recordedAt}`));
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryLogs.length / HISTORY_PAGE_SIZE));
  const safeHistoryPage = Math.min(historyPage, historyTotalPages);
  const historyPageStart = (safeHistoryPage - 1) * HISTORY_PAGE_SIZE;
  const visibleHistoryLogs = filteredHistoryLogs.slice(historyPageStart, historyPageStart + HISTORY_PAGE_SIZE);
  const historyResultStart = filteredHistoryLogs.length ? historyPageStart + 1 : 0;
  const historyResultEnd = Math.min(historyPageStart + HISTORY_PAGE_SIZE, filteredHistoryLogs.length);
  const selectedDocumentMember = documentMemberFilter === "all" ? undefined : memberById(documentMemberFilter);
  const selectedHealthDocument = selectedDocumentId ? state.documents.find((document) => document.id === selectedDocumentId) : undefined;
  const selectedDocumentSource = selectedHealthDocument?.dataUrl
    ?? (selectedHealthDocument?.nativeDocumentId ? `/native-documents/${encodeURIComponent(selectedHealthDocument.nativeDocumentId)}` : undefined);
  const normalizedDocumentSearch = documentSearch.trim().toLocaleLowerCase("pt-BR");
  const visibleDocuments = [...state.documents]
    .filter((document) => documentMemberFilter === "all" || document.memberId === documentMemberFilter)
    .filter((document) => documentFilter === "all" || document.category === documentFilter)
    .filter((document) => {
      if (!normalizedDocumentSearch) return true;
      const member = memberById(document.memberId);
      const category = DOCUMENT_CATEGORY_DETAILS[document.category];
      return [document.title, document.fileName, member?.name ?? "", member?.relationship ?? "", category.label]
        .some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedDocumentSearch));
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  function navigate(nextView: View) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleTheme() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextTheme === "dark" ? "#0f0f0f" : "#f4f1ea");
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  function openDocuments(memberId?: string) {
    setDocumentMemberFilter(memberId ?? "all");
    setDocumentFilter("all");
    setDocumentSearch("");
    navigate("documents");
  }

  function focusDocumentSearch() {
    window.document.getElementById("document-filters")?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => documentSearchRef.current?.focus(), 250);
  }

  function openHealthDocument(documentId: string) {
    setSelectedDocumentId(documentId);
    setModal("document-viewer");
  }

  function recordDose(dose: TodayDose, status: DoseStatus) {
    const now = new Date();
    const recordedAt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    setState((current) => ({
      ...current,
      logs: [
        ...current.logs.filter((log) => !(log.date === today && log.routineId === dose.routine.id && log.scheduledTime === dose.time)),
        { id: `log-${Date.now()}`, routineId: dose.routine.id, memberId: dose.member.id, date: today, scheduledTime: dose.time, status, recordedAt },
      ],
    }));
    setToast(status === "taken" ? "Dose registrada como tomada" : "Dose marcada como não tomada");
  }

  function openMemberModal(memberId?: string) {
    const member = memberId ? state.members.find((item) => item.id === memberId) : undefined;
    setEditingMemberId(member?.id ?? null);
    setMemberPhoto(member?.photo ?? "");
    setModal("member");
  }

  function openMedicineModal(memberId?: string, drugId?: string) {
    const targetMemberId = memberId ?? selectedMember?.id ?? state.members[0]?.id;
    if (!targetMemberId) {
      setToast("Cadastre um familiar antes de criar o medicamento");
      navigate("family");
      return;
    }
    const targetDrugId = drugId ?? state.drugs[0]?.id;
    const targetPresentationId = state.presentations.find((presentation) => presentation.drugId === targetDrugId)?.id;
    if (!targetDrugId || !targetPresentationId) {
      setToast("Cadastre um medicamento e uma apresentação primeiro");
      setModal("drug");
      return;
    }
    setMedicineMemberId(targetMemberId);
    setRoutineDrugId(targetDrugId);
    setRoutinePresentationId(targetPresentationId);
    setModal("routine");
  }

  function openPresentationModal(drugId: string) {
    setPresentationDrugId(drugId);
    setModal("presentation");
  }

  function closeModal() {
    setModal(null);
    setEditingMemberId(null);
    setMemberPhoto("");
    setSelectedDocumentId(null);
    setDocumentTitle("");
    setDocumentFile(null);
    setNativeDocumentScan(null);
    setDocumentPreparing(false);
  }

  async function handleMemberPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setToast("Escolha um arquivo de imagem");
      event.target.value = "";
      return;
    }
    if (file.size > 12_000_000) {
      setToast("Escolha uma foto com até 12 MB");
      event.target.value = "";
      return;
    }
    try {
      setMemberPhoto(await optimizeMemberPhoto(file));
      setToast("Foto pronta para salvar");
    } catch {
      setToast("Não foi possível carregar esta foto");
    }
    event.target.value = "";
  }

  function saveMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    if (!name) return;
    const relationship = String(data.get("relationship") || "Familiar");
    const medicalNotes = String(data.get("medicalNotes") || "").trim();
    if (editingMemberId) {
      setState((current) => ({ ...current, members: current.members.map((member) => member.id === editingMemberId ? { ...member, name, relationship, initials: initialsFromName(name), photo: memberPhoto || undefined, medicalNotes } : member) }));
      setToast(`Perfil de ${name} atualizado`);
    } else {
      const id = `member-${Date.now()}`;
      setState((current) => ({ ...current, members: [...current.members, { id, name, relationship, initials: initialsFromName(name), color: MEMBER_COLORS[current.members.length % MEMBER_COLORS.length], photo: memberPhoto || undefined, medicalNotes }] }));
      setSelectedMemberId(id);
      setToast(`${name} foi adicionado à família`);
    }
    closeModal();
  }

  function addDrug(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") || "").trim();
    const strength = String(data.get("strength") || "").trim();
    const form = String(data.get("form") || "").trim();
    if (!name || !strength || !form) return;
    const existingDrug = state.drugs.find((drug) => drug.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
    const drugId = existingDrug?.id ?? `drug-${Date.now()}`;
    const duplicatePresentation = state.presentations.some((presentation) => presentation.drugId === drugId && presentation.strength.toLocaleLowerCase("pt-BR") === strength.toLocaleLowerCase("pt-BR") && presentation.form.toLocaleLowerCase("pt-BR") === form.toLocaleLowerCase("pt-BR"));
    if (duplicatePresentation) {
      setToast("Essa apresentação já está cadastrada");
      return;
    }
    const presentation: MedicationPresentation = { id: `presentation-${Date.now()}`, drugId, strength, form };
    setState((current) => ({
      ...current,
      drugs: existingDrug ? current.drugs : [...current.drugs, { id: drugId, name, color: MEDICINE_COLORS[current.drugs.length % MEDICINE_COLORS.length] }],
      presentations: [...current.presentations, presentation],
    }));
    closeModal();
    setToast(existingDrug ? `Nova apresentação adicionada a ${existingDrug.name}` : `${name} foi cadastrado`);
  }

  function addPresentation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const strength = String(data.get("strength") || "").trim();
    const form = String(data.get("form") || "").trim();
    const drug = drugById(presentationDrugId);
    if (!drug || !strength || !form) return;
    const duplicate = state.presentations.some((presentation) => presentation.drugId === drug.id && presentation.strength.toLocaleLowerCase("pt-BR") === strength.toLocaleLowerCase("pt-BR") && presentation.form.toLocaleLowerCase("pt-BR") === form.toLocaleLowerCase("pt-BR"));
    if (duplicate) {
      setToast("Essa apresentação já está cadastrada");
      return;
    }
    setState((current) => ({ ...current, presentations: [...current.presentations, { id: `presentation-${Date.now()}`, drugId: drug.id, strength, form }] }));
    closeModal();
    setToast(`${strength} · ${form} foi adicionado a ${drug.name}`);
  }

  function addMedicine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const memberId = String(data.get("memberId") || "");
    const linkedMember = memberById(memberId);
    const drugId = String(data.get("drugId") || "");
    const presentationId = String(data.get("presentationId") || "");
    const drug = drugById(drugId);
    const presentation = presentationById(presentationId);
    const quantity = String(data.get("quantity") || "").trim();
    const times = String(data.get("times") || "").split(",").map((time) => time.trim()).filter((time) => /^\d{2}:\d{2}$/.test(time));
    if (!drug || !presentation || presentation.drugId !== drug.id || !quantity || !times.length || !linkedMember) {
      setToast(!linkedMember ? "Escolha a pessoa que usará o medicamento" : "Preencha a apresentação, a quantidade e pelo menos um horário válido");
      return;
    }
    setState((current) => ({
      ...current,
      routines: [...current.routines, { id: `routine-${Date.now()}`, drugId, presentationId, memberId, quantity, times, instruction: String(data.get("instruction") || "Conforme orientação médica"), active: true }],
    }));
    closeModal();
    setToast(`${drug.name} ${presentation.strength} foi vinculado a ${linkedMember.name}`);
  }

  function toggleMedicineActive(routineId: string) {
    const currentRoutine = state.routines.find((routine) => routine.id === routineId);
    const isNowActive = currentRoutine?.active === false;
    setState((current) => ({ ...current, routines: current.routines.map((routine) => {
      if (routine.id !== routineId) return routine;
      return { ...routine, active: isNowActive };
    }) }));
    setToast(isNowActive ? "Regra de uso ativada" : "Regra de uso pausada");
  }

  async function handleDocumentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"];
    if (!allowedTypes.includes(file.type)) {
      setToast("Escolha um arquivo PDF, JPG, PNG, WEBP ou TXT");
      return;
    }
    if (file.size > 1_000_000) {
      setToast("Escolha um arquivo com até 1 MB para salvar neste dispositivo");
      return;
    }

    setDocumentFile(file);
    setNativeDocumentScan(null);
    setToast("Arquivo selecionado");
  }

  function startDocumentScanner() {
    if (!window.CuraFamiliaAndroid?.scanDocument) {
      setToast("A digitalização com detecção de bordas está disponível no app Android");
      return;
    }
    try {
      setDocumentPreparing(true);
      window.CuraFamiliaAndroid.scanDocument();
    } catch {
      setDocumentPreparing(false);
      setToast("Não foi possível abrir o digitalizador");
    }
  }

  async function addDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();
    const memberId = String(data.get("memberId") || "");
    const category = String(data.get("category") || "prescription") as DocumentCategory;
    const date = String(data.get("date") || today);
    const file = documentFile;
    if (!title || !memberId || (!file?.size && !nativeDocumentScan)) {
      setToast("Escolha um arquivo ou escaneie o documento");
      return;
    }
    if (file && file.size > 1_000_000) {
      setToast("Escolha um arquivo com até 1 MB para salvar neste dispositivo");
      return;
    }
    try {
      const dataUrl = file ? await readFileAsDataUrl(file) : undefined;
      const newDocument: HealthDocument = {
        id: `document-${Date.now()}`,
        title,
        memberId,
        category,
        date,
        fileName: nativeDocumentScan ? scannedDocumentFileName(title) : file?.name ?? "documento.pdf",
        mimeType: nativeDocumentScan?.mimeType ?? file?.type ?? "application/octet-stream",
        dataUrl,
        nativeDocumentId: nativeDocumentScan?.documentId,
        fileSize: nativeDocumentScan?.fileSize ?? file?.size,
      };
      setState((current) => ({ ...current, documents: [newDocument, ...current.documents] }));
      closeModal();
      setToast("Documento anexado com sucesso");
    } catch {
      setToast("Não foi possível ler este arquivo");
    }
  }

  function downloadHealthDocument(healthDocument: HealthDocument) {
    if (healthDocument.nativeDocumentId) {
      if (window.CuraFamiliaAndroid?.saveStoredDocument) {
        window.CuraFamiliaAndroid.saveStoredDocument(healthDocument.nativeDocumentId, healthDocument.fileName, healthDocument.mimeType);
        setToast("Escolha onde salvar o documento");
      } else {
        setToast("Este documento está disponível no app Android");
      }
      return;
    }
    const member = memberById(healthDocument.memberId);
    const generatedFile = !healthDocument.dataUrl;
    const generatedText = `help-family\n\n${healthDocument.title}\nFamiliar: ${member?.name ?? "Não informado"}\nData: ${formatDocumentDate(healthDocument.date)}\n\nDocumento de demonstração.`;
    const downloadName = generatedFile ? `${healthDocument.fileName.replace(/\.[^.]+$/, "")}.txt` : healthDocument.fileName;
    const downloadMimeType = generatedFile ? "text/plain;charset=utf-8" : healthDocument.mimeType;

    if (window.CuraFamiliaAndroid) {
      const dataUrl = healthDocument.dataUrl ?? `data:${downloadMimeType};base64,${window.btoa(Array.from(new TextEncoder().encode(generatedText), (byte) => String.fromCharCode(byte)).join(""))}`;
      window.CuraFamiliaAndroid.saveDocument(downloadName, downloadMimeType, dataUrl);
      setToast("Escolha onde salvar o documento");
      return;
    }

    const href = healthDocument.dataUrl ?? URL.createObjectURL(new Blob([
      generatedText,
    ], { type: "text/plain;charset=utf-8" }));
    const link = window.document.createElement("a");
    link.href = href;
    link.download = downloadName;
    link.click();
    if (generatedFile) window.setTimeout(() => URL.revokeObjectURL(href), 0);
    setToast(`Download de ${healthDocument.title} iniciado`);
  }

  return (
    <main className="cura-app">
      <aside className="desktop-sidebar">
        <button className="brand-block" onClick={() => navigate("today")} aria-label="Ir para a página Hoje">
          <strong>help-family</strong>
          <span>Gestão de Saúde</span>
        </button>
        <nav className="desktop-navigation" aria-label="Navegação principal">
          {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => item.id === "documents" ? openDocuments() : navigate(item.id)}><Icon filled={view === item.id}>{item.icon}</Icon><span>{item.label}</span></button>)}
        </nav>
        <div className="sidebar-footer-actions">
          <button className="theme-toggle sidebar-theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} aria-pressed={theme === "dark"}>
            <Icon>{theme === "dark" ? "light_mode" : "dark_mode"}</Icon>
            <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
          </button>
          {view === "documents" && <button className="sidebar-add-button" onClick={() => setModal("document")}><Icon>upload_file</Icon>Adicionar Novo</button>}
        </div>
      </aside>

      <section className="app-canvas">
        {demoMode && <section className="demo-banner" aria-label="Modo demonstração">
          <div><Icon>science</Icon><span><strong>Modo demonstração</strong><small>Use somente dados fictícios. As alterações ficam nesta aba e são apagadas ao encerrar a sessão.</small></span></div>
          <button type="button" onClick={() => window.CuraFamiliaResetDemo?.()}>Redefinir dados</button>
        </section>}
        <header className={`mobile-topbar ${view === "family" || view === "medicines" || view === "documents" ? "action-mobile-topbar" : ""}`}>
          <button className="mobile-brand" onClick={() => navigate("today")}>help-family</button>
          {view === "family" || view === "medicines" || view === "documents" ? <div className="mobile-header-actions">
            <button className="mobile-theme-toggle" type="button" aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} aria-pressed={theme === "dark"} onClick={toggleTheme}><Icon>{theme === "dark" ? "light_mode" : "dark_mode"}</Icon></button>
            <button aria-label={view === "documents" ? "Pesquisar documentos" : "Notificações"} onClick={() => view === "documents" ? focusDocumentSearch() : setToast("Você não tem novas notificações")}><Icon>{view === "documents" ? "search" : "notifications"}</Icon></button>
            <button aria-label={view === "documents" ? "Notificações" : "Ajuda"} onClick={() => setToast(view === "documents" ? "Você não tem novas notificações" : view === "family" ? "Use Adicionar Familiar para criar um novo perfil" : "Use Novo Medicamento para cadastrar uma rotina")}><Icon>{view === "documents" ? "notifications" : "help_outline"}</Icon></button>
          </div> : <div className="mobile-header-actions">
            <button className="mobile-theme-toggle" type="button" aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"} aria-pressed={theme === "dark"} onClick={toggleTheme}><Icon>{theme === "dark" ? "light_mode" : "dark_mode"}</Icon></button>
            {selectedMember ? <MemberAvatar member={selectedMember} avatarClassName="avatar avatar-mobile" photoClassName="avatar-mobile member-mobile-photo" /> : null}
          </div>}
        </header>

        <div className="content-container">
          {view === "today" && <>
            <section className="greeting-section">
              <h1>{greeting}, Maria!</h1>
              <p><Icon>calendar_today</Icon>{dateLabel}</p>
            </section>

            <section className="family-selector-section">
              <h2>Familiares acompanhados</h2>
              <div className="family-selector" role="group" aria-label="Selecionar familiar">
                {state.members.map((member) => <button key={member.id} className={`family-option ${selectedMember?.id === member.id ? "selected" : ""}`} onClick={() => setSelectedMemberId(member.id)} aria-pressed={selectedMember?.id === member.id}>
                  <span className="family-avatar-ring"><MemberAvatar member={member} avatarClassName="avatar avatar-family" photoClassName="avatar-family family-selector-photo" /></span>
                  <span>{member.name}</span>
                </button>)}
                <button className="family-option add-family-option" onClick={() => openMemberModal()}>
                  <span className="family-avatar-ring"><span className="avatar avatar-family add-avatar"><Icon>add</Icon></span></span>
                  <span>Novo</span>
                </button>
              </div>
            </section>

            <section className="daily-progress-card" aria-label={`Progresso diário: ${progress}%`}>
              <div><h2>Progresso Diário</h2><p>{takenCount} de {visibleDoses.length} doses tomadas</p></div>
              <strong>{progress}%</strong>
              <div className="progress-bar"><span style={{ width: `${progress}%` }} /></div>
            </section>

            {focusDose ? <section className={`next-dose-section ${focusDose.isLate ? "late" : "upcoming"}`}>
              <div className="dose-alert-label"><Icon>{focusDose.isLate ? "warning" : "schedule"}</Icon>{focusDose.isLate ? "Dose em atraso" : "Próxima dose"}</div>
              <div className="next-dose-card">
                <div className="next-dose-title">
                  <span className="dose-main-icon"><Icon>medication_liquid</Icon></span>
                  <div><h2>{focusDose.drug.name}</h2><p>{focusDose.presentation.strength} · {focusDose.routine.quantity}</p></div>
                </div>
                <div className="dose-details-grid">
                  <div><small>Horário Previsto</small><strong>{focusDose.time}</strong></div>
                  <div><small>Familiar</small><strong>{focusDose.member.name}</strong></div>
                  <p><Icon>info</Icon><span>Orientação: {focusDose.routine.instruction}.</span></p>
                </div>
                <div className="dose-action-buttons">
                  <button className="confirm-dose-button" onClick={() => recordDose(focusDose, "taken")}><Icon>check_circle</Icon>Registrar tomada</button>
                  <button className="skip-dose-button" onClick={() => recordDose(focusDose, "skipped")}><Icon>cancel</Icon>Não foi tomada</button>
                </div>
              </div>
            </section> : <section className="all-done-card"><Icon>task_alt</Icon><div><h2>Rotina concluída</h2><p>Todas as doses de {selectedMember?.name} foram registradas hoje.</p></div></section>}

            <section className="today-agenda-section">
              <h2>Agenda de Hoje</h2>
              {periods.length ? periods.map((period) => <div className="agenda-period" key={period.id}>
                <h3><Icon>{period.icon}</Icon>{period.label}</h3>
                <div className="agenda-list">
                  {period.doses.map((dose) => {
                    const status = dose.log?.status === "taken" ? "taken" : dose.log?.status === "skipped" ? "skipped" : dose.isLate ? "late" : "pending";
                    return <article className={`agenda-item ${status}`} key={`${dose.routine.id}-${dose.time}`}>
                      <time>{dose.time}</time>
                      <span className="agenda-status-icon"><Icon>{status === "taken" ? "check" : status === "late" ? "priority_high" : status === "skipped" ? "close" : "schedule"}</Icon></span>
                      <div><h4>{dose.drug.name} <span>{dose.presentation.strength}</span></h4><p>{dose.member.name} · {dose.routine.quantity}</p></div>
                      <span className="agenda-status-label">{status === "taken" ? "Tomada" : status === "skipped" ? "Não tomada" : status === "late" ? "Atrasada" : "Pendente"}</span>
                      {!dose.log && <button className="quick-dose-button" onClick={() => recordDose(dose, "taken")} aria-label={`Registrar ${dose.drug.name} como tomada`}><Icon>check</Icon></button>}
                    </article>;
                  })}
                </div>
              </div>) : <div className="empty-card"><Icon>event_available</Icon><h3>Nenhuma dose agendada</h3><p>Cadastre um medicamento para {selectedMember?.name}.</p><button onClick={() => openMedicineModal(selectedMember?.id)}>Adicionar medicamento</button></div>}
            </section>

            <footer className="medical-footer"><Icon>health_and_safety</Icon>Este aplicativo não substitui orientação médica.</footer>
          </>}

          {view === "family" && <section className="family-page">
            <header className="family-page-heading">
              <div><h1>Familiares</h1><p>Gerencie os perfis de saúde da sua família.</p></div>
              <button onClick={() => openMemberModal()}><Icon>person_add</Icon>Adicionar Familiar</button>
            </header>
            <div className="family-bento-grid">
              {state.members.map((member) => {
                const memberMedicines = state.routines.filter((routine) => routine.memberId === member.id && routine.active !== false);
                const memberDoses = doses.filter((dose) => dose.member.id === member.id);
                const completed = memberDoses.filter((dose) => dose.log?.status === "taken").length;
                const memberProgress = memberDoses.length ? Math.round(completed / memberDoses.length * 100) : 0;
                return <article className="family-profile-card" key={member.id}>
                  <span className="family-card-decoration" />
                  <div className="family-card-header">
                    <div className="family-card-person">
                      <MemberAvatar member={member} avatarClassName="avatar family-card-avatar" photoClassName="family-card-photo" />
                      <div><h2>{member.name}</h2><p>{member.relationship}</p></div>
                    </div>
                    <button className="family-more-button" aria-label={`Editar perfil de ${member.name}`} onClick={() => openMemberModal(member.id)}><Icon>more_vert</Icon></button>
                  </div>
                  <div className="family-dose-summary">
                    <div><span><Icon>pill</Icon>{memberMedicines.length} {memberMedicines.length === 1 ? "medicamento ativo" : "medicamentos ativos"}</span><strong className={completed ? "complete" : "empty"}>{completed}/{memberDoses.length} doses hoje</strong></div>
                    <div className="family-progress-track"><span style={{ width: `${memberProgress}%` }} /></div>
                  </div>
                  {member.medicalNotes && <p className="family-medical-note"><Icon>clinical_notes</Icon>{member.medicalNotes}</p>}
                  <div className="family-card-actions">
                    <button className="family-medicine-button" onClick={() => openMedicineModal(member.id)}><Icon>add</Icon>Medicamento</button>
                    <button className="family-history-button" onClick={() => { setHistoryMember(member.id); navigate("history"); }}>Ver Histórico<Icon>arrow_forward</Icon></button>
                    <button className="family-documents-button" onClick={() => openDocuments(member.id)}><Icon>description</Icon>Ver Documentos</button>
                  </div>
                </article>;
              })}
              <button className="family-add-card" onClick={() => openMemberModal()}>
                <span><Icon>group_add</Icon></span>
                <strong>Cadastrar Novo</strong>
                <p>Adicione outro membro da família</p>
              </button>
            </div>
          </section>}

          {view === "medicines" && <section className="medication-management-page">
            <header className="medication-page-heading">
              <div><h1>Gestão de Medicamentos</h1><p>Cadastre o medicamento uma vez, adicione apresentações como 500 mg ou 1 g e crie uma regra de uso diferente para cada familiar.</p></div>
              <button onClick={() => setModal("drug")}><Icon>add_circle</Icon>Cadastrar Medicamento</button>
            </header>
            <div className="medication-bento-grid">{state.drugs.map((drug, index) => {
              const drugPresentations = state.presentations.filter((presentation) => presentation.drugId === drug.id);
              const drugRoutines = state.routines.filter((routine) => routine.drugId === drug.id);
              const medicineIcon = /insulina|gota|xarope|líquido|dipirona/i.test(`${drug.name} ${drugPresentations.map((item) => item.form).join(" ")}`) ? "medication_liquid" : "pill";
              return <article className="medication-glass-card catalog-drug-card active" key={drug.id}>
                <span className="medication-card-decoration" style={{ background: index % 2 === 0 ? "var(--secondary-container)" : "var(--primary-soft)" }} />
                <div className="medication-card-header">
                  <div className="medication-card-person">
                    <span className="medication-feature-icon" style={{ background: `${drug.color}1f`, color: drug.color }}><Icon filled>{medicineIcon}</Icon></span>
                    <div><h2>{drug.name}</h2><p>{drugPresentations.length} {drugPresentations.length === 1 ? "apresentação" : "apresentações"}</p></div>
                  </div>
                </div>
                <div className="catalog-presentations">
                  <small>Apresentações</small>
                  <div>{drugPresentations.map((presentation) => <span key={presentation.id}>{presentation.strength} · {presentation.form}</span>)}</div>
                </div>
                <div className="catalog-routines">
                  <small>Regras por familiar</small>
                  {drugRoutines.length ? drugRoutines.map((routine) => {
                    const member = memberById(routine.memberId);
                    const presentation = presentationById(routine.presentationId);
                    const active = routine.active !== false;
                    return <div className={`catalog-routine-row ${active ? "" : "inactive"}`} key={routine.id}>
                      <div><strong>{member?.name ?? "Familiar removido"}</strong><span>{presentation?.strength} · {routine.quantity}</span><small><Icon>schedule</Icon>{routine.times.join(", ")}</small></div>
                      <label className="medicine-switch" title={active ? "Pausar regra" : "Ativar regra"}><input type="checkbox" checked={active} onChange={() => toggleMedicineActive(routine.id)} aria-label={`${active ? "Pausar" : "Ativar"} regra de ${drug.name} para ${member?.name}`} /><span /></label>
                    </div>;
                  }) : <p className="catalog-no-routines">Ainda não vinculado a nenhum familiar.</p>}
                </div>
                <div className="catalog-card-actions">
                  <button type="button" onClick={() => openPresentationModal(drug.id)}><Icon>add</Icon>Apresentação</button>
                  <button type="button" onClick={() => openMedicineModal(undefined, drug.id)}><Icon>link</Icon>Vincular</button>
                </div>
              </article>;
            })}</div>
          </section>}

          {view === "history" && <section className="history-page">
            <header className="history-page-heading">
              <h1>Histórico de Registros</h1>
              <p>Acompanhe o histórico completo de medicações da sua família. Utilize os filtros abaixo para encontrar registros específicos.</p>
            </header>

            <section className="history-filter-card" aria-label="Filtros do histórico">
              <div className="history-family-filter">
                <span>Filtrar por Familiar</span>
                <div className="history-filter-chips">
                  <button className={historyMember === "all" ? "active" : ""} type="button" aria-pressed={historyMember === "all"} onClick={() => { setHistoryMember("all"); setHistoryPage(1); }}>Todos</button>
                  {state.members.map((member) => <button className={historyMember === member.id ? "active" : ""} type="button" aria-pressed={historyMember === member.id} key={member.id} onClick={() => { setHistoryMember(member.id); setHistoryPage(1); }}>{member.name}</button>)}
                </div>
              </div>
              <label className="history-search">
                <Icon>search</Icon>
                <span className="sr-only">Buscar medicamento no histórico</span>
                <input value={historySearch} onChange={(event) => { setHistorySearch(event.target.value); setHistoryPage(1); }} placeholder="Buscar medicamento..." type="search" />
              </label>
            </section>

            <section className="history-table-card" aria-label="Registros de doses">
              <div className="history-table-scroll">
                <table className="history-table">
                  <thead><tr><th>Data</th><th>Horário</th><th>Medicamento</th><th>Dose</th><th>Familiar</th><th>Status</th></tr></thead>
                  <tbody>
                    {visibleHistoryLogs.map((log) => {
                      const routine = routineById(log.routineId);
                      const drug = routine ? drugById(routine.drugId) : undefined;
                      const presentation = routine ? presentationById(routine.presentationId) : undefined;
                      const member = memberById(log.memberId);
                      if (!routine || !drug || !presentation || !member) return null;
                      return <tr className={log.status === "skipped" ? "missed" : ""} key={log.id}>
                        <td><strong>{formatHistoryDate(log.date, today)}</strong></td>
                        <td><time title={`Registrado às ${log.recordedAt}`}>{log.scheduledTime}</time></td>
                        <td className="history-medicine-name">{drug.name}</td>
                        <td className="history-dose">{presentation.strength} · {routine.quantity}</td>
                        <td><span className="history-member-cell"><span className="history-member-avatar" style={{ background: `${member.color}1f`, color: member.color }}>{member.initials}</span>{member.name}</span></td>
                        <td><span className={`history-status ${log.status}`}><Icon>{log.status === "taken" ? "check_circle" : "cancel"}</Icon>{log.status === "taken" ? "Tomada" : "Não tomada"}</span></td>
                      </tr>;
                    })}
                    {!visibleHistoryLogs.length && <tr><td className="history-empty-row" colSpan={6}><Icon>search_off</Icon><strong>Nenhum registro encontrado</strong><span>Tente alterar o familiar ou o medicamento pesquisado.</span></td></tr>}
                  </tbody>
                </table>
              </div>
              <footer className="history-pagination">
                <span>{filteredHistoryLogs.length ? `Mostrando ${historyResultStart}-${historyResultEnd} de ${filteredHistoryLogs.length} registros` : "Nenhum registro para mostrar"}</span>
                <div>
                  <button type="button" disabled={safeHistoryPage === 1} aria-label="Página anterior" onClick={() => setHistoryPage(Math.max(1, safeHistoryPage - 1))}><Icon>chevron_left</Icon></button>
                  <button type="button" disabled={safeHistoryPage === historyTotalPages} aria-label="Próxima página" onClick={() => setHistoryPage(Math.min(historyTotalPages, safeHistoryPage + 1))}><Icon>chevron_right</Icon></button>
                </div>
              </footer>
            </section>
          </section>}

          {view === "documents" && <section className="documents-page">
            <header className="documents-page-heading">
              <div><h1>{selectedDocumentMember ? `Documentos de ${selectedDocumentMember.name}` : "Meus Documentos"}</h1><p>{selectedDocumentMember ? `Receitas, exames e atestados vinculados a ${selectedDocumentMember.name}.` : "Guarde receitas, exames e atestados importantes aqui."}</p></div>
              <button type="button" onClick={() => setModal("document")}><Icon filled>upload_file</Icon>Anexar Documento</button>
            </header>

            <div className="document-filters-panel" id="document-filters">
              <div className="document-search" role="search">
                <Icon>search</Icon>
                <label className="sr-only" htmlFor="document-search-input">Pesquisar documentos</label>
                <input ref={documentSearchRef} id="document-search-input" type="search" value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Buscar documento, familiar ou tipo..." autoComplete="off" />
                {documentSearch && <button type="button" aria-label="Limpar pesquisa" onClick={() => { setDocumentSearch(""); documentSearchRef.current?.focus(); }}><Icon>close</Icon></button>}
              </div>
              <div className="document-member-filter"><span>Familiar</span><div><button type="button" className={documentMemberFilter === "all" ? "active" : ""} aria-pressed={documentMemberFilter === "all"} onClick={() => setDocumentMemberFilter("all")}>Todos</button>{state.members.map((member) => <button type="button" className={documentMemberFilter === member.id ? "active" : ""} aria-pressed={documentMemberFilter === member.id} key={member.id} onClick={() => setDocumentMemberFilter(member.id)}>{member.name}</button>)}</div></div>
              <div className="document-type-filter"><span>Tipo</span><div className="document-filter-tabs" aria-label="Filtrar documentos por tipo">{DOCUMENT_CATEGORIES.map((category) => <button type="button" className={documentFilter === category.id ? "active" : ""} aria-pressed={documentFilter === category.id} key={category.id} onClick={() => setDocumentFilter(category.id)}>{category.label}</button>)}</div></div>
            </div>

            <div className="document-grid">
              {visibleDocuments.map((healthDocument) => {
                const member = memberById(healthDocument.memberId);
                const details = DOCUMENT_CATEGORY_DETAILS[healthDocument.category];
                return <article className={`document-card ${healthDocument.category}`} key={healthDocument.id}>
                  <div className="document-card-top"><span className="document-type-icon"><Icon filled>{details.icon}</Icon></span><span className="document-category-badge">{details.label}</span></div>
                  <div className="document-card-copy"><h2 title={healthDocument.title}>{healthDocument.title}</h2><p><Icon>person</Icon>{member?.name ?? "Familiar removido"}</p></div>
                  <footer><time dateTime={healthDocument.date}>{formatDocumentDate(healthDocument.date)}</time><div className="document-card-actions"><button type="button" aria-label={`Baixar ${healthDocument.title}`} title={`Baixar ${healthDocument.fileName}`} onClick={() => downloadHealthDocument(healthDocument)}><Icon>download</Icon></button><button type="button" aria-label={`Abrir ${healthDocument.title}`} title={`Abrir ${healthDocument.fileName}`} onClick={() => openHealthDocument(healthDocument.id)}><Icon>visibility</Icon></button></div></footer>
                </article>;
              })}
              {!visibleDocuments.length && <div className="document-empty-card"><span><Icon>{normalizedDocumentSearch ? "search_off" : "folder_open"}</Icon></span><h2>{normalizedDocumentSearch ? "Nenhum documento encontrado" : "Nenhum documento nesta categoria"}</h2><p>{normalizedDocumentSearch ? "Tente outro termo ou altere os filtros de familiar e tipo." : "Anexe uma receita, exame ou atestado para encontrá-lo aqui."}</p>{!normalizedDocumentSearch && <button type="button" onClick={() => setModal("document")}><Icon>upload_file</Icon>Anexar Documento</button>}</div>}
            </div>

            <p className="documents-local-note"><Icon>lock</Icon>Seus documentos ficam armazenados somente neste dispositivo.</p>
          </section>}
        </div>
      </section>

      <nav className="mobile-bottom-nav" aria-label="Navegação móvel">
        {navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => item.id === "documents" ? openDocuments() : navigate(item.id)}><Icon filled={view === item.id}>{item.icon}</Icon><span>{item.mobileLabel}</span></button>)}
      </nav>

      {modal === "member" && <div className="modal-backdrop member-panel-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <aside className="member-panel" role="dialog" aria-modal="true" aria-labelledby="member-panel-title">
          <header><h2 id="member-panel-title">{editingMemberId ? "Editar Familiar" : "Adicionar Familiar"}</h2><button onClick={closeModal} aria-label="Fechar"><Icon>close</Icon></button></header>
          <form onSubmit={saveMember} key={editingMemberId ?? "new-member"}>
            <div className="member-panel-body">
              <label className="member-photo-picker">
                <input type="file" accept="image/*" onChange={handleMemberPhoto} />
                {memberPhoto ? <img src={memberPhoto} alt="Prévia da foto do familiar" /> : <span><Icon>add_a_photo</Icon><small>Foto</small></span>}
              </label>
              <label>Nome Completo<input name="name" defaultValue={editingMemberId ? memberById(editingMemberId)?.name : ""} placeholder="Ex.: Ana Souza" required autoFocus /></label>
              <label>Relação Familiar<select name="relationship" defaultValue={editingMemberId ? memberById(editingMemberId)?.relationship : ""} required><option value="" disabled>Selecione a relação...</option><option value="Meu perfil">Meu perfil</option><option value="Mãe">Mãe</option><option value="Pai">Pai</option><option value="Filho(a)">Filho(a)</option><option value="Avô/Avó">Avô/Avó</option><option value="Cônjuge">Cônjuge</option><option value="Familiar">Familiar</option><option value="Outro">Outro</option></select></label>
              <label>Observações Médicas <small>(Opcional)</small><textarea name="medicalNotes" defaultValue={editingMemberId ? memberById(editingMemberId)?.medicalNotes : ""} placeholder="Alergias, condições especiais..." rows={3} /></label>
            </div>
            <footer><button type="submit"><Icon>check</Icon>Salvar Familiar</button></footer>
          </form>
        </aside>
      </div>}

      {modal === "drug" && <div className="modal-backdrop medication-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="medication-modal" role="dialog" aria-modal="true" aria-labelledby="drug-modal-title">
          <header><h2 id="drug-modal-title"><Icon filled>add_circle</Icon>Cadastrar Medicamento</h2><button type="button" onClick={closeModal} aria-label="Fechar"><Icon>close</Icon></button></header>
          <form onSubmit={addDrug}>
            <div className="medication-modal-body">
              <label className="wide">Nome do Medicamento<input name="name" placeholder="Ex.: Dipirona" required autoFocus /></label>
              <label>Concentração<input name="strength" placeholder="Ex.: 500 mg ou 1 g" required /></label>
              <label>Forma<select name="form" defaultValue="comprimido" required><option value="comprimido">Comprimido</option><option value="cápsula">Cápsula</option><option value="gotas">Gotas</option><option value="líquido">Líquido / Xarope</option><option value="aplicação">Aplicação</option><option value="pomada">Pomada</option><option value="outro">Outro</option></select></label>
              <p className="medicine-link-note wide"><Icon>info</Icon>Cadastre o medicamento sem escolher uma pessoa. O vínculo será feito depois por uma regra de uso.</p>
            </div>
            <footer><button type="button" onClick={closeModal}>Cancelar</button><button type="submit">Cadastrar</button></footer>
          </form>
        </section>
      </div>}

      {modal === "presentation" && <div className="modal-backdrop medication-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="medication-modal" role="dialog" aria-modal="true" aria-labelledby="presentation-modal-title">
          <header><h2 id="presentation-modal-title"><Icon filled>medication</Icon>Nova apresentação</h2><button type="button" onClick={closeModal} aria-label="Fechar"><Icon>close</Icon></button></header>
          <form onSubmit={addPresentation}>
            <div className="medication-modal-body">
              <div className="presentation-drug-summary wide"><small>Medicamento</small><strong>{drugById(presentationDrugId)?.name}</strong></div>
              <label>Concentração<input name="strength" placeholder="Ex.: 1 g" required autoFocus /></label>
              <label>Forma<select name="form" defaultValue="comprimido" required><option value="comprimido">Comprimido</option><option value="cápsula">Cápsula</option><option value="gotas">Gotas</option><option value="líquido">Líquido / Xarope</option><option value="aplicação">Aplicação</option><option value="pomada">Pomada</option><option value="outro">Outro</option></select></label>
            </div>
            <footer><button type="button" onClick={closeModal}>Cancelar</button><button type="submit">Adicionar</button></footer>
          </form>
        </section>
      </div>}

      {modal === "routine" && <div className="modal-backdrop medication-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="medication-modal" role="dialog" aria-modal="true" aria-labelledby="routine-modal-title">
          <header><h2 id="routine-modal-title"><Icon filled>link</Icon>Criar Regra de Uso</h2><button type="button" onClick={closeModal} aria-label="Fechar"><Icon>close</Icon></button></header>
          <form onSubmit={addMedicine}>
            <div className="medication-modal-body">
              <label>Pessoa<select name="memberId" value={medicineMemberId} onChange={(event) => setMedicineMemberId(event.target.value)} required>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.relationship})</option>)}</select></label>
              <label>Medicamento<select name="drugId" value={routineDrugId} onChange={(event) => { const drugId = event.target.value; setRoutineDrugId(drugId); setRoutinePresentationId(state.presentations.find((presentation) => presentation.drugId === drugId)?.id ?? ""); }} required>{state.drugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.name}</option>)}</select></label>
              <label>Apresentação<select name="presentationId" value={routinePresentationId} onChange={(event) => setRoutinePresentationId(event.target.value)} required>{availableRoutinePresentations.map((presentation) => <option key={presentation.id} value={presentation.id}>{presentation.strength} · {presentation.form}</option>)}</select></label>
              <label>Quantidade por dose<input name="quantity" placeholder="Ex.: 1 comprimido ou 20 gotas" required /></label>
              <p className="medicine-link-note wide"><Icon>link</Icon>Esta regra será exclusiva para a pessoa escolhida. Outra pessoa poderá usar o mesmo medicamento com apresentação, dose e horários diferentes.</p>
              <label className="wide">Horários <small>(separados por vírgula)</small><span className="input-with-icon"><Icon>schedule</Icon><input name="times" placeholder="Ex.: 08:00, 14:00, 20:00" required /></span><small>Use o formato HH:MM e siga somente a orientação médica recebida.</small></label>
              <label className="wide">Orientação / Observação<input name="instruction" placeholder="Ex.: Após as refeições, conforme prescrição" /></label>
            </div>
            <footer><button type="button" onClick={closeModal}>Cancelar</button><button type="submit">Salvar Regra</button></footer>
          </form>
        </section>
      </div>}

      {modal === "document" && <div className="modal-backdrop medication-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="medication-modal document-modal" role="dialog" aria-modal="true" aria-labelledby="document-modal-title">
          <header><h2 id="document-modal-title"><Icon filled>upload_file</Icon>Anexar Documento</h2><button type="button" onClick={closeModal} aria-label="Fechar"><Icon>close</Icon></button></header>
          <form onSubmit={addDocument}>
            <div className="medication-modal-body document-modal-body">
              <label className="wide">Título do Documento<input name="title" value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} placeholder="Ex.: Receita de uso contínuo" required autoFocus /></label>
              <label>Tipo<select name="category" defaultValue="prescription" required><option value="prescription">Receita</option><option value="exam">Exame</option><option value="certificate">Atestado</option></select></label>
              <label>Familiar<select name="memberId" defaultValue={selectedDocumentMember?.id ?? selectedMember?.id} required>{state.members.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.relationship})</option>)}</select></label>
              <label className="wide">Data do Documento<input name="date" type="date" defaultValue={today} required /></label>
              <div className="wide document-file-field">
                <span>Documento</span>
                <div className="document-source-actions">
                  <label className="document-source-button">
                    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,text/plain" disabled={documentPreparing} onChange={(event) => void handleDocumentFile(event)} />
                    <Icon>attach_file</Icon>
                    <span>Escolher arquivo</span>
                  </label>
                  <button className="document-source-button scan" type="button" disabled={documentPreparing} onClick={startDocumentScanner}>
                    <Icon>document_scanner</Icon>
                    <span>{documentPreparing ? "Digitalizando..." : "Digitalizar documento"}</span>
                  </button>
                </div>
                {documentFile && <div className="document-selected-file"><Icon>draft</Icon><div><strong>{documentFile.name}</strong><small>Arquivo selecionado · {Math.max(1, Math.round(documentFile.size / 1024))} KB</small></div><button type="button" aria-label="Remover documento selecionado" onClick={() => setDocumentFile(null)}><Icon>close</Icon></button></div>}
                {nativeDocumentScan && <div className="document-selected-file"><Icon>picture_as_pdf</Icon><div><strong>{scannedDocumentFileName(documentTitle)}</strong><small>Lote digitalizado · {Math.max(1, Math.round(nativeDocumentScan.fileSize / 1024))} KB</small></div><button type="button" aria-label="Remover lote digitalizado" onClick={() => setNativeDocumentScan(null)}><Icon>close</Icon></button></div>}
                <small>Escolha um arquivo de até 1 MB ou digitalize quantas páginas precisar. O scanner detecta as bordas, corrige a perspectiva e reúne todo o lote em um único PDF.</small>
              </div>
            </div>
            <footer><button type="button" onClick={closeModal}>Cancelar</button><button type="submit" disabled={documentPreparing}>Salvar Documento</button></footer>
          </form>
        </section>
      </div>}

      {modal === "document-viewer" && selectedHealthDocument && <div className="modal-backdrop document-viewer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <section className="document-viewer-modal" role="dialog" aria-modal="true" aria-labelledby="document-viewer-title">
          <header>
            <div>
              <span>{DOCUMENT_CATEGORY_DETAILS[selectedHealthDocument.category].label}</span>
              <h2 id="document-viewer-title">{selectedHealthDocument.title}</h2>
              <p>{memberById(selectedHealthDocument.memberId)?.name ?? "Familiar removido"} · {formatDocumentDate(selectedHealthDocument.date)}</p>
            </div>
            <button type="button" onClick={closeModal} aria-label="Fechar visualização"><Icon>close</Icon></button>
          </header>
          <div className="document-viewer-body">
            {selectedDocumentSource ? (
              selectedHealthDocument.mimeType === "application/pdf"
                ? <PdfDocumentViewer sourceUrl={selectedDocumentSource} title={selectedHealthDocument.title} />
                : selectedHealthDocument.mimeType.startsWith("image/")
                  ? <img src={selectedDocumentSource} alt={selectedHealthDocument.title} />
                  : <iframe src={selectedDocumentSource} title={`Visualização de ${selectedHealthDocument.title}`} />
            ) : <div className="document-demo-preview">
              <span><Icon filled>{DOCUMENT_CATEGORY_DETAILS[selectedHealthDocument.category].icon}</Icon></span>
              <small>Documento de demonstração</small>
              <h3>{selectedHealthDocument.title}</h3>
              <p><strong>Familiar:</strong> {memberById(selectedHealthDocument.memberId)?.name ?? "Não informado"}</p>
              <p><strong>Data:</strong> {formatDocumentDate(selectedHealthDocument.date)}</p>
              <em>Anexe um arquivo real para visualizá-lo integralmente aqui.</em>
            </div>}
          </div>
          <footer>
            <span><Icon>lock</Icon>Visualização somente neste dispositivo</span>
            <div><button type="button" onClick={closeModal}>Fechar</button><button type="button" onClick={() => downloadHealthDocument(selectedHealthDocument)}><Icon>download</Icon>Baixar</button></div>
          </footer>
        </section>
      </div>}

      {toast && <div className="toast" role="status"><Icon>check_circle</Icon>{toast}</div>}
    </main>
  );
}
