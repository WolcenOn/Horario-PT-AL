import {test,expect} from '@playwright/test';

test('calendario global registra varias ausencias y muestra cobertura pendiente o confirmada manualmente',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'p1',nombre:'Docente de clase',tipo:'DOCENTE',activo:true});
    await put('professionals',{id:'p2',nombre:'Especialista PT',tipo:'PT',activo:true});
    await put('classSchedules',{id:'c1',grupoClase:'1ºA',materia:'Matemáticas',
      professionalId:'p1',dia:'lunes',inicio:'09:00',fin:'10:00'});
  });
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  await expect(page.locator('[data-staff-absences-view]')).toBeVisible();
  expect([35,42]).toContain(await page.locator('[data-absence-calendar] .absence-day').count());
  const initial=await page.evaluate(()=>{
    const now=new Date();
    return String(now.getFullYear())+'-'+String(now.getMonth()+1).padStart(2,'0');
  });
  const date=initial+'-12';
  const form=page.locator('#staffAbsenceForm');
  await form.locator('input[value="p1"]').check();
  await form.locator('input[value="p2"]').check();
  await form.locator('[name="fromDate"]').fill(date);
  await form.locator('[name="toDate"]').fill(date);
  await form.getByRole('button',{name:'Guardar ausencias'}).click();
  await expect(page.locator('[data-absence-entry]')).toHaveCount(2);
  await expect(page.locator('[data-absence-summary]')).toContainText('Sin resolver: 2');
  const saved=await page.evaluate(async()=>{
    const {getAll}=await import('/js/db.js');
    const {loadState}=await import('/js/repository.js');
    const records=await getAll('staffAbsences');
    const state=await loadState();
    return {records,teacherCount:state.professionals.length,classSchedules:state.classSchedules};
  });
  expect(saved.records).toHaveLength(2);
  expect(saved.records.every(x=>x.status==='pending')).toBe(true);
  expect(saved.teacherCount).toBe(2);
  expect(saved.classSchedules).toHaveLength(1);
  const selectDay=page.locator('[data-absence-day="'+date+'"]');
  await selectDay.click();
  await expect(page.locator('[data-absence-entries] [data-absence-entry]')).toHaveCount(2);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-absence-resolve]').first().click();
  await expect(page.locator('[data-absence-summary]')).toContainText('Sin resolver: 1');
  await expect(page.locator('[data-absence-summary]')).toContainText('Resueltas manualmente: 1');
  await page.locator('[data-absence-filter]').selectOption('pending');
  await expect(page.locator('[data-absence-entry]')).toHaveCount(1);
  await page.locator('[data-absence-filter]').selectOption('all');
  await expect(page.locator('[data-absence-entry]')).toHaveCount(2);
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  await expect(page.locator('[data-absence-summary]')).toContainText('Resueltas manualmente: 1');
  const packageResult=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const {createSharePackage,validateSharePackage}=await import('/js/sharing.js');
    const pack=createSharePackage(await loadState());
    return {schema:pack.schemaVersion,count:validateSharePackage(pack).staffAbsences.length};
  });
  expect(packageResult).toEqual({schema:6,count:2});
});

test('calendario rechaza fechas o solapes y no modifica el horario base',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'test-prof',nombre:'Profesor',tipo:'DOCENTE',activo:true});
  });
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  const month=await page.evaluate(()=>{
    const now=new Date();
    return String(now.getFullYear())+'-'+String(now.getMonth()+1).padStart(2,'0');
  });
  const form=page.locator('#staffAbsenceForm');
  await form.locator('input[value="test-prof"]').check();
  await form.locator('[name="fromDate"]').fill(month+'-10');
  await form.locator('[name="toDate"]').fill(month+'-10');
  await form.locator('[name="startTime"]').fill('09:00');
  await form.locator('[name="endTime"]').fill('11:00');
  await form.getByRole('button',{name:'Guardar ausencias'}).click();
  await expect(page.locator('[data-absence-entry]')).toHaveCount(1);
  await form.locator('input[value="test-prof"]').check();
  await form.locator('[name="fromDate"]').fill(month+'-10');
  await form.locator('[name="toDate"]').fill(month+'-10');
  await form.getByRole('button',{name:'Guardar ausencias'}).click();
  await expect(page.locator('[data-absence-entry]')).toHaveCount(1);
  const data=await page.evaluate(async()=>{
    const {getAll}=await import('/js/db.js');
    return {
      absent:await getAll('staffAbsences'),
      professionals:await getAll('professionals'),
      lessons:await getAll('classSchedules')
    };
  });
  expect(data.absent).toHaveLength(1);
  expect(data.professionals).toHaveLength(1);
  expect(data.lessons).toHaveLength(0);
});
