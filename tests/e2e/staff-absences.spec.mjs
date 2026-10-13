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
  await form.locator('[name="absenceMode"][value="manual"]').check();
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


test('calendario primero, dos docentes y franjas individuales: guardar y calcular conserva el registro offline',async({page})=>{
  const requests=[];
  page.on('request',r=>{
    if(r.method()!=='GET'&&r.url().includes('/schools/'))requests.push(r.url());
  });
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  const monday=await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'t1',nombre:'Tutora',tipo:'DOCENTE',activo:true});
    await put('professionals',{id:'t2',nombre:'Especialista PT',tipo:'PT',activo:true});
    await put('classSchedules',{id:'mat',professionalId:'t1',dia:'lunes',
      inicio:'09:00',fin:'10:00',grupoClase:'1A',materia:'MAT'});
    await put('classSchedules',{id:'art',professionalId:'t1',dia:'lunes',
      inicio:'11:00',fin:'11:45',grupoClase:'1A',materia:'ART'});
    await put('groups',{id:'gpt',tipo:'PT',professionalId:'t2',
      studentIds:[],activo:true});
    await put('sessions',{id:'support',groupId:'gpt',dia:'lunes',
      inicio:'09:30',fin:'10:15'});
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
    const day=new Date(first.getFullYear(),first.getMonth(),1+(8-first.getDay())%7);
    return String(day.getFullYear())+'-'+String(day.getMonth()+1).padStart(2,'0')+
      '-'+String(day.getDate()).padStart(2,'0');
  });
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  const calendar=page.locator('[data-absence-calendar]');
  const form=page.locator('#staffAbsenceForm');
  const before=await calendar.evaluate((el,a)=>{
    return el.compareDocumentPosition(document.querySelector(a));
  },'#staffAbsenceForm');
  // DOCUMENT_POSITION_FOLLOWING confirms calendar comes before the form.
  expect(before&4).toBe(4);
  await page.locator('[data-absence-day="'+monday+'"]').click();
  await expect(form.locator('[name="fromDate"]')).toHaveValue(monday);
  await expect(form.locator('[name="toDate"]')).toHaveValue(monday);
  await form.locator('input[value="t1"]').check();
  await form.locator('input[value="t2"]').check();
  await form.locator('[name="absenceMode"][value="schedule"]').check();
  await expect(form.locator('[data-planned-group="t1"] [data-planned-slot]')).toHaveCount(2);
  await expect(form.locator('[data-planned-group="t2"]')).toContainText('Apoyo PT');
  await form.locator('[data-planned-group="t1"] [data-planned-slot][value="class:mat"]').uncheck();
  await form.getByRole('button',{name:'Guardar y calcular cobertura'}).click();
  await expect(page.locator('[data-absence-entry]')).toHaveCount(2);
  await expect(page.locator('[data-joint-status]')).toContainText('Las ausencias están guardadas');
  const state=await page.evaluate(async()=>{
    const {getAll}=await import('/js/db.js');
    return {
      absences:await getAll('staffAbsences'),
      classSchedules:await getAll('classSchedules'),
      sessions:await getAll('sessions')
    };
  });
  expect(state.absences.map(x=>[x.professionalId,x.startTime,x.endTime]).sort())
    .toEqual([['t1','11:00','11:45'],['t2','09:30','10:15']]);
  expect(state.classSchedules).toHaveLength(2);
  expect(state.sessions).toHaveLength(1);
  expect(requests).toHaveLength(0);
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  await expect(page.locator('[data-absence-summary]')).toContainText('Sin resolver: 2');
});

test('una sola entrada de navegación abre calendario y no expone un segundo formulario',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await expect(page.locator('.nav-item[data-view="operations"]')).toHaveCount(0);
  await expect(page.locator('.nav-item[data-view="staffAbsences"]')).toHaveCount(1);
  await page.locator('[data-view="staffAbsences"]').click();
  await expect(page.locator('#staffAbsenceForm')).toHaveCount(1);
  await expect(page.locator('#absenceSolveForm')).toHaveCount(0);
  await expect(page.locator('[data-absence-calendar]')).toBeVisible();
});
