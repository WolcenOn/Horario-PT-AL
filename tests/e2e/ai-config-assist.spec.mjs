import { test, expect } from '@playwright/test';

test('el asistente puede preparar un prompt de configuración para IA sin enviarlo', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('[data-view="setupWizard"]').click();

  const card = page.locator('[data-ai-config-assist]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('heading', { name:'Preparar configuración con IA' })).toBeVisible();
  await expect(card).toContainText('No se envía nada automáticamente a ningún proveedor de IA.');

  await card.locator('[data-generate-ai-config-prompt]').click();
  const output = card.locator('[data-ai-config-prompt-output]');
  await expect(output).toBeVisible();
  await expect(output).toHaveValue(/center-config-proposal-v1/);
  await expect(output).toHaveValue(/No des de alta un centro nuevo/);
  await expect(output).toHaveValue(/Devuelve JSON válido y nada fuera del JSON/);

  expect(errors).toEqual([]);
});
