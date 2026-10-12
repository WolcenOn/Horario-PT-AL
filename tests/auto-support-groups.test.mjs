import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAutomaticSupportGroups } from '../js/auto-support-groups.js';
import { buildWeeklyPreviewRequest } from '../js/weekly-preview-adapter.js';
import { requestWeeklyPreviewWithFallback } from '../js/weekly-preview-client.js';

function item(id, minutes, overrides={}) {
  return {
    person:{id,curso:'1º',grupoClase:'1ºA'},
    key:id+'|PT',service:'PT',teacherId:'pt-specialist',
    remaining:minutes,policy:{blocked_subjects:['Lengua']},
    ...overrides
  };
}
const allDays=Object.fromEntries(['lunes','martes','miercoles','jueves','viernes'].map(d=>[
  d,[{inicio:'09:00',fin:'12:00'}]
]));
const planning={
  mode:'global',
  generation:{start:'09:00',end:'12:00',lessonMinutes:45,maxSameSubjectPerDay:2},
  curriculum:{'1º':{Matemáticas:90}},
  subjectPatterns:{'1º':{Matemáticas:{sessionMinutes:45,minSessionMinutes:45,maxSessionMinutes:45}}}
};
function state() {
  return {
    schoolSettings:{
      structure:{configured:true,defaultLines:1,courseLines:{}},
      recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
    },
    centerPlanningSettings:structuredClone(planning),
    professionals:[
      {id:'math-teacher',activo:true,tipo:'DOCENTE',disponibilidad:allDays,
       teachingAssignments:[{grupoClase:'1ºA',materia:'Matemáticas'}]},
      {id:'pt-specialist',activo:true,tipo:'PT',disponibilidad:allDays}
    ],
    groups:[
      {id:'assigned-a',tipo:'PT',professionalId:'pt-specialist',studentIds:['student-A']},
      {id:'assigned-b',tipo:'PT',professionalId:'pt-specialist',studentIds:['student-B']}
    ],
    students:[
      {id:'student-A',curso:'1º',grupoClase:'1ºA',activo:true,horasPTObjetivoMin:90, nombre:'Nombre A'},
      {id:'student-B',curso:'1º',grupoClase:'1ºA',activo:true,horasPTObjetivoMin:45, nombre:'Nombre B'}
    ],
    sessions:[]
  };
}

test('forma una propuesta entre dos grupos individuales compatibles',()=>{
  const candidates=[item('one',90),item('two',45)];
  const groups=proposeAutomaticSupportGroups(candidates);
  assert.equal(groups.length,1);
  assert.equal(groups[0].sessionMinutes,45);
  assert.deepEqual(groups[0].members.map(x=>x.remaining),[90,45]);
  assert.equal(candidates.length,2);
});

test('no combina distintos docentes, cursos ni prohibiciones de extracción',()=>{
  const base=item('one',90);
  for(const different of [
    item('two',45,{teacherId:'another'}),
    item('two',45,{person:{id:'two',curso:'2º',grupoClase:'1ºA'}}),
    item('two',45,{policy:{blocked_subjects:['Matemáticas']}}),
    item('two',45,{service:'AL'})
  ]) assert.equal(proposeAutomaticSupportGroups([base,different]).length,0);
});

test('permite dos clases del mismo curso manteniendo restricciones personales',()=>{
  const a=item('first',90);
  const b=item('second',45,{person:{id:'second',curso:'1º',grupoClase:'1ºB'}});
  const selected=proposeAutomaticSupportGroups([a,b]);
  assert.equal(selected.length,1);
  assert.deepEqual(selected[0].members.map(member=>member.person.grupoClase),['1ºA','1ºB']);
  assert.equal(selected[0].sessionMinutes,45);
});

test('nunca se propone un bloque que sobrepasa objetivos o límites del piloto',()=>{
  assert.equal(proposeAutomaticSupportGroups([item('one',975),item('two',45)]).length,0);
  const crowded=Array.from({length:9},(_,i)=>item('student-'+i,45));
  const groups=proposeAutomaticSupportGroups(crowded);
  assert.equal(groups.length,1);
  assert.equal(groups[0].members.length,8);
  assert.equal(proposeAutomaticSupportGroups([item('one',60),item('two',30)])[0].sessionMinutes,30);
});

test('la vista previa agrupa PT de 90 y 45 sin almacenar ni enviar alumnos',()=>{
  const data=state();
  const original=JSON.stringify(data);
  const result=buildWeeklyPreviewRequest(data);
  assert.equal(result.autoGroups,1);
  assert.equal(result.payload.group_supports.length,1);
  assert.equal(result.payload.supports.length,0);
  const proposal=result.payload.group_supports[0];
  assert.equal(proposal.session_minutes,45);
  assert.equal(proposal.teacher_id,'pt-specialist');
  assert.deepEqual(proposal.participants.map(p=>p.weekly_minutes),[90,45]);
  const serialized=JSON.stringify(result.payload);
  for(const secret of ['student-A','student-B','Nombre A','Nombre B']){
    assert.equal(serialized.includes(secret),false);
  }
  assert.equal(JSON.stringify(data),original);
  assert.ok(result.warnings.some(w=>w.includes('agrupación(es) PT/AL temporales')));

  const withoutGrouping=buildWeeklyPreviewRequest(
    data,data.centerPlanningSettings,{autoFormGroups:false}
  );
  assert.equal(withoutGrouping.autoGroups,0);
  assert.equal(withoutGrouping.payload.group_supports.length,0);
  assert.equal(withoutGrouping.payload.supports.length,2);
  assert.deepEqual(withoutGrouping.payload.supports.map(s=>s.weekly_minutes),[90,45]);
});

test('agrupa entre clases de 1º sin enviar datos identificativos de menores',()=>{
  const data=state();
  data.schoolSettings.structure.courseLines={'1º':2};
  data.professionals[0].teachingAssignments.push({grupoClase:'1ºB',materia:'Matemáticas'});
  data.students[1].grupoClase='1ºB';
  const report=buildWeeklyPreviewRequest(data);
  assert.equal(report.autoGroups,1);
  assert.deepEqual(
    report.payload.group_supports[0].participants.map(person=>person.group_id),
    ['1ºA','1ºB']
  );
  const wire=JSON.stringify(report.payload);
  for(const secret of ['student-A','student-B','Nombre A','Nombre B']){
    assert.equal(wire.includes(secret),false);
  }
  assert.deepEqual(report.payload.lessons.map(item=>item.group_id),['1ºA','1ºB']);
});

test('no fusiona objetivos de cursos diferentes aunque compartan profesional',()=>{
  const data=state();
  data.students[1].curso='2º';
  const preview=buildWeeklyPreviewRequest(data);
  assert.equal(preview.autoGroups,0);
  assert.equal(preview.payload.supports.length,2);
});

test('resta sesiones existentes antes de evaluar la agrupación',()=>{
  const data=state();
  data.students[0].horasPTObjetivoMin=135;
  data.sessions=[{
    id:'existing',groupId:'assigned-a',professionalId:'pt-specialist',
    dia:'lunes',inicio:'09:00',fin:'09:45'
  }];
  const preview=buildWeeklyPreviewRequest(data);
  assert.equal(preview.autoGroups,1);
  assert.deepEqual(preview.payload.group_supports[0].participants.map(p=>p.weekly_minutes),[90,45]);
  assert.ok(preview.payload.busy.some(b=>b.teacher_id==='pt-specialist'&&b.weekday===0&&b.start_time==='09:00'));
});


test('reintenta por separado cuando la agrupación opcional es inviable',async()=>{
  const data=state();
  let calls=0;
  const sent=[];
  const fakeBackend={schoolId:'pilot'};
  const send=async(backend,payload)=>{
    assert.equal(backend,fakeBackend);
    sent.push(payload);
    calls++;
    return calls===1
      ? {status:'infeasible',preview_only:true,reasons:['group constraint']}
      : {status:'feasible',preview_only:true,lessons:[],supports:[],group_supports:[]};
  };
  const result=await requestWeeklyPreviewWithFallback(data,fakeBackend,send);
  assert.equal(calls,2);
  assert.equal(sent[0].group_supports.length,1);
  assert.equal(sent[0].supports.length,0);
  assert.equal(sent[1].group_supports.length,0);
  assert.equal(sent[1].supports.length,2);
  assert.equal(result.result.status,'feasible');
  assert.equal(result.groupingFallback,true);
  assert.ok(result.warnings.some(w=>w.includes('se ha vuelto a calcular')));
  for(const request of sent){
    for(const forbidden of ['student-A','student-B','Nombre A','Nombre B']){
      assert.equal(JSON.stringify(request).includes(forbidden),false);
    }
  }
});

test('no reintenta si la propuesta es factible o la búsqueda es inconclusa',async()=>{
  const data=state();
  for(const status of ['feasible','unknown']){
    let calls=0;
    const result=await requestWeeklyPreviewWithFallback(data,{},async()=>{
      calls++;
      return {status,preview_only:true,lessons:[],supports:[],group_supports:[]};
    });
    assert.equal(calls,1);
    assert.equal(result.groupingFallback,false);
    assert.equal(result.result.status,status);
  }
});

test('rechaza una respuesta que no garantiza solo vista previa',async()=>{
  await assert.rejects(
    ()=>requestWeeklyPreviewWithFallback(state(),{},async()=>({status:'feasible'})),
    /vista previa/
  );
});


test('no agrupa automáticamente alumnos asignados a salas de apoyo incompatibles',()=>{
  const people=[
    item('one',90,{roomId:'ROOM-PT-1'}),
    item('two',45,{roomId:'ROOM-PT-2'})
  ];
  assert.equal(proposeAutomaticSupportGroups(people).length,0);
  people[1].roomId='ROOM-PT-1';
  assert.equal(proposeAutomaticSupportGroups(people).length,1);
});

test('las salas de los grupos originales preservan agrupaciones separadas',()=>{
  const data=state();
  data.groups[0].roomId='ROOM-1';
  data.groups[1].roomId='ROOM-2';
  const withoutSharedRoom=buildWeeklyPreviewRequest(data);
  assert.equal(withoutSharedRoom.autoGroups,0);
  assert.deepEqual(
    withoutSharedRoom.payload.supports.map(entry=>entry.room_id),
    ['ROOM-1','ROOM-2']
  );
  data.groups[1].roomId='ROOM-1';
  const combined=buildWeeklyPreviewRequest(data);
  assert.equal(combined.autoGroups,1);
  assert.equal(combined.payload.group_supports[0].room_id,'ROOM-1');
  assert.equal(combined.payload.group_supports[0].location_id,'room:ROOM-1');
});
