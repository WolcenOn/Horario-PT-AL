import { test, expect } from '@playwright/test';

test('la optimización separa reglas duras de extracción y preferencias', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('[data-view="automation"]').scrollIntoViewIfNeeded();
  await page.locator('[data-view="automation"]').click();

  await expect(page.getByRole('heading', { name:'Extracción, preferencias y horas permitidas' })).toBeVisible();
  await expect(page.locator('[data-course-rule]').first()).toBeVisible();

  const extraction = page.locator('[data-subject-extraction]').first();
  await expect(extraction).toBeVisible();
  const subjectRow = extraction.locator('xpath=ancestor::*[contains(@class,"subject-policy-row")][1]');
  const preference = subjectRow.locator('[data-subject-priority]');
  await expect(preference).toBeVisible();
  await expect(extraction.locator('option')).toHaveText(['PT y AL','Solo PT','Solo AL','No extraíble']);
  await expect(preference.locator('option')).toHaveText(['Baja','Media','Alta']);

  expect(errors).toEqual([]);
});
