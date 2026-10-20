import {test,expect} from '@playwright/test';

// The demo deliberately does not need a server or an account for local editing.
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
});

test('editar ficha conserva todos los tramos diarios, identidad y referencias',async({page})=>{
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{
      id:'prof-edit',nombre:'Profesora inicial',email:'inicial@centro.es',
      tipo:'PT',activo:true,especialidad:'Pedagogía Terapéutica',
      disponibilidadBase:{
        lunes:[{inicio:'09:00',fin:'10:30'},{inicio:'11:00',fin:'14:00'}],
        martes:[{inicio:'09:00',fin:'12:00'}]
      },
      disponibilidad:{
        lunes:[{inicio:'09:00',fin:'10:30'},{inicio:'11:00',fin:'14:00'}],
        martes:[{inicio:'09:00',fin:'12:00'}]
      },
      bloqueosExternos:{
        lunes:[{centro:'Colegio A',inicio:'09:30',fin:'10:00'},
          {centro:'Colegio B',inicio:'11:15',fin:'11:45'}]
      },
      allowedSubjects:['Lengua Castellana y Literatura'],
      specialtySubjects:['Lengua Castellana y Literatura'],
      responsibilities:[{tipo:'coordinacion',nombre:'Coordinación',weeklyMinutes:60}]
    });
    await put('groups',{id:'pt-edit',nombre:'Apoyo PT',tipo:'PT',professionalId:'prof-edit',
      studentIds:[],activo:true});
    await put('sessions',{id:'ses-edit',groupId:'pt-edit',professionalId:'prof-edit',
      dia:'lunes',inicio:'12:00',fin:'12:45'});
    await put('staffAbsences',{id:'absence-edit',professionalId:'prof-edit',
      fecha:'2026-11-03',startDate:'2026-11-03',endDate:'2026-11-03',
      status:'pending'});
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await expect(page.getByText('Para modificar cualquier ficha')).toBeVisible();
  await page.getByRole('button',{name:'Editar ficha de Profesora inicial'}).click();
  await expect(page.locator('#modalTitle')).toHaveText('Editar profesional');
  await expect(page.locator('[data-availability-day="lunes"] [data-availability-row]')).toHaveCount(2);
  await expect(page.locator('[data-external-day="lunes"] [data-external-row]')).toHaveCount(2);
  await page.locator('#modalForm [name="nombre"]').fill('Profesora actualizada');
  await page.locator('#modalForm [name="teacherEmail"]').fill('nuevo@centro.es');
  await page.locator('[data-availability-day="lunes"] [data-add-availability]').click();
  await expect(page.locator('[data-availability-day="lunes"] [data-availability-row]')).toHaveCount(3);
  const last=page.locator('[data-availability-day="lunes"] [data-availability-row]').last();
  await last.locator('[data-availability-start]').fill('15:00');
  await last.locator('[data-availability-end]').fill('16:00');
  await page.locator('#modalForm').getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#modalForm')).toHaveCount(0);
  const result=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return {
      teacher:await get('professionals','prof-edit'),
      group:await get('groups','pt-edit'),
      session:await get('sessions','ses-edit'),
      absence:await get('staffAbsences','absence-edit')
    };
  });
  expect(result.teacher.nombre).toBe('Profesora actualizada');
  expect(result.teacher.email).toBe('nuevo@centro.es');
  expect(result.teacher.disponibilidadBase.lunes).toEqual([
    {inicio:'09:00',fin:'10:30'},
    {inicio:'11:00',fin:'14:00'},
    {inicio:'15:00',fin:'16:00'}
  ]);
  expect(result.teacher.bloqueosExternos.lunes).toEqual([
    {centro:'Colegio A',inicio:'09:30',fin:'10:00'},
    {centro:'Colegio B',inicio:'11:15',fin:'11:45'}
  ]);
  expect(result.teacher.specialtySubjects).toEqual(['Lengua Castellana y Literatura']);
  expect(result.teacher.responsibilities[0].nombre).toBe('Coordinación');
  expect(result.group.professionalId).toBe('prof-edit');
  expect(result.session.professionalId).toBe('prof-edit');
  expect(result.absence.professionalId).toBe('prof-edit');
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await page.getByRole('button',{name:'Editar ficha de Profesora actualizada'}).click();
  await expect(page.locator('[data-availability-day="lunes"] [data-availability-row]')).toHaveCount(3);
  await expect(page.locator('[data-external-day="lunes"] [data-external-row]')).toHaveCount(2);
});

test('rechaza tramos incompletos o solapados sin alterar la ficha',async({page})=>{
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'invalid-edit',nombre:'Profesor sin cambios',
      tipo:'DOCENTE',activo:true,disponibilidadBase:{lunes:[{inicio:'09:00',fin:'14:00'}]}});
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await page.locator('[data-edit="invalid-edit"]').last().click();
  await page.locator('[data-availability-day="lunes"] [data-add-availability]').click();
  const row=page.locator('[data-availability-day="lunes"] [data-availability-row]').last();
  await row.locator('[data-availability-start]').fill('13:00');
  await row.locator('[data-availability-end]').fill('14:30');
  await page.locator('#modalForm').getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#modalMessage')).toContainText('solapadas');
  await expect(page.locator('#modalForm')).toBeVisible();
  const teacher=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return get('professionals','invalid-edit');
  });
  expect(teacher.disponibilidadBase.lunes).toHaveLength(1);
});

test('protege los cambios de otra pestaña y no sobreescribe la última versión',async({page})=>{
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'concurrent-edit',nombre:'Versión inicial',tipo:'DOCENTE',activo:true});
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await page.locator('[data-edit="concurrent-edit"]').last().click();
  await page.locator('#modalForm [name="nombre"]').fill('Cambio obsoleto');
  await page.evaluate(async()=>{
    const {get,put}=await import('/js/db.js');
    const item=await get('professionals','concurrent-edit');
    await put('professionals',{...item,nombre:'Actualizado por otra pestaña'});
  });
  await page.locator('#modalForm').getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#modalMessage')).toContainText('La ficha cambió en otra pestaña');
  await expect(page.locator('#modalForm')).toBeVisible();
  const name=await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return (await get('professionals','concurrent-edit')).nombre;
  });
  expect(name).toBe('Actualizado por otra pestaña');
});

test('no permite cambiar a DOCENTE un PT con grupos vinculados',async({page})=>{
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('professionals',{id:'type-edit',nombre:'PT con grupo',tipo:'PT',activo:true});
    await put('groups',{id:'pt-g',nombre:'PT',tipo:'PT',professionalId:'type-edit',studentIds:[]});
  });
  await page.reload();
  await page.locator('[data-view="professionals"]').click();
  await page.locator('[data-edit="type-edit"]').last().click();
  await page.locator('#modalForm [name="tipo"]').selectOption('DOCENTE');
  await page.locator('#modalForm').getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#modalMessage')).toContainText('Reasigna esos grupos antes de cambiar su tipo');
  expect(await page.evaluate(async()=>{
    const {get}=await import('/js/db.js');
    return (await get('professionals','type-edit')).tipo;
  })).toBe('PT');
});

test('alumnos, grupos, sesiones y horarios de aula permiten abrir edición',async({page})=>{
  await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    await put('students',{id:'edit-stu',nombre:'Alumno',apellidos:'Prueba',curso:'4º',
      grupoClase:'4ºA',horasPTObjetivoMin:45,horasALObjetivoMin:0,activo:true});
    await put('professionals',{id:'edit-prof',nombre:'Docente',tipo:'PT',activo:true});
    await put('groups',{id:'edit-grp',nombre:'Grupo PT',tipo:'PT',
      professionalId:'edit-prof',studentIds:['edit-stu'],activo:true});
    await put('sessions',{id:'edit-ses',groupId:'edit-grp',professionalId:'edit-prof',
      dia:'lunes',inicio:'09:00',fin:'09:45'});
    await put('classSchedules',{id:'edit-class',grupoClase:'4ºA',materia:'Lengua Castellana y Literatura',
      dia:'lunes',inicio:'09:00',fin:'09:45',professionalId:'edit-prof'});
  });
  await page.reload();
  for(const [view,id,title] of [
    ['students','edit-stu','Editar alumno'],
    ['groups','edit-grp','Editar grupo'],
    ['sessions','edit-ses','Editar sesión'],
    ['classSchedules','edit-class','Editar']
  ]){
    await page.locator(`[data-view="${view}"]`).click();
    const button=page.locator(`[data-edit="${id}"]`).first();
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.locator('#modalForm')).toBeVisible();
    await expect(page.locator('#modalTitle')).toContainText(title);
    await page.locator('#modalForm').getByRole('button',{name:'Cancelar'}).click();
  }
});
