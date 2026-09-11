import { test, expect } from '@playwright/test';

test('la barra de clases abre una semana visual y permite volver a editar esa clase', async ({ page }) => {
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
    await put('classSchedules', { id:'e2e-lengua', grupoClase:'1ºA', materia:'Lengua Castellana y Literatura', dia:'lunes', inicio:'09:00', fin:'10:00', docente:'Tutora', aula:'Aula 1ºA' });
    await put('classSchedules', { id:'e2e-mates', grupoClase:'1ºA', materia:'Matemáticas', dia:'lunes', inicio:'10:00', fin:'11:00', docente:'Tutora', aula:'Aula 1ºA' });
  });
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();

  await page.locator('[data-view="classSchedules"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Horarios de aula');
  await expect(page.locator('[data-class-schedule-group-navigation]')).toBeVisible();
  await expect(page.locator('tr[data-class-group="1ºA"] [data-view-class-week]').first()).toBeHidden();

  const weekButton = page.locator('[data-class-schedule-group-navigation] [data-view-class-week="1ºA"]');
  await expect(weekButton).toBeVisible();
  await weekButton.click();

  await expect(page.locator('.class-schedule-calendar-view')).toBeVisible();
  await expect(page.locator('[data-class-schedule-group-bar] [data-view-class-week="1ºA"]')).toHaveClass(/is-active/);
  await expect(page.locator('.class-schedule-calendar-card')).toContainText('Recreo 11:00–11:30');

  const blocks = page.locator('.class-schedule-calendar-block');
  await expect(blocks).toHaveCount(2);
  await expect(blocks.first().locator('.class-schedule-block-head')).toBeVisible();
  await expect(blocks.first().locator('.class-schedule-block-subject')).toHaveText('LEN');
  await expect(blocks.nth(1).locator('.class-schedule-block-subject')).toHaveText('MAT');
  await expect(blocks.first()).toHaveAttribute('title', /Lengua Castellana y Literatura · 09:00–10:00/);

  const hues = await blocks.evaluateAll(items => items.map(item => item.dataset.subjectHue));
  expect(new Set(hues).size).toBe(2);

  const room = blocks.first().locator('.class-schedule-block-room');
  await expect(room).toHaveText('Aula 1ºA');
  const roomPosition = await room.evaluate(element => getComputedStyle(element).position);
  expect(roomPosition).toBe('absolute');

  const gaps = page.locator('[data-class-schedule-gaps]');
  await expect(gaps).toBeVisible();
  await expect(gaps).toContainText('Huecos libres de la jornada');
  await expect(gaps).toContainText('Libre 11:30–14:00');

  await page.getByRole('button', { name:/Editar esta clase/ }).click();
  await expect(page.getByRole('heading', { name:'Horarios ordinarios por asignatura' })).toBeVisible();
  await expect(page.locator('#classScheduleFilter')).toHaveValue('1ºA');
});
