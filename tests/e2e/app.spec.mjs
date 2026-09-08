import { test, expect } from '@playwright/test';

test('la aplicación arranca y permite navegar por las áreas principales', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('#pageTitle')).toHaveText('Horario semanal');
  await expect(page.locator('[data-view="professionals"]')).toBeVisible();
  await expect(page.locator('[data-view="centerActivities"]')).toBeVisible();
  await expect(page.locator('[data-view="capacityStudy"]')).toBeVisible();

  await page.locator('[data-view="professionals"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Profesorado');

  await page.locator('[data-view="classRosters"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Clases y alumnado');

  expect(errors).toEqual([]);
});

test('el formulario de actividades mantiene legibles los días en escritorio', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="centerActivities"]').click();
  await expect(page.getByRole('heading', { name:'Actividades del centro' })).toBeVisible();
  await page.locator('[data-add-center-activity]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name:'Nueva actividad del centro' })).toBeVisible();

  const dayGrids = page.locator('.activity-day-grid');
  await expect(dayGrids).toHaveCount(2);

  for (const grid of await dayGrids.all()) {
    const labels = grid.locator('label');
    await expect(labels).toHaveCount(5);
    const boxes = [];
    for (let index = 0; index < 5; index += 1) {
      const label = labels.nth(index);
      await expect(label).toBeVisible();
      boxes.push(await label.boundingBox());
      const checkbox = label.locator('input[type="checkbox"]');
      const checkboxBox = await checkbox.boundingBox();
      expect(checkboxBox?.width ?? 999).toBeLessThanOrEqual(24);
      expect(checkboxBox?.height ?? 999).toBeLessThanOrEqual(24);
    }
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        expect(overlap(boxes[left], boxes[right])).toBe(false);
      }
    }
  }
});

function overlap(a, b) {
  if (!a || !b) return true;
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}
