import { test, expect } from '@playwright/test';

// O servidor de testes usa apenas dados fictícios em SQLite temporário.
test('restored catalog links the chosen medicine and persists its switch state', async ({
  page,
}) => {
  await page.goto('/#medicines');
  const card = page
    .locator('.catalog-drug-card')
    .filter({ has: page.getByRole('heading', { name: 'Losartana Potássica', exact: true }) });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.catalog-presentations')).toContainText('50 mg');
  await card.getByRole('button', { name: 'Vincular', exact: true }).click();
  await expect(page.getByLabel('Medicamento', { exact: true })).toHaveValue('drug-losartana');
  await expect(page.getByLabel('Apresentação', { exact: true })).toHaveValue(
    'presentation-losartana-50',
  );
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const toggle = card.getByRole('switch').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
});

test('family shortcuts and document chips keep filters visible and consistent', async ({
  page,
}) => {
  await page.goto('/#family');
  const family = page
    .locator('.family-profile-card')
    .filter({ has: page.getByRole('heading', { name: 'Ana', exact: true }) });
  await expect(family.getByRole('progressbar')).toBeVisible();
  await family.getByRole('button', { name: 'Medicamentos', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Filtrar por familiar' })).toHaveValue('ana');
  await expect(page.locator('.catalog-routine-row')).toHaveCount(2);
  await expect(page.locator('.catalog-routine-row strong').first()).toHaveText('Ana');
  await page.goto('/#family');
  await family.getByRole('button', { name: 'Ver Documentos', exact: true }).click();
  await expect(page.locator('[data-filter-key="documentMember"][aria-pressed="true"]')).toHaveText(
    'Ana',
  );
  await expect(page.locator('.document-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Todos os familiares', exact: true }).click();
  await page.getByRole('button', { name: 'Exame', exact: true }).click();
  await expect(page.locator('.document-card')).toHaveCount(1);
  await expect(page.locator('.document-category-badge')).toHaveText('Exame');
  await page.getByRole('searchbox', { name: 'Buscar documentos', exact: true }).fill('inexistente');
  await expect(page.getByRole('heading', { name: 'Nenhum documento encontrado' })).toBeVisible();
  await page.goto('/#history');
  await page.getByRole('button', { name: 'Ana', exact: true }).click();
  await expect(page.locator('[data-filter-key="historyMember"][aria-pressed="true"]')).toHaveText(
    'Ana',
  );
  await expect(page.locator('.history-table thead th')).toHaveCount(6);
});

test('restored pages and member panel fit narrow screens and both themes', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const theme of ['light', 'dark']) {
    await page.goto('/');
    await page.evaluate((theme) => localStorage.setItem('help-family-theme', theme), theme);
    await page.reload();
    for (const width of [320, 768, 1719]) {
      await page.setViewportSize({ width, height: 1014 });
      for (const view of ['today', 'family', 'medicines', 'history', 'documents']) {
        await page.goto(`/#${view}`);
        const screen = {
          today: '.greeting-section',
          family: '.family-page',
          medicines: '.medication-management-page',
          history: '.history-page',
          documents: '.documents-page',
        }[view];
        await expect(page.locator(screen)).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${view}, ${theme}, ${width}px`,
        ).toBe(true);
        if (width === 1719)
          await page.screenshot({
            path: `test-results/restored-${view}-${theme}.png`,
            fullPage: true,
          });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#family');
    await page.getByRole('button', { name: 'Adicionar Familiar', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Aguarda o painel terminar a entrada antes de medir sua posição final.
    await dialog.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished)),
    );
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(845);
    await page.screenshot({ path: `test-results/restored-member-panel-${theme}.png` });
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
