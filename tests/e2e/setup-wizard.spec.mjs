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


test('la carga curricular importada se aplica a planificación y se conserva en IndexedDB',async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const {resetDatabase}=await import('/js/db.js');
    await resetDatabase();
    localStorage.setItem('horario-user-cleared','true');
  });
  await page.reload();
  await page.locator('.nav-item[data-view="setupWizard"]').click();
  const quick=page.locator('[data-quick-start-form]');
  await quick.locator('select[name="territory"]').selectOption('Andalucía');
  await quick.getByRole('button',{name:'Crear base editable'}).click();
  await expect(page.locator('[data-wizard-step="structure"]')).toContainText('9 clase(s) definidas');
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  await expect(page.locator('#territory')).toHaveValue('Andalucía');
  await expect(page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('');
  await page.locator('[data-curriculum-import] summary').click();
  const sample={
    territory:'Andalucía',
    legalReference:'Norma de prueba · anexo contrastado (no oficial)',
    profileName:'Perfil de ensayo',
    academicYear:'2026/27',
    weeklyHours:{'1º':{'Matemáticas':4.5,'Lengua Castellana y Literatura':5}}
  };
  await page.locator('#curriculumProfileJson').fill(JSON.stringify(sample));
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-apply-curriculum-profile]').click();
  await expect(page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('4.5');
  await expect(page.locator('#legalReference')).toHaveValue(sample.legalReference);
  const saved=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return get('settings','centerPlanning');
  });
  expect(saved.curriculum['1º'].Matemáticas).toBe(270);
  expect(saved.curriculum['1º']['Lengua Castellana y Literatura']).toBe(300);
  expect(saved.curriculumSource.kind).toBe('imported');
  expect(saved.legalReference).toBe(sample.legalReference);
  await page.reload();
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  await expect(page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('4.5');
});

test('un perfil territorial distinto no se aplica ni modifica la configuración local',async({page})=>{
  await page.goto('/');
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  await page.locator('#territory').fill('Galicia');
  await page.locator('[data-curriculum-import] summary').click();
  await page.locator('#curriculumProfileJson').fill(JSON.stringify({
    territory:'Andalucía',legalReference:'Referencia de ensayo',
    weeklyHours:{'2º':{Matemáticas:3}}
  }));
  await page.locator('[data-apply-curriculum-profile]').click();
  await expect(page.locator('[data-curriculum-import-error]')).toContainText('no coincide');
  await expect(page.locator('[data-curriculum-course="2º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('');
});


test('un perfil versionado del catálogo solo se aplica tras revisión y las adaptaciones quedan marcadas',async({page})=>{
  const entry={
    profileId:'es-example-primaria',version:'2026.1',territory:'Andalucía',
    legalReference:'Norma de prueba - anexo simulado',academicYear:'2026/27'
  };
  const pack={...entry,profileName:'Perfil ficticio de pruebas',
    effectiveFrom:'2026-09-01',sourceUrl:'https://example.org/norma',
    weeklyHours:{'1º':{Matemáticas:4.5,'Lengua Castellana y Literatura':5}}
  };
  await page.route('**/curriculum-regulations/catalog.json',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({schemaVersion:1,profiles:[entry]})
  }));
  await page.route('**/curriculum-regulations/profiles/es-example-primaria/2026.1.json',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify(pack)
  }));
  await page.goto('/');
  await page.evaluate(async()=>{
    const {resetDatabase}=await import('/js/db.js');
    await resetDatabase();
    localStorage.setItem('horario-user-cleared','true');
  });
  await page.reload();
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  await page.locator('#territory').fill('Andalucía');
  await page.locator('[data-curriculum-import] summary').click();
  await expect(page.locator('#curriculumCatalogSelect')).toContainText('v2026.1');
  await page.locator('#curriculumCatalogSelect').selectOption('es-example-primaria@2026.1');
  await page.locator('[data-prepare-regulation]').click();
  await expect(page.locator('[data-regulation-catalog-status]')).toContainText('preparada');
  await expect(page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-apply-curriculum-profile]').click();
  await expect(page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]')).toHaveValue('4.5');
  let saved=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return get('settings','centerPlanning');
  });
  expect(saved.curriculumSource.profileId).toBe('es-example-primaria');
  expect(saved.curriculumSource.version).toBe('2026.1');
  expect(saved.curriculumSource.modified).toBe(false);
  await page.getByRole('button',{name:'Guardar configuración global'}).click();
  saved=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return get('settings','centerPlanning');
  });
  expect(saved.curriculumSource.modified).toBe(false);
  await page.locator('[data-curriculum-course="1º"][data-curriculum-subject="Matemáticas"]').fill('4.75');
  await page.getByRole('button',{name:'Guardar configuración global'}).click();
  await expect(page.getByText(/PERSONALIZADO/)).toBeVisible();
  saved=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return get('settings','centerPlanning');
  });
  expect(saved.curriculum['1º'].Matemáticas).toBe(285);
  expect(saved.curriculumSource.version).toBe('2026.1');
  expect(saved.curriculumSource.modified).toBe(true);
});
