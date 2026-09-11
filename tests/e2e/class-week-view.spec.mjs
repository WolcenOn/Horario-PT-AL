import { test, expect } from '@playwright/test';

test('permite alternar desde la lista al horario semanal visual de una clase', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.locator('[data-view="classSchedules"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Horarios de aula');

  const weekButton = page.locator('[data-view-class-week]').first();
  await expect(weekButton).toBeVisible();
  await weekButton.click();

  const panel = page.locator('[data-class-week-panel]');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Vista semanal');
  await expect(panel).toContainText('Lunes');
  await expect(panel).toContainText('Viernes');
  await expect(panel.locator('[data-week-overview-day]')).toHaveCount(5);

  await panel.locator('[data-close-class-week]').click();
  await expect(panel).toBeHidden();
});
