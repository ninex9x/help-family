/** Gera PDFs fictícios e cadastra somente amostras ausentes na API em localhost.
 * Os arquivos ficam em data/demo-pdfs/ (ignorado pelo Git); nenhum dado real entra nos PDFs.
 * Requer o Chromium do Playwright: npx playwright install chromium.
 */
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const api = 'http://127.0.0.1:3001/api';
const output = new URL('../data/demo-pdfs/', import.meta.url);
const template = await readFile(
  new URL('./fixtures/demo-pdf-template.html', import.meta.url),
  'utf8',
);
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const dateLabel = new Intl.DateTimeFormat('pt-BR').format(now);
const examples = [
  {
    slug: 'receita',
    category: 'prescription',
    title: 'Receita demonstrativa',
    content: `<h2>Itens de exemplo</h2>
      <div class="item"><strong>01 · Item fictício Alfa</strong><p>Apresentação ilustrativa. Campo reservado à descrição e à posologia.</p><small>Sem princípio ativo, dose ou instrução de uso real.</small></div>
      <div class="item"><strong>02 · Item fictício Beta</strong><p>Segundo item para conferir espaçamento, leitura e impressão.</p><small>Sem princípio ativo, dose ou instrução de uso real.</small></div>
      <div class="callout"><strong>Observação demonstrativa</strong><p>Esta página testa títulos, blocos de texto, cores e campos de uma receita no visualizador do help-family.</p></div>
      <div class="signature">Área ilustrativa de assinatura — sem assinatura, profissional ou registro real.</div>`,
  },
  {
    slug: 'exame',
    category: 'exam',
    title: 'Exame demonstrativo',
    content: `<h2>Painel de indicadores fictícios</h2><p>Os nomes, valores e unidades abaixo foram inventados. Não representam exames clínicos.</p>
      <table><thead><tr><th>Indicador</th><th>Valor inventado</th><th>Unidade fictícia</th></tr></thead><tbody>
      <tr><td>Indicador Alfa</td><td>72,4</td><td>u.demo</td></tr><tr><td>Indicador Beta</td><td>18,6</td><td>u.demo</td></tr><tr><td>Indicador Gama</td><td>43,2</td><td>u.demo</td></tr><tr><td>Indicador Delta</td><td>91,0</td><td>u.demo</td></tr><tr><td>Indicador Épsilon</td><td>26,8</td><td>u.demo</td></tr></tbody></table>
      <div class="callout"><strong>Documento com duas páginas</strong><p>Role o visualizador para conferir a continuação, os gráficos e a numeração de páginas.</p></div>
      <section class="page-break"><p class="eyebrow">Continuação · amostra fictícia</p><h1>Resumo visual</h1>
      <div class="notice"><strong>DEMONSTRAÇÃO — SEM VALIDADE MÉDICA.</strong><br />Gráficos arbitrários para testar a renderização; sem significado clínico.</div>
      <div class="bars"><div>Distribuição fictícia A · 72%<div class="bar"><span style="width:72%"></span></div></div><div>Distribuição fictícia B · 43%<div class="bar"><span style="width:43%;background:#a43c12"></span></div></div><div>Distribuição fictícia C · 91%<div class="bar"><span style="width:91%;background:#075fab"></span></div></div></div>
      <h2>Notas de leitura</h2><p>Este trecho permite conferir a nitidez de texto, acentuação e quebra de linhas: á, é, í, ó, ú, ç, ã e õ.</p><p>O arquivo contém texto e formas vetoriais. Ele pode ser aberto, rolado e baixado pelo site local.</p><div class="signature">Sem coleta, análise laboratorial, assinatura ou registro profissional.</div></section>`,
  },
  {
    slug: 'atestado',
    category: 'certificate',
    title: 'Atestado demonstrativo',
    content: `<h2>Texto ilustrativo</h2><p>Este documento foi criado exclusivamente para demonstrar como um atestado em PDF aparece no help-family.</p>
      <p>O perfil <strong>Pessoa Demonstração</strong> é fictício. Não houve atendimento, avaliação, solicitação de afastamento ou emissão por profissional de saúde.</p>
      <div class="identity"><div><small>Identificação da amostra</small><strong>DEMO-ATESTADO-001</strong></div><div><small>Finalidade</small><strong>Teste de visualização</strong></div></div>
      <div class="callout"><strong>Sem valor comprobatório</strong><p>Não apresentar a empregadores, escolas, instituições ou serviços de saúde.</p></div>
      <div class="signature">Área demonstrativa — sem assinatura, carimbo ou registro profissional.</div>`,
  },
];

async function request(path, options = {}) {
  const response = await fetch(`${api}${path}`, { redirect: 'error', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Falha HTTP ${response.status}`);
  return body;
}

// Verifica a disponibilidade antes de gerar arquivos ou cadastrar dados.
let snapshot = await request('/state');
await mkdir(output, { recursive: true });
const server = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end('<!doctype html><html lang="pt-BR"><title>Gerador local de PDFs</title></html>');
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  for (const example of examples) {
    await page.setContent(
      template
        .replace('{{TITLE}}', example.title)
        .replace('{{TITLE}}', example.title)
        .replace('{{DATE}}', dateLabel)
        .replace('{{CONTENT}}', example.content),
    );
    example.bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="font:9px Arial;color:#6b746e;width:100%;margin:0 18mm;display:flex;justify-content:space-between"><span>help-family · DEMONSTRAÇÃO · SEM VALIDADE MÉDICA</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    });
    if (example.bytes.length > 1_000_000) throw new Error('PDF excedeu o limite de 1 MB.');
    example.fileName = `demonstracao-help-family-${example.slug}.pdf`;
    await writeFile(new URL(example.fileName, output), example.bytes, { mode: 0o600 });
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

// Cada gravação usa a revisão atual; conflitos interrompem sem sobrescrever outra sessão.
async function create(resource, body) {
  await request(`/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': String(snapshot.revision) },
    body: JSON.stringify(body),
  });
  snapshot = await request('/state');
}
const findDemoMember = () =>
  snapshot.state.members.find(
    (member) => member.name === 'Pessoa Demonstração' && member.relationship === 'Perfil fictício',
  );
if (!findDemoMember())
  await create('members', {
    name: 'Pessoa Demonstração',
    relationship: 'Perfil fictício',
    initials: 'PD',
    color: '#075fab',
    medicalNotes: 'Perfil fictício criado somente para visualizar documentos de demonstração.',
  });
const member = findDemoMember();
for (const example of examples) {
  if (
    !snapshot.state.documents.some(
      (doc) => doc.memberId === member.id && doc.fileName === example.fileName,
    )
  ) {
    await create('documents', {
      title: `[DEMO] ${example.title}`,
      memberId: member.id,
      category: example.category,
      date,
      fileName: example.fileName,
      mimeType: 'application/pdf',
      fileSize: example.bytes.length,
      dataUrl: `data:application/pdf;base64,${example.bytes.toString('base64')}`,
    });
  }
  console.log(`${example.title}: ${Math.ceil(example.bytes.length / 1024)} KB`);
}
console.log(`PDFs disponíveis em ${fileURLToPath(output)} e http://127.0.0.1:3001/#documents`);
