import { test, expect } from '@playwright/test';

test('la optimización separa reglas duras de extracción y preferencias', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('[data-view="automation"]').scrollIntoViewIfNeeded();
  await page.locator('[data-view="automation"]').click();

  await expect(page.getByRole('heading', { name:'Extracción, preferencias y horas permitidas' })).toBeVisible();
  const course = page.locator('[data-course-rule]').first();
  await expect(course).toBeVisible();

  const extraction = course.locator('[data-subject-extraction]').first();
  const preference = course.locator('[data-subject-priority]').first();
  await expect(extraction).toBeVisible();
  await expect(preference).toBeVisible();
  await expect(extraction.locator('option')).toHaveText(['PT y AL','Solo PT','Solo AL','No extraíble']);
  await expect(preference.locator('option')).toHaveText(['Baja','Media','Alta']);

  expect(errors).toEqual([]);
});
