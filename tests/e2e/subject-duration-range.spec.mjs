import { test, expect } from '@playwright/test';

test('Patrones temporales guarda duración mínima, preferida y máxima por materia', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.evaluate(async () => {
    const { put } = await import('/js/db.js');
    await put('settings', {
      id:'centerPlanning',
      mode:'global',
      generation:{ start:'09:00', end:'14:00', lessonMinutes:60, stepMinutes:15, maxSameSubjectPerDay:2 },
      curriculum:{ '1º':{ 'Lengua Castellana y Literatura':270 } },
      subjectPatterns:{},
      weeklyActivities:[]
    });
  });
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.locator('[data-view="temporalPatterns"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Patrones temporales');
  const row = page.locator('[data-edit-subject-pattern][data-course="1º"][data-subject="Lengua Castellana y Literatura"]');
  await expect(row).toBeVisible();
  await row.click();

  await expect(page.locator('#subjectSessionMinutes')).toBeVisible();
  await page.locator('#subjectSessionMinutes').selectOption('60');
  await page.locator('#subjectMinSessionMinutes').selectOption('45');
  await page.locator('#subjectMaxSessionMinutes').selectOption('60');
  await page.locator('#subjectMaxPerDay').selectOption('1');
  await page.getByRole('button', { name:'Guardar patrón' }).click();

  await expect(page.getByText(/preferida 60 min · rango 45–60 min · máx\. 1\/día/)).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { get } = await import('/js/db.js');
    return get('settings', 'centerPlanning');
  });
  const pattern = saved.subjectPatterns['1º']['Lengua Castellana y Literatura'];
  expect(pattern.sessionMinutes).toBe(60);
  expect(pattern.minSessionMinutes).toBe(45);
  expect(pattern.maxSessionMinutes).toBe(60);
  expect(pattern.maxSessionsPerDay).toBe(1);
});
