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


test('muestra diferencias y minutos sin modificar los horarios guardados',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const {buildWeeklyPreviewCalendar,renderWeeklyPreviewCalendar}=
      await import('/js/weekly-preview-calendar.js');
    const state=await loadState();
    const before=JSON.stringify(state);
    const local={...state,students:[{id:'pupil-secret',nombre:'Private pupil'}],
      classSchedules:[
        {grupoClase:'1ºA',materia:'Matemáticas',dia:'lunes',inicio:'09:00',fin:'10:00'},
        {grupoClase:'1ºA',materia:'Lengua Castellana y Literatura',dia:'martes',
          inicio:'09:00',fin:'09:45'}
      ],groups:[],sessions:[]};
    const output={status:'feasible',preview_only:true,
      lessons:[
        {group_id:'1ºA',subject_id:'Matemáticas',weekday:0,
          start_time:'09:00',end_time:'10:00'},
        {group_id:'1ºA',subject_id:'Inglés',weekday:1,
          start_time:'10:00',end_time:'10:45'}
      ],
      supports:[{service:'PT',weekday:2,start_time:'10:00',
        end_time:'10:30',pupil_token:'private-token'}],group_supports:[]};
    const view=document.createElement('div');
    view.id='diff-review-fixture';
    view.innerHTML=renderWeeklyPreviewCalendar(buildWeeklyPreviewCalendar(local,output));
    document.body.append(view);
    return {before,after:JSON.stringify(await loadState())};
  });
  const view=page.locator('#diff-review-fixture');
  await expect(view.locator('[data-weekly-review-change="same"]')).toHaveCount(2);
  await expect(view.locator('[data-weekly-review-change="removed"]')).toHaveCount(1);
  await expect(view.locator('[data-weekly-review-change="new"]')).toHaveCount(2);
  await expect(view.locator('[data-weekly-review-classes]')).toContainText('105 min');
  await expect(view.locator('[data-weekly-review-supports]')).toContainText('30 min');
  await expect(view).not.toContainText('Private pupil');
  await expect(view).not.toContainText('private-token');
  expect(result.after).toBe(result.before);
});


test('los filtros de clase, profesional y sala cambian solo la vista; limpiar restaura minutos',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const {buildWeeklyPreviewCalendar,renderWeeklyPreviewCalendar,
      bindWeeklyPreviewCalendarFilters}=await import('/js/weekly-preview-calendar.js');
    const snapshot=JSON.stringify(await loadState());
    const sample={
      professionals:[{id:'teacher-1',nombre:'Docente A'},
        {id:'teacher-2',nombre:'Docente B'}],
      students:[{id:'secret-child',nombre:'Nombre reservado',grupoClase:'1A'}],
      groups:[{id:'group-pt',tipo:'PT',professionalId:'teacher-2',
        studentIds:['secret-child'],roomId:'Sala PT'}],
      sessions:[{groupId:'group-pt',dia:'lunes',inicio:'10:00',fin:'10:30'}],
      classSchedules:[
        {grupoClase:'1A',materia:'Matemáticas',professionalId:'teacher-1',
          aula:'Aula 1',dia:'lunes',inicio:'09:00',fin:'10:00'},
        {grupoClase:'2B',materia:'Inglés',professionalId:'teacher-2',
          aula:'Aula 2',dia:'martes',inicio:'09:00',fin:'09:45'}
      ]
    };
    const payload={lessons:[
      {group_id:'1A',subject_id:'Matemáticas',teacher_id:'teacher-1',room_id:'Aula 1'},
      {group_id:'2B',subject_id:'Inglés',teacher_id:'teacher-2',room_id:'Aula 2'}
    ],supports:[{request_id:'req-1',group_id:'1A',teacher_id:'teacher-2',
      pupil_token:'private-token'}]};
    const response={status:'feasible',preview_only:true,lessons:[
      {group_id:'1A',subject_id:'Matemáticas',teacher_id:'teacher-1',
        weekday:0,start_time:'09:00',end_time:'10:00'},
      {group_id:'2B',subject_id:'Inglés',teacher_id:'teacher-2',
        weekday:1,start_time:'10:00',end_time:'10:45'}
    ],supports:[{service:'PT',request_id:'req-1',weekday:1,
      start_time:'11:00',end_time:'11:30',room_id:'Sala PT'}],group_supports:[]};
    const projection=buildWeeklyPreviewCalendar(sample,response,payload);
    const fixture=document.createElement('div');
    fixture.id='filters-preview-fixture';
    fixture.innerHTML=renderWeeklyPreviewCalendar(projection);
    document.body.append(fixture);
    bindWeeklyPreviewCalendarFilters(fixture,projection);
    return {snapshot,after:JSON.stringify(await loadState())};
  });
  const view=page.locator('#filters-preview-fixture');
  await expect(view.locator('[data-weekly-filter="classGroup"]')).toHaveCount(1);
  await expect(view.locator('[data-weekly-filter="teacherId"]')).toContainText('Docente A');
  await expect(view.locator('[data-weekly-filter="room"]')).toContainText('Sala PT');
  await expect(view.locator('[data-weekly-review-block]')).toHaveCount(7);
  await view.locator('[data-weekly-filter="classGroup"]').selectOption('1A');
  await expect(view.locator('[data-weekly-review-block]')).toHaveCount(5);
  await view.locator('[data-weekly-filter="teacherId"]').selectOption('teacher-2');
  await expect(view.locator('[data-weekly-review-block]')).toHaveCount(3);
  await view.locator('[data-weekly-filter="room"]').selectOption('Sala PT');
  await expect(view.locator('[data-weekly-review-block]')).toHaveCount(3);
  await expect(view.locator('[data-weekly-review-classes]')).toContainText('Sin materias para comparar');
  await expect(view.locator('[data-weekly-review-supports]')).toContainText('60 min');
  await expect(view).not.toContainText('Nombre reservado');
  await expect(view).not.toContainText('private-token');
  await view.locator('[data-weekly-filter-reset]').click();
  await expect(view.locator('[data-weekly-review-block]')).toHaveCount(7);
  await expect(view.locator('[data-weekly-review-classes]')).toContainText('2B');
  expect(result.snapshot).toBe(result.after);
  const saved=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    return JSON.stringify(await loadState());
  });
  expect(saved).toBe(result.snapshot);
});
