import { test, expect } from '@playwright/test';

test('el asistente inicial explica el flujo y navega al primer paso', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('[data-view="setupWizard"]')).toBeVisible();
  await page.locator('[data-view="setupWizard"]').click();

  await expect(page.locator('#pageTitle')).toHaveText('Asistente de configuración');
  await expect(page.getByRole('heading', { name:'Configura el centro paso a paso' })).toBeVisible();
  await expect(page.getByText('No necesitas cargar horarios ordinarios ni sesiones PT/AL para generar el primer horario completo.')).toBeVisible();
  await expect(page.locator('[data-wizard-step]')).toHaveCount(9);
  await expect(page.locator('[data-wizard-step="structure"]')).toBeVisible();
  await expect(page.locator('[data-wizard-step="generate"]')).toContainText('Generar el horario ordinario');
  await expect(page.locator('[data-wizard-step="support"]')).toContainText('no es necesaria para generar el horario ordinario');

  await page.locator('[data-wizard-step="structure"] [data-wizard-go="classRosters"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Clases y alumnado');
  expect(errors).toEqual([]);
});
