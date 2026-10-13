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
  await expect(node.locator('[data-joint-assessment]')).toContainText('Cobertura parcial');
  await expect(node.locator('[data-joint-absence-row="a"]')).toContainText('sin cubrir');
  await expect(node.locator('[data-joint-absence-row="b"]')).toContainText('pendiente de reorganizar');
  await expect(node.locator('[data-joint-assessment]')).toContainText('NO certifica los apoyos PT/AL');
  await expect(node.locator('[data-joint-absence-solve]')).toBeDisabled();
});
