import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the help-family Today experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="pt-BR">/i);
  assert.match(html, /help-family — Gestão de Saúde/i);
  assert.match(html, /Familiares acompanhados/);
  assert.match(html, /Progresso Diário/);
  assert.match(html, /Agenda de Hoje/);
  assert.match(html, /Este aplicativo não substitui orientação médica/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("keeps medication actions and responsive navigation", async () => {
  const [page, layout, css, packageJson, androidActivity, androidManifest, androidBuild] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/java/br/com/curafamilia/app/MainActivity.java", import.meta.url), "utf8"),
    readFile(new URL("../android/app/src/main/AndroidManifest.xml", import.meta.url), "utf8"),
    readFile(new URL("../android/app/build.gradle", import.meta.url), "utf8"),
  ]);

  assert.match(page, /localStorage/);
  assert.match(page, /localStorage\.setItem\(THEME_STORAGE_KEY/);
  assert.doesNotMatch(page, /localStorage\.setItem\(STORAGE_KEY/);
  assert.match(page, /toggleTheme/);
  assert.match(page, /Ativar modo escuro/);
  assert.match(page, /saveState/);
  assert.match(page, /readNativeState/);
  assert.match(page, /recordDose/);
  assert.match(page, /Adicionar Familiar/i);
  assert.match(page, /Não foi tomada/);
  assert.match(page, /family-bento-grid/);
  assert.doesNotMatch(page, /family-card-decoration" style=/);
  assert.match(page, /handleMemberPhoto/);
  assert.match(page, /optimizeMemberPhoto/);
  assert.match(page, /MemberAvatar/);
  assert.match(page, /accept="image\/\*"/);
  assert.match(page, /Ver Histórico/);
  assert.match(page, /Ver Documentos/);
  assert.match(page, /openDocuments/);
  assert.match(page, /documentMemberFilter/);
  assert.match(page, /documentSearch/);
  assert.match(page, /focusDocumentSearch/);
  assert.match(page, /toggleMedicineActive/);
  assert.match(page, /openMedicineModal/);
  assert.match(page, /foi vinculado a/);
  assert.match(page, /Criar Regra de Uso/);
  assert.match(page, /MedicationPresentation/);
  assert.match(page, /migrateStoredState/);
  assert.match(page, /catalog-presentations/);
  assert.match(page, /Nova apresentação/);
  assert.match(page, /family-medicine-button/);
  assert.match(page, /medication-bento-grid/);
  assert.match(page, /Cadastrar Medicamento/);
  assert.match(page, /Histórico de Registros/);
  assert.match(page, /historySearch/);
  assert.match(page, /history-filter-card/);
  assert.match(page, /history-table/);
  assert.match(page, /history-pagination/);
  assert.match(page, /Meus Documentos/);
  assert.match(page, /addDocument/);
  assert.match(page, /downloadHealthDocument/);
  assert.match(page, /document-card-actions/);
  assert.match(page, /CuraFamiliaAndroid/);
  assert.match(page, /openHealthDocument/);
  assert.match(page, /document-viewer-modal/);
  assert.match(page, /PdfDocumentViewer/);
  assert.match(page, /document-filter-tabs/);
  assert.match(page, /document-grid/);
  assert.match(page, /Salvar Documento/);
  assert.match(page, /Digitalizar documento/);
  assert.match(page, /CuraFamiliaReceiveScan/);
  assert.match(page, /startDocumentScanner/);
  assert.match(page, /Lote digitalizado/);
  assert.match(page, /scannedDocumentFileName/);
  assert.match(page, /documento-digitalizado/);
  assert.match(page, /handleDocumentFile/);
  assert.doesNotMatch(page, /Adicionar Dose/);
  assert.match(layout, /lang="pt-BR"/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(layout, /cura-family-theme/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /\.theme-toggle/);
  assert.match(css, /\.member-panel/);
  assert.match(css, /\.family-add-card/);
  assert.match(css, /data-theme="dark"\] \.family-profile-card/);
  assert.match(css, /data-theme="dark"\] \.daily-progress-card/);
  assert.match(css, /data-theme="dark"\] \.medication-glass-card/);
  assert.match(css, /data-theme="dark"\] \.history-table/);
  assert.match(css, /data-theme="dark"\] \.document-card/);
  assert.match(css, /data-theme="dark"\] \.modal-backdrop/);
  assert.match(css, /\.family-documents-button/);
  assert.match(css, /\.medicine-switch/);
  assert.match(css, /\.medicine-link-note/);
  assert.match(css, /\.catalog-routine-row/);
  assert.match(css, /\.catalog-card-actions/);
  assert.match(css, /\.medication-modal/);
  assert.match(css, /\.history-family-filter/);
  assert.match(css, /\.history-status/);
  assert.match(css, /\.documents-page/);
  assert.match(css, /\.document-member-filter/);
  assert.match(css, /\.document-search/);
  assert.match(css, /\.document-card/);
  assert.match(css, /\.document-card-actions/);
  assert.match(css, /\.document-file-field/);
  assert.match(css, /\.document-viewer-modal/);
  assert.match(css, /\.document-demo-preview/);
  assert.match(css, /\.pdf-document-pages/);
  assert.match(css, /\.document-source-actions/);
  assert.match(css, /\.document-selected-file/);
  assert.match(css, /grid-template-columns: repeat\(5,1fr\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(androidActivity, /https:\/\/" \+ APP_HOST/);
  assert.match(androidActivity, /shouldInterceptRequest/);
  assert.match(androidActivity, /DownloadBridge/);
  assert.match(androidActivity, /ACTION_CREATE_DOCUMENT/);
  assert.match(androidActivity, /GmsDocumentScanning/);
  assert.match(androidActivity, /SCANNER_MODE_FULL/);
  assert.match(androidActivity, /RESULT_FORMAT_PDF/);
  assert.doesNotMatch(androidActivity, /setPageLimit/);
  assert.match(androidActivity, /scanned-documents/);
  assert.match(androidActivity, /serveNativeDocument/);
  assert.match(androidActivity, /saveStoredDocument/);
  assert.match(androidActivity, /AndroidKeyStore/);
  assert.match(androidActivity, /AES\/GCM\/NoPadding/);
  assert.match(androidActivity, /CipherOutputStream/);
  assert.match(androidActivity, /shouldOverrideUrlLoading/);
  assert.match(androidActivity, /MIXED_CONTENT_NEVER_ALLOW/);
  assert.match(androidActivity, /Content-Security-Policy/);
  assert.match(androidActivity, /CuraFamiliaReceiveScan/);
  assert.match(androidBuild, /play-services-mlkit-document-scanner:16\.0\.0/);
  assert.doesNotMatch(androidManifest, /android\.permission\.CAMERA/);
  assert.doesNotMatch(androidManifest, /android\.permission\.INTERNET/);
  assert.match(androidManifest, /android:allowBackup="false"/);
  assert.doesNotMatch(androidActivity, /file:\/\/\/android_asset/);
  await assert.rejects(access(new URL("../app/_sites-preview", root)));
});
