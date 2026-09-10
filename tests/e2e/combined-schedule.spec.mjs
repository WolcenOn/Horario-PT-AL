import { test, expect } from '@playwright/test';

test('la vista combinada explica y cruza las capas de horario', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  const combinedNav = page.locator('[data-view="combinedCalendar"]');
  await expect(combinedNav).toBeVisible();
  await combinedNav.scrollIntoViewIfNeeded();
  await combinedNav.click();

  await expect(page.locator('#pageTitle')).toHaveText('Horario combinado');
  await expect(page.getByRole('heading', { name:'Horario académico + capas PT y AL' })).toBeVisible();
  await expect(page.getByText('Una coincidencia Aula + PT/AL no es un conflicto por sí sola.')).toBeVisible();
  await expect(page.locator('.combined-schedule-summary')).toBeVisible();
  await expect(page.locator('[data-combined-day]')).toHaveCount(5);

  expect(errors).toEqual([]);
});
