import { test, expect } from '@playwright/test';

test('permite personalizar una franja PT/AL y editar después un día', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-view="automation"]').click();
  await expect(page.getByText('Ajuste automático PT/AL', { exact:true })).toBeVisible();

  const course = page.locator('[data-course-rule]').first();
  await expect(course).toBeVisible();
  await course.locator('[data-window-mode]').selectOption('custom');
  await expect(course.locator('[data-custom-window-editor]')).not.toHaveClass(/hidden/);

  await course.locator('[data-course-copy-start]').fill('09:00');
  await course.locator('[data-course-copy-end]').fill('14:00');
  await course.locator('[data-copy-course-window]').click();

  for (const day of ['lunes','martes','miercoles','jueves','viernes']) {
    await expect(course.locator(`[data-window-start="${day}"]`)).toHaveValue('09:00');
    await expect(course.locator(`[data-window-end="${day}"]`)).toHaveValue('14:00');
  }

  await course.locator('[data-window-start="miercoles"]').fill('10:00');
  await course.locator('[data-window-end="miercoles"]').fill('13:30');
  await expect(course.locator('[data-window-start="miercoles"]')).toHaveValue('10:00');
  await expect(course.locator('[data-window-end="miercoles"]')).toHaveValue('13:30');
  await expect(course.locator('[data-window-start="martes"]')).toHaveValue('09:00');
  await expect(course.locator('[data-window-end="martes"]')).toHaveValue('14:00');
});
