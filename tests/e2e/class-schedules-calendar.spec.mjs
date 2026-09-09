import { test, expect } from '@playwright/test';

test('Horarios de aula alterna listado y vista semanal por clase', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await page.locator('[data-view="classSchedules"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Horarios de aula');
  await expect(page.locator('[data-class-schedule-view-switcher]')).toBeVisible();
  await expect(page.getByRole('button', { name:'Listado' })).toHaveClass(/is-active/);

  await page.getByRole('button', { name:'Vista semanal' }).click();
  await expect(page.locator('.class-schedule-calendar-view')).toBeVisible();
  await expect(page.locator('.class-schedule-calendar-card')).toBeVisible();

  const groupSelect = page.locator('[data-class-schedule-calendar-group]');
  await expect(groupSelect).toBeVisible();
  expect(await groupSelect.locator('option').count()).toBeGreaterThan(0);

  await expect(page.locator('.class-schedule-day-column')).toHaveCount(5);
  await expect(page.locator('.calendar-head')).toContainText('Lunes');
  await expect(page.locator('.calendar-head')).toContainText('Viernes');

  await page.getByRole('button', { name:'Listado' }).click();
  await expect(page.locator('[data-class-schedule-view-switcher]')).toBeVisible();
  await expect(page.getByRole('button', { name:'Listado' })).toHaveClass(/is-active/);
  await expect(page.getByRole('heading', { name:'Horarios ordinarios por asignatura' })).toBeVisible();

  expect(errors).toEqual([]);
});
