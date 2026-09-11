import { test, expect } from '@playwright/test';

test('Ver semana abre la vista semanal existente en la clase de la fila y muestra huecos', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.evaluate(async () => {
    const { put } = await import('/js/db.js');
    await put('settings', {
      id:'school',
      structure:{ configured:true, defaultLines:1, courseLines:{} },
      recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'11:00',fin:'11:30'} }
    });
    await put('settings', {
      id:'centerPlanning',
      mode:'global',
      generation:{ start:'09:00', end:'14:00', lessonMinutes:60, maxSameSubjectPerDay:3 },
      curriculum:{},
      subjectPatterns:{},
      weeklyActivities:[]
    });
    await put('classSchedules', { id:'e2e-lengua', grupoClase:'1ºA', materia:'Lengua', dia:'lunes', inicio:'09:00', fin:'10:00', docente:'Tutora' });
    await put('classSchedules', { id:'e2e-mates', grupoClase:'1ºA', materia:'Matemáticas', dia:'lunes', inicio:'10:00', fin:'11:00', docente:'Tutora' });
  });
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.locator('[data-view="classSchedules"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Horarios de aula');

  const weekButton = page.locator('tr[data-class-group="1ºA"] [data-view-class-week]').first();
  await expect(weekButton).toBeVisible();
  await weekButton.click();

  await expect(page.locator('.class-schedule-calendar-view')).toBeVisible();
  await expect(page.locator('[data-class-schedule-calendar-group]')).toHaveValue('1ºA');
  await expect(page.locator('.class-schedule-calendar-card')).toContainText('Recreo 11:00–11:30');
  const gaps = page.locator('[data-class-schedule-gaps]');
  await expect(gaps).toBeVisible();
  await expect(gaps).toContainText('Huecos libres de la jornada');
  await expect(gaps).toContainText('Libre 11:30–14:00');
});
