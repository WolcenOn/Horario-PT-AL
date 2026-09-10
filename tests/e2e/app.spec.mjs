import { test, expect } from '@playwright/test';

async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

test('la aplicación arranca y permite navegar por las áreas principales', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await openApp(page);
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

test('la cuenta y sincronización mantiene el modo offline y muestra el contexto académico', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Cuenta y sincronización');
  await expect(page.getByRole('heading', { name:'Curso académico y escenario' })).toBeVisible();
  await expect(page.getByText('Conexión necesaria')).toBeVisible();
  await expect(page.getByText('El modo offline no necesita curso remoto ni escenario.')).toBeVisible();

  expect(errors).toEqual([]);
});

test('guarda y restaura una copia compartida de un escenario', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('horario-gestor-escuela-backend', JSON.stringify({
      enabled:true,
      baseUrl:'https://gestor.test',
      schoolId:'school-1',
      actorId:'actor-1',
      academicYearId:'year-1',
      scenarioId:'scenario-1',
      autoSync:false
    }));
  });

  let storedSnapshot = null;
  await page.route('https://gestor.test/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/schools/school-1/academic-years') {
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify([{ id:'year-1', school_id:'school-1', label:'2026/27', version:1 }])
      });
    }
    if (url.pathname === '/schools/school-1/academic-years/year-1/scenarios') {
      return route.fulfill({
        status:200,
        contentType:'application/json',
        body:JSON.stringify([{ id:'scenario-1', school_id:'school-1', academic_year_id:'year-1', name:'Planificación inicial', status:'DRAFT', version:1 }])
      });
    }
    if (url.pathname === '/schools/school-1/academic-years/year-1/scenarios/scenario-1/snapshot') {
      if (request.method() === 'PUT') {
        const body = request.postDataJSON();
        storedSnapshot = {
          id:'snapshot-1',
          school_id:'school-1',
          academic_year_id:'year-1',
          scenario_id:'scenario-1',
          version:1,
          source_hash:body.source_hash,
          payload:body.payload,
          updated_by_user_id:'actor-1',
          created_at:'2026-09-08T10:00:00Z',
          updated_at:'2026-09-08T10:00:00Z'
        };
        return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(storedSnapshot) });
      }
      if (!storedSnapshot) {
        return route.fulfill({ status:404, contentType:'application/json', body:JSON.stringify({ detail:'Planning scenario has no saved snapshot' }) });
      }
      return route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(storedSnapshot) });
    }
    return route.fulfill({ status:404, contentType:'application/json', body:'{}' });
  });

  page.on('dialog', dialog => dialog.accept());
  await openApp(page);
  await page.locator('[data-view="integration"]').click();
  await expect(page.getByText('Este escenario todavía no tiene una copia del proyecto guardada.')).toBeVisible();

  await page.locator('[data-save-scenario-snapshot]').click();
  await expect(page.getByText(/Versión 1 guardada en PostgreSQL/)).toBeVisible();
  await expect(page.locator('[data-restore-scenario-snapshot]')).toBeEnabled();
  expect(storedSnapshot?.payload?.format).toBe('horario-pt-al');
  expect(storedSnapshot?.payload?.schemaVersion).toBe(5);

  await page.locator('[data-restore-scenario-snapshot]').click();
  await expect(page.locator('#toastRoot')).toContainText('Escenario cargado:');
  expect(errors).toEqual([]);
});

test('Horario semanal compara dos docentes lado a lado y prepara impresión múltiple', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await openApp(page);
  await expect(page.locator('#pageTitle')).toHaveText('Horario semanal');
  await expect(page.locator('[data-teacher-calendar-toolbar]')).toBeVisible();

  const primary = page.locator('[data-teacher-calendar-select]');
  await primary.selectOption('prof_pt_ana');
  await expect(page.locator('.teacher-calendar-view')).toBeVisible();
  await expect(page.locator('.teacher-calendar-card')).toBeVisible();
  await expect(page.locator('[data-print-current-teacher]')).toBeVisible();

  const compare = page.locator('[data-teacher-calendar-compare]');
  await expect(compare).toBeEnabled();
  await compare.selectOption('prof_pt_maria');

  await expect(page.locator('.teacher-comparison-summary-grid article')).toHaveCount(2);
  await expect(page.locator('.teacher-comparison-key span')).toHaveCount(2);
  await expect(page.locator('.teacher-day-column.is-comparison')).toHaveCount(5);
  await expect(page.locator('.teacher-lane-divider')).toHaveCount(5);

  const anaBlock = page.locator('.teacher-session-block[data-professional-id="prof_pt_ana"]').first();
  const mariaBlock = page.locator('.teacher-session-block[data-professional-id="prof_pt_maria"]').first();
  await expect(anaBlock).toBeVisible();
  await expect(mariaBlock).toBeVisible();
  const anaWidth = await anaBlock.evaluate(element => element.getBoundingClientRect().width);
  const mariaWidth = await mariaBlock.evaluate(element => element.getBoundingClientRect().width);
  const dayWidth = await page.locator('.teacher-day-column').first().evaluate(element => element.getBoundingClientRect().width);
  expect(anaWidth).toBeLessThan(dayWidth * 0.6);
  expect(mariaWidth).toBeLessThan(dayWidth * 0.6);

  await page.locator('[data-print-teachers]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name:'Imprimir horarios del profesorado' })).toBeVisible();
  expect(await page.locator('.teacher-print-grid input[name="professionalId"]:checked').count()).toBe(2);
  await expect(page.locator('[data-print-all-teachers]')).toBeVisible();
  await page.getByRole('button', { name:'Cancelar' }).click();

  await page.locator('[data-teacher-calendar-select]').selectOption('');
  await expect(page.locator('.calendar-card')).toBeVisible();
  await expect(page.locator('[data-teacher-calendar-toolbar]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('el filtro AL deja las sesiones AL editables sin que PT capture el clic', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await openApp(page);
  await page.locator('[data-service-filter="AL"]').click();

  await expect(page.locator('.session-block.al').first()).toBeVisible();
  await expect(page.locator('.session-block.pt').first()).toBeHidden();

  await page.locator('.session-block.al').first().click();
  await expect(page.locator('[data-reference-edit]')).toBeVisible();
  await page.locator('[data-reference-edit]').click();

  await expect(page.getByRole('dialog')).toBeVisible();
  const selectedGroup = page.locator('#groupId option:checked');
  await expect(selectedGroup).toContainText('AL');
  expect(errors).toEqual([]);
});

test('editar una profesional AL conserva su tipo y permite cambiar el selector', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await openApp(page);
  await page.locator('[data-view="professionals"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Profesorado');

  const row = page.locator('tbody tr').filter({ hasText:'Carmen Ruiz' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name:'Editar' }).click();

  await expect(page.getByRole('dialog')).toBeVisible();
  const type = page.locator('#tipo');
  await expect(type).toHaveValue('AL');
  await type.selectOption('DOCENTE');
  await expect(type).toHaveValue('DOCENTE');
  await type.selectOption('AL');
  await expect(type).toHaveValue('AL');
  expect(errors).toEqual([]);
});

test('el formulario de actividades mantiene legibles los días en escritorio', async ({ page }) => {
  await openApp(page);
  await page.locator('[data-view="centerActivities"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Actividades del centro');
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
