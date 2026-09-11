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

  const blocks = page.locator('.class-schedule-calendar-block');
  expect(await blocks.count()).toBeGreaterThan(0);
  const firstBlock = blocks.first();
  await expect(firstBlock.locator('.class-schedule-block-head')).toBeVisible();
  await expect(firstBlock.locator('.class-schedule-block-subject')).toBeVisible();
  await expect(firstBlock.locator('.session-time')).toBeVisible();
  await expect(firstBlock).toHaveAttribute('title', /.+ · \d{2}:\d{2}–\d{2}:\d{2}/);

  const hues = await blocks.evaluateAll(items => items.map(item => item.dataset.subjectHue).filter(Boolean));
  expect(new Set(hues).size).toBeGreaterThan(1);

  const room = page.locator('.class-schedule-block-room').first();
  await expect(room).toBeVisible();
  const roomPosition = await room.evaluate(element => getComputedStyle(element).position);
  expect(roomPosition).toBe('absolute');

  await page.getByRole('button', { name:'Listado' }).click();
  await expect(page.locator('[data-class-schedule-view-switcher]')).toBeVisible();
  await expect(page.getByRole('button', { name:'Listado' })).toHaveClass(/is-active/);
  await expect(page.getByRole('heading', { name:'Horarios ordinarios por asignatura' })).toBeVisible();

  expect(errors).toEqual([]);
});
