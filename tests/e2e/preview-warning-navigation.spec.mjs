import { test, expect } from '@playwright/test';

async function makeLocalPlanningMode(page,mode) {
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async selectedMode=>{
    const repository=await import('/js/repository.js');
    const data=await repository.loadState();
    await repository.saveCenterPlanningSettings({
      ...data.centerPlanningSettings,mode:selectedMode
    });
  },mode);
  await page.reload();
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
}

test('cada aviso accionable lleva a la opción de configuración que falta',async({page})=>{
  await makeLocalPlanningMode(page,'ptal');
  await page.locator('.nav-item[data-view="integration"]').click();
  await expect(page.locator('#pageTitle')).toHaveText('Cuenta y sincronización');
  const row=page.locator('.integration-issue-row').filter({
    hasText:'Activa «Centro completo»'
  });
  await expect(row).toBeVisible();
  await row.getByRole('button',{name:/Activar centro completo/}).click();
  await expect(page.locator('#pageTitle')).toHaveText('Planificación académica');
  await expect(page.locator('input[name="mode"][value="global"]')).toBeVisible();
  await expect(page.locator('input[name="mode"]').first()).toBeFocused();
});

test('los indicadores de preparación enlazan con el lugar correcto',async({page})=>{
  await makeLocalPlanningMode(page,'global');
  await page.evaluate(async()=>{
    const repository=await import('/js/repository.js');
    const data=await repository.loadState();
    await repository.saveCenterPlanningSettings({
      ...data.centerPlanningSettings,mode:'global',curriculum:{}
    });
  });
  await page.reload();
  await page.locator('.nav-item[data-view="centerPlanning"]').click();
  const row=page.locator('.global-readiness-item').filter({
    hasText:'Currículo objetivo'
  });
  await expect(row).toHaveClass(/is-pending/);
  await row.getByRole('button',{name:/Revisar currículo/}).click();
  await expect(page.locator('#pageTitle')).toHaveText('Planificación académica');
  await expect(page.locator('.curriculum-course-list')).toBeVisible();
});

test('las advertencias generales no contienen enlaces externos improvisados',async({page})=>{
  await makeLocalPlanningMode(page,'ptal');
  await page.locator('.nav-item[data-view="integration"]').click();
  await expect(page.locator('.integration-issues.is-error').first()).toBeVisible();
  const links=await page.locator('[data-fix-view]').evaluateAll(nodes=>
    nodes.map(node=>({view:node.dataset.fixView,href:node.getAttribute('href')}))
  );
  const allowed=new Set([
    'centerPlanning','professionals','classSchedules','groups',
    'sessions','temporalPatterns','centerActivities','automation'
  ]);
  expect(links.length).toBeGreaterThan(0);
  expect(links.every(link=>allowed.has(link.view)&&link.href===null)).toBe(true);
});


test('la comparación semanal es solo lectura, anónima y no altera IndexedDB',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const {buildWeeklyPreviewCalendar,renderWeeklyPreviewCalendar}=
      await import('/js/weekly-preview-calendar.js');
    const state=await loadState();
    const before=JSON.stringify(state);
    const sample={...state,
      students:[{id:'private-id',nombre:'Nombre protegido'}],
      groups:[{id:'group-pt',tipo:'PT',studentIds:['private-id']}],
      classSchedules:[{grupoClase:'1ºA',materia:'Matemáticas',
        dia:'lunes',inicio:'09:00',fin:'10:00'}],
      sessions:[{groupId:'group-pt',dia:'lunes',inicio:'10:00',fin:'10:30'}]
    };
    const preview={status:'feasible',preview_only:true,
      lessons:[{group_id:'1ºA',subject_id:'Lengua Castellana y Literatura',
        weekday:1,start_time:'09:00',end_time:'10:00'}],
      supports:[{service:'AL',pupil_token:'secret-token',weekday:1,
        start_time:'10:00',end_time:'10:30',room_id:'AL-1'}],
      group_supports:[]};
    const projection=buildWeeklyPreviewCalendar(sample,preview);
    const container=document.createElement('div');
    container.id='preview-review-specimen';
    container.innerHTML=renderWeeklyPreviewCalendar(projection);
    document.body.append(container);
    const after=JSON.stringify(await loadState());
    return {before,after};
  });
  await expect(page.locator('[data-weekly-preview-calendar]')).toBeVisible();
  await expect(page.locator('[data-weekly-review-day]')).toHaveCount(5);
  await expect(page.locator('[data-weekly-review-source="fija"]')).toHaveCount(2);
  await expect(page.locator('[data-weekly-review-source="propuesta"]')).toHaveCount(2);
  await expect(page.locator('[data-weekly-preview-calendar]')).not.toContainText('secret-token');
  await expect(page.locator('[data-weekly-preview-calendar]')).not.toContainText('Nombre protegido');
  expect(result.after).toBe(result.before);
});
