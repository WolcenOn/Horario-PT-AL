import { test, expect } from '@playwright/test';

test('el asistente inicial explica el flujo y navega al primer paso', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/');
  await expect(page.locator('[data-view="setupWizard"]')).toBeVisible();
  await page.locator('[data-view="setupWizard"]').click();

  await expect(page.locator('#pageTitle')).toHaveText('Asistente de configuración');
  await expect(page.getByRole('heading', { name:'Configura, calcula y corrige sin empezar de nuevo' })).toBeVisible();
  await expect(page.getByText('No necesitas cargar horarios ordinarios ni sesiones PT/AL para generar el primer horario completo.')).toBeVisible();
  await expect(page.locator('[data-wizard-step]')).toHaveCount(9);
  await expect(page.locator('[data-wizard-step="structure"]')).toBeVisible();
  await expect(page.locator('[data-wizard-step="generate"]')).toContainText('Generar el horario ordinario');
  await expect(page.locator('[data-wizard-step="support"]')).toContainText('no es necesaria para generar el horario ordinario');

  await page.locator('[data-wizard-step="structure"] [data-wizard-go="classRosters"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Clases y alumnado');
  expect(errors).toEqual([]);
});

test('la configuración rápida crea una base editable por comunidad y líneas sin inventar datos normativos', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { resetDatabase } = await import('/js/db.js');
    await resetDatabase();
    localStorage.setItem('horario-user-cleared', 'true');
  });
  await page.reload();
  await page.locator('[data-view="setupWizard"]').click();

  const form = page.locator('[data-quick-start-form]');
  await expect(form).toBeVisible();
  await form.locator('select[name="territory"]').selectOption('Andalucía');
  await form.locator('select[name="defaultLines"]').selectOption('2');
  await form.getByRole('button', { name:'Crear base editable' }).click();

  await expect(page.locator('[data-wizard-step="structure"]')).toContainText('18 clase(s) definidas');
  const saved = await page.evaluate(async () => {
    const { get } = await import('/js/db.js');
    return {
      school:await get('settings', 'school'),
      planning:await get('settings', 'centerPlanning')
    };
  });
  expect(saved.school.structure.defaultLines).toBe(2);
  expect(saved.school.recesses.primaria).toEqual({ inicio:'', fin:'' });
  expect(saved.planning.territory).toBe('Andalucía');
  expect(saved.planning.curriculum).toEqual({});
});
