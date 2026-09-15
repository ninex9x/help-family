import { test, expect } from '@playwright/test';

test('creates a family, medicine, presentation and routine, records a dose and reopens a document', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('help-family — Gestão de Saúde');
  await page
    .getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByText('Familiares', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Adicionar Familiar', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa Teste');
  await page.getByLabel('Parentesco', { exact: true }).fill('Irmã');
  await page.getByLabel('Observações', { exact: true }).fill('Observação de teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Pessoa Teste' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pessoa Teste' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Navegação principal', exact: true })
    .getByText('Medicamentos', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Cadastrar Medicamento', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('Medicamento Teste');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const catalog = page.locator('.catalog-drug-card').filter({ hasText: 'Medicamento Teste' });
  await catalog.getByRole('button', { name: 'Apresentação', exact: true }).click();
  await page.getByLabel('Concentração / dosagem').fill('5 mg');
  await page.getByLabel('Apresentação', { exact: true }).fill('comprimido');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Criar Regra de Uso', exact: true }).click();
  await page.getByLabel('Familiar', { exact: true }).selectOption({ label: 'Pessoa Teste' });
  await page
    .getByLabel('Medicamento', { exact: true })
    .selectOption({ label: 'Medicamento Teste' });
  await page.getByLabel('Quantidade por dose').fill('1 comprimido');
  await page.getByLabel('Horários separados por vírgula').fill('09:00, 21:00');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/#today');
  await page.getByRole('button', { name: 'Pessoa Teste', exact: false }).click();
  await page.getByRole('button', { name: 'Registrar tomada', exact: true }).first().click();
  await expect(page.locator('.daily-progress-card > strong')).toHaveText('50%');
  await page.goto('/#history');
  await page
    .getByRole('searchbox', { name: 'Buscar medicamento no histórico' })
    .fill('Medicamento Teste');
  await expect(page.locator('.history-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.history-table tbody')).toContainText('Pessoa Teste');
  await page.goto('/#documents');
  await page.getByRole('button', { name: 'Adicionar Documento', exact: false }).click();
  await page.getByLabel('Título', { exact: true }).fill('Arquivo de Teste');
  await page.getByLabel('Familiar', { exact: true }).selectOption({ label: 'Pessoa Teste' });
  await page.locator('[name="documentFile"]').setInputFiles({
    name: 'teste.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Conteúdo fictício para testar persistência.'),
  });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page
    .locator('.document-card')
    .filter({ hasText: 'Arquivo de Teste' })
    .getByRole('button', { name: 'Visualizar' })
    .click();
  await expect(page.locator('.document-preview')).toContainText('Conteúdo fictício');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('dialog').getByRole('button', { name: 'Baixar', exact: true }).click();
  expect((await downloadEvent).suggestedFilename()).toBe('teste.txt');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(errors).toEqual([]);
});

test('all five pages work on mobile and tablet without horizontal overflow', async ({ page }) => {
  for (const width of [390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['today', 'family', 'medicines', 'history', 'documents']) {
      await page.goto(`/#${view}`);
      await expect(page.locator('.content-container')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${view} at ${width}px`,
      ).toBe(true);
      await expect(
        page.getByRole('navigation', {
          name: width < 768 ? 'Navegação móvel' : 'Navegação principal',
          exact: true,
        }),
      ).toBeVisible();
    }
  }
  await page.goto('/#today');
  await page.screenshot({ path: 'test-results/help-family-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/help-family-mobile.png', fullPage: true });
});

test('development server does not expose the database or encryption key', async ({ request }) => {
  for (const path of [
    '/data/encryption.key',
    '/data/help-family.sqlite',
    '/@fs' + process.cwd() + '/data/encryption.key',
    '/@fs' + process.cwd() + '/legacy/.dev.vars',
  ]) {
    const response = await request.get(path);
    // SPA fallback may return the public index, but never a private file.
    expect(
      response.status() === 403 ||
        response.status() === 404 ||
        response.headers()['content-type']?.includes('text/html'),
    ).toBeTruthy();
    expect(await response.text()).not.toContain('LOCAL_DATA_ENCRYPTION_KEY=');
  }
});

test('profile edits escape markup and support removing an uploaded photo', async ({ page }) => {
  await page.goto('/#family');
  const card = page
    .locator('.family-profile-card')
    .filter({ has: page.getByRole('heading', { name: 'João', exact: true }) });
  await card.getByRole('button', { name: 'Editar familiar', exact: true }).click();
  await page.getByLabel('Nome', { exact: true }).fill('<b>Perfil teste</b>');
  await page.getByLabel('Observações', { exact: true }).fill('Nota temporária');
  const photo = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d');
    context.fillStyle = '#016b54';
    context.fillRect(0, 0, 32, 32);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[name="photoFile"]').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(photo, 'base64'),
  });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const edited = page.locator('.family-profile-card').filter({ hasText: '<b>Perfil teste</b>' });
  await expect(edited.locator('h2')).toHaveText('<b>Perfil teste</b>');
  await expect(edited.locator('h2 b')).toHaveCount(0);
  await expect(edited.locator('img')).toBeVisible();
  await edited.getByRole('button', { name: 'Editar familiar', exact: true }).click();
  await page.getByLabel('Remover foto atual').check();
  await page.getByLabel('Observações', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edited.locator('img')).toHaveCount(0);
  await expect(edited.locator('.family-medical-note')).toHaveCount(0);
  await expect(edited).not.toContainText('Nota temporária');
});

test('renders an uploaded PDF locally', async ({ page }) => {
  // Minimal valid PDF built in memory; no external fixture or network document.
  const content = 'BT /F1 12 Tf 20 150 Td (Help family test) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  await page.goto('/#documents');
  await page.getByRole('button', { name: 'Adicionar Documento', exact: false }).click();
  await page.getByLabel('Título', { exact: true }).fill('PDF de Teste');
  await page
    .locator('[name="documentFile"]')
    .setInputFiles({ name: 'teste.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page
    .locator('.document-card')
    .filter({ hasText: 'PDF de Teste' })
    .getByRole('button', { name: 'Visualizar' })
    .click();
  await expect(page.locator('.document-preview canvas')).toBeVisible();
});

test('clinical pages request server HTML and show backend form validation', async ({ page }) => {
  const calls = [];
  page.on('request', (request) => calls.push(new URL(request.url()).pathname));
  await page.goto('/#family');
  await expect(page.locator('.family-page')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar Familiar', exact: true }).click();
  await expect(page.locator('form[data-form]')).toHaveAttribute('novalidate', '');
  const rejected = page.waitForResponse(
    (response) =>
      response.url().includes('/api/actions/forms/member') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Salvar', exact: true }).click();
  expect((await rejected).status()).toBe(422);
  await expect(page.getByRole('alert')).toContainText('Dados inválidos');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(calls).toContain('/api/views/family');
  expect(calls).not.toContain('/api/state');
});
