import {test,expect} from '@playwright/test';

test('del calendario se prepara un cálculo conjunto sin llamar al backend ni alterar ausencias',async({page})=>{
  const calls=[];
  page.on('request',req=>{
    if(req.url().includes('/schools/')&&req.method()!=='GET')
      calls.push(req.url());
  });
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  const date=await page.evaluate(async()=>{
    const {put}=await import('/js/db.js');
    const now=new Date(),year=now.getFullYear(),month=now.getMonth();
    const first=new Date(year,month,1);
    const shift=(8-first.getDay())%7;
    const day=new Date(year,month,1+shift);
    const iso=String(day.getFullYear())+'-'+String(day.getMonth()+1).padStart(2,'0')+
      '-'+String(day.getDate()).padStart(2,'0');
    await put('professionals',{id:'t1',nombre:'Docente 1',tipo:'DOCENTE',activo:true});
    await put('professionals',{id:'t2',nombre:'Docente 2',tipo:'DOCENTE',activo:true});
    await put('classSchedules',{id:'c1',grupoClase:'1A',materia:'MAT',
      professionalId:'t1',dia:'lunes',inicio:'09:00',fin:'09:45'});
    await put('classSchedules',{id:'c2',grupoClase:'2A',materia:'ING',
      professionalId:'t2',dia:'lunes',inicio:'09:00',fin:'09:45'});
    for(const [id,teacher] of [['a1','t1'],['a2','t2']])
      await put('staffAbsences',{id,professionalId:teacher,fromDate:iso,toDate:iso,
        startTime:'',endTime:'',status:'pending',resolvedAt:''});
    return iso;
  });
  await page.reload();
  await page.locator('[data-view="staffAbsences"]').click();
  await page.locator('[data-absence-day="'+date+'"]').click();
  await expect(page.locator('[data-absence-entry]')).toHaveCount(2);
  await page.locator('[data-absence-prepare-joint]').click();
  await expect(page.locator('[data-joint-absence-panel]')).toBeVisible();
  await expect(page.locator('#pageTitle')).toHaveText('Operativa diaria');
  await expect(page.locator('[data-joint-absence-count]')).toContainText('Ausencias en la fecha: 2');
  await expect(page.locator('[data-joint-absence-table] tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-joint-absence-solve]')).toBeDisabled();
  await expect(page.locator('[data-joint-absence-table]')).toContainText('Sin cálculo');
  const data=await page.evaluate(async()=>{
    const {getAll}=await import('/js/db.js');
    return {absences:await getAll('staffAbsences'),
      schedules:await getAll('classSchedules')};
  });
  expect(data.absences).toHaveLength(2);
  expect(data.absences.every(x=>x.status==='pending')).toBe(true);
  expect(data.schedules).toHaveLength(2);
  expect(calls).toEqual([]);
});

test('la vista de evaluación conjunta muestra faltas y PT/AL sin fingir resolución',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {renderJointAbsencePanel}=await import('/js/joint-absence-view.js');
    const {buildJointAbsenceRequest,assessJointAbsenceResult}
      =await import('/js/joint-absence-coverage.js');
    const state={
      professionals:[{id:'T1',nombre:'Docente Uno'},{id:'PT1',nombre:'Especialista PT'}],
      staffAbsences:[
        {id:'a',professionalId:'T1',fromDate:'2026-10-12',toDate:'2026-10-12',
          status:'pending',resolvedAt:'',startTime:'',endTime:''},
        {id:'b',professionalId:'PT1',fromDate:'2026-10-12',toDate:'2026-10-12',
          status:'pending',resolvedAt:'',startTime:'',endTime:''}
      ]
    };
    const adapter={report:{
      mappings:{teachers:{T1:'BT1',PT1:'BPT'}},
      slots:[{id:'S1',start:'09:00',end:'09:45'}]
    },configuration:{activities:[
      {id:'lesson',weekday:0,slot_id:'S1',teacher_id:'BT1',
        activity_type:'CLASS',group_id:'1A'},
      {id:'support',weekday:0,slot_id:'S1',teacher_id:'BPT',
        activity_type:'PT',group_id:'1A'}
    ]}};
    const plan=buildJointAbsenceRequest(state,adapter,'2026-10-12');
    const result={payload:{solution:{
      substitutions:[],uncovered:[{
        activity_id:'lesson',slot_id:'S1',absent_teacher_id:'BT1'
      }]
    }}};
    const assessment=assessJointAbsenceResult(plan,result);
    const fixture=document.createElement('div');
    fixture.id='joint-fixture';
    fixture.innerHTML=renderJointAbsencePanel({
      date:'2026-10-12',plan,assessment,result,state,connected:false
    });
    document.body.append(fixture);
  });
  const node=page.locator('#joint-fixture');
  await expect(node.locator('[data-joint-assessment]')).toContainText('Revisión incompleta');
  await expect(node.locator('[data-joint-absence-row="a"]')).toContainText('sin cubrir');
  await expect(node.locator('[data-joint-absence-row="b"]')).toContainText('1 sin verificar');
  await expect(node.locator('[data-joint-assessment]')).toContainText('NO certifica los apoyos PT/AL');
  await expect(node.locator('[data-joint-absence-solve]')).toBeDisabled();
});


test('la vista PT/AL solo presenta propuesta especializada sin marcar ausencia resuelta',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  const before=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const original=JSON.stringify(await loadState());
    const {renderJointAbsencePanel}=await import('/js/joint-absence-view.js');
    const {buildJointAbsenceRequest,assessJointAbsenceResult}
      =await import('/js/joint-absence-coverage.js');
    const state={
      professionals:[{id:'pt-absent',nombre:'Profesional PT'}],
      students:[{id:'private-child',nombre:'Nombre oculto'}],
      staffAbsences:[{
        id:'absence1',professionalId:'pt-absent',
        fromDate:'2026-10-12',toDate:'2026-10-12',
        startTime:'',endTime:'',status:'pending',resolvedAt:''
      }]
    };
    const adapter={
      report:{mappings:{teachers:{'pt-absent':'BACKEND-PT'}},
        slots:[{id:'S1',start:'09:00',end:'09:45',label:'09:00–09:45'}]},
      configuration:{
        groups:[],teachers:[
          {id:'PT-SUB',specialties:['PT'],can_cover_groups:[]}
        ],
        activities:[{
          id:'SUPPORT-PT',weekday:0,slot_id:'S1',teacher_id:'BACKEND-PT',
          activity_type:'PT',group_id:null
        }]
      }
    };
    const plan=buildJointAbsenceRequest(state,adapter,'2026-10-12');
    const solution={payload:{solution:{
      substitutions:[{
        activity_id:'SUPPORT-PT',slot_id:'S1',
        absent_teacher_id:'BACKEND-PT',substitute_teacher_id:'PT-SUB'
      }],uncovered:[]
    }}};
    const assessment=assessJointAbsenceResult(plan,solution);
    const fixture=document.createElement('div');
    fixture.id='joint-pt-fixture';
    fixture.innerHTML=renderJointAbsencePanel({
      date:'2026-10-12',plan,assessment,state,adapter,
      connected:false,adapterReady:true
    });
    document.body.append(fixture);
    return original;
  });
  const root=page.locator('#joint-pt-fixture');
  await expect(root.locator('[data-joint-absence-solve]')).toBeDisabled();
  await expect(root.locator('[data-joint-assessment]')).toContainText('1 con especialista propuesto');
  await expect(root.locator('[data-joint-coverage-details]')).toContainText('Apoyo PT');
  await expect(root.locator('[data-joint-coverage-details]')).toContainText('PT-SUB');
  await expect(root.locator('[data-joint-coverage-details]')).toContainText('Apoyo sin grupo único');
  await expect(root.locator('[data-joint-absence-row="absence1"]')).toContainText('Pendiente');
  await expect(root).not.toContainText('Nombre oculto');
  await expect(root).not.toContainText('private-child');
  const after=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    return JSON.stringify(await loadState());
  });
  expect(after).toBe(before);
});


test('la sesión PT mixta y su aforo se revisan de principio a fin sin guardar cambios',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  const original=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    const before=JSON.stringify(await loadState());
    const {buildGestorEscuelaConfiguration}=await import('/js/gestor-adapter.js');
    const {buildJointAbsenceRequest,assessJointAbsenceResult}
      =await import('/js/joint-absence-coverage.js');
    const {renderJointAbsencePanel}=await import('/js/joint-absence-view.js');
    const availability=Object.fromEntries(
      ['lunes','martes','miercoles','jueves','viernes'].map(day=>
        [day,[{inicio:'09:00',fin:'13:00'}]]));
    const state={
      professionals:[
        {id:'abs',nombre:'Profesional PT',tipo:'PT',activo:true,
          disponibilidad:availability},
        {id:'sub',nombre:'Especialista disponible',tipo:'PT',activo:true,
          disponibilidad:availability},
        {id:'ordinary',nombre:'Tutor',tipo:'DOCENTE',activo:true,
          disponibilidad:availability}
      ],
      students:[
        {id:'secret-A',nombre:'Pupil Secret A',grupoClase:'1ºA',activo:true},
        {id:'secret-B',nombre:'Pupil Secret B',grupoClase:'2ºA',activo:true}
      ],
      groups:[{id:'ptg',nombre:'Grupo de apoyo',tipo:'PT',activo:true,
        professionalId:'abs',studentIds:['secret-A','secret-B'],roomId:'SALA-1'}],
      sessions:[{id:'sespt',groupId:'ptg',professionalId:'abs',dia:'lunes',
        inicio:'09:00',fin:'10:00'}],
      classSchedules:[{id:'cls',grupoClase:'1ºA',materia:'Matemáticas',
        professionalId:'ordinary',dia:'lunes',inicio:'09:30',fin:'10:00'}],
      staffAbsences:[{id:'abs1',professionalId:'abs',fromDate:'2026-10-12',
        toDate:'2026-10-12',startTime:'',endTime:'',status:'pending',resolvedAt:''}],
      schoolSettings:{structure:{configured:false}},
      centerPlanningSettings:{generation:{start:'09:00',end:'13:00',
        roomResources:[{roomId:'SALA-1',capacity:1,
          windows:[{weekday:0,startTime:'09:00',endTime:'13:00'}]}]}}
    };
    const adapter=buildGestorEscuelaConfiguration(state);
    const plan=buildJointAbsenceRequest(state,adapter,'2026-10-12');
    const substitute=adapter.report.mappings.teachers.sub;
    const session=plan.supportSessions[0];
    const result={payload:{solution:{
      substitutions:session.slots.map(slot=>({
        activity_id:slot.activityId,slot_id:slot.slotId,
        absent_teacher_id:session.teacherId,substitute_teacher_id:substitute
      })),uncovered:[]
    }}};
    const assessment=assessJointAbsenceResult(plan,result);
    const holder=document.createElement('div');holder.id='full-session-fixture';
    holder.innerHTML=renderJointAbsencePanel({
      date:'2026-10-12',plan,assessment,state,adapter,connected:false
    });
    document.body.append(holder);
    return before;
  });
  const node=page.locator('#full-session-fixture');
  await expect(node.locator('[data-joint-absence-solve]')).toBeDisabled();
  await expect(node.locator('[data-joint-session-table] tbody tr')).toHaveCount(1);
  await expect(node.locator('[data-joint-session-table]')).toContainText('09:00–10:00');
  await expect(node.locator('[data-joint-session-table]')).toContainText('2 asistente(s)');
  await expect(node.locator('[data-joint-session-table]')).toContainText('2 clases de origen');
  await expect(node.locator('[data-joint-session-table]')).toContainText('supera el aforo');
  await expect(node.locator('[data-joint-assessment]')).toContainText('Revisión incompleta');
  await expect(node).not.toContainText('Pupil Secret');
  await expect(node).not.toContainText('secret-A');
  const after=await page.evaluate(async()=>{
    const {loadState}=await import('/js/repository.js');
    return JSON.stringify(await loadState());
  });
  expect(after).toBe(original);
});
