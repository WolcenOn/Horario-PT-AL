import { test, expect } from '@playwright/test';

test('la barra lateral mantiene accesibles las opciones largas en un portatil compacto', async ({ page }) => {
  await page.setViewportSize({ width:1024, height:768 });
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  const sidebar = page.locator('#sidebar');
  const automation = page.locator('[data-view="automation"]');

  await expect(sidebar).toBeVisible();
  await expect(automation).toContainText('Optimización PT/AL');

  const overflowY = await sidebar.evaluate(element => getComputedStyle(element).overflowY);
  expect(overflowY).toBe('auto');

  const overflowsHorizontally = await automation.evaluate(element => element.scrollWidth > element.clientWidth + 1);
  expect(overflowsHorizontally).toBe(false);

  await automation.scrollIntoViewIfNeeded();
  await automation.click();
  await expect(page.locator('#pageTitle')).toHaveText('Optimización PT/AL');
});
