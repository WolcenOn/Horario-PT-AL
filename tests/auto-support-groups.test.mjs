import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeAutomaticSupportGroups } from '../js/auto-support-groups.js';
import { buildWeeklyPreviewRequest } from '../js/weekly-preview-adapter.js';

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

test('no combina distintos docentes, clases, cursos o prohibiciones de extracción',()=>{
  const base=item('one',90);
  for(const different of [
    item('two',45,{teacherId:'another'}),
    item('two',45,{person:{id:'two',curso:'2º',grupoClase:'1ºA'}}),
    item('two',45,{person:{id:'two',curso:'1º',grupoClase:'1ºB'}}),
    item('two',45,{policy:{blocked_subjects:['Matemáticas']}}),
    item('two',45,{service:'AL'})
  ]) assert.equal(proposeAutomaticSupportGroups([base,different]).length,0);
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
  assert.ok(result.warnings.some(w=>w.includes('agrupación(es) PT/AL propuestas')));

  const withoutGrouping=buildWeeklyPreviewRequest(
    data,data.centerPlanningSettings,{autoFormGroups:false}
  );
  assert.equal(withoutGrouping.autoGroups,0);
  assert.equal(withoutGrouping.payload.group_supports.length,0);
  assert.equal(withoutGrouping.payload.supports.length,2);
  assert.deepEqual(withoutGrouping.payload.supports.map(s=>s.weekly_minutes),[90,45]);
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
