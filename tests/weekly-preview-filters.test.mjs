import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyPreviewCalendar} from '../js/weekly-preview-calendar.js';
import {
  filterWeeklyPreviewCalendar,weeklyPreviewFilterOptions
} from '../js/weekly-preview-filters.js';

const setup=()=>{
  const state={
    professionals:[{id:'T1',nombre:'Docente Alfa'},{id:'T2',nombre:'Docente Beta'},
      {id:'PT1',nombre:'Especialista PT'}],
    students:[
      {id:'private-one',nombre:'Oculto Uno',grupoClase:'1A'},
      {id:'private-two',nombre:'Oculto Dos',grupoClase:'2B'}
    ],
    groups:[{id:'fixed-pt',tipo:'PT',professionalId:'PT1',
      studentIds:['private-one','private-two'],roomId:'Aula PT'}],
    sessions:[{groupId:'fixed-pt',dia:'jueves',inicio:'10:00',fin:'10:45'}],
    classSchedules:[
      {grupoClase:'1A',materia:'MAT',dia:'lunes',inicio:'09:00',
        fin:'10:00',professionalId:'T1',aula:'Aula 1'},
      {grupoClase:'2B',materia:'ING',dia:'martes',inicio:'09:00',
        fin:'09:45',professionalId:'T2',aula:'Aula 2'}
    ]
  };
  const payload={
    lessons:[
      {group_id:'1A',subject_id:'MAT',teacher_id:'T1',room_id:'Aula 1'},
      {group_id:'2B',subject_id:'ING',teacher_id:'T2',room_id:'Aula 2'}
    ],
    supports:[{request_id:'support-1',teacher_id:'PT1',
      group_id:'1A',pupil_token:'opaque-support-token'}],
    group_supports:[{request_id:'group-support-1',teacher_id:'PT1',
      participants:[
        {group_id:'1A',pupil_token:'private-pupil-a'},
        {group_id:'2B',pupil_token:'private-pupil-b'}
      ]}]
  };
  const result={preview_only:true,status:'feasible',
    lessons:[
      {group_id:'1A',subject_id:'MAT',teacher_id:'T1',
        weekday:0,start_time:'09:00',end_time:'10:00'},
      {group_id:'2B',subject_id:'ING',teacher_id:'T2',
        weekday:1,start_time:'10:00',end_time:'10:45'}
    ],
    supports:[{request_id:'support-1',service:'PT',weekday:0,
      start_time:'10:00',end_time:'10:30',room_id:'Aula PT'}],
    group_supports:[{request_id:'group-support-1',service:'PT',weekday:2,
      start_time:'11:00',end_time:'11:45',room_id:'Aula PT',participant_count:2}]
  };
  return {state,payload,result};
};

const blocks=projection=>projection.days.flatMap(day=>[...day.current,...day.proposed]);
test('el selector deriva opciones reales y nombres del personal sin datos de menores',()=>{
  const {state,payload,result}=setup();
  const projection=buildWeeklyPreviewCalendar(state,result,payload);
  assert.deepEqual(weeklyPreviewFilterOptions(projection),{
    classes:['1A','2B'],
    teachers:[
      {id:'T1',label:'Docente Alfa'},
      {id:'T2',label:'Docente Beta'},
      {id:'PT1',label:'Especialista PT'}
    ],
    rooms:['Aula 1','Aula 2','Aula PT']
  });
  const serialized=JSON.stringify(projection);
  for(const hidden of [
    'private-one','private-two','Oculto Uno','Oculto Dos',
    'opaque-support-token','private-pupil-a','private-pupil-b'
  ])assert.ok(!serialized.includes(hidden),hidden);
});

test('filtrar clase incluye apoyos compartidos con esa clase sin mostrar alumnos',()=>{
  const {state,payload,result}=setup();
  const original=buildWeeklyPreviewCalendar(state,result,payload);
  const selected=filterWeeklyPreviewCalendar(original,{classGroup:'2B'});
  assert.equal(selected.counts.ordinaryCurrent,1);
  assert.equal(selected.counts.ordinaryProposed,1);
  assert.equal(selected.counts.fixedSupports,1);
  assert.equal(selected.counts.additionalSupports,1);
  assert.equal(selected.comparison.classes.length,1);
  assert.equal(selected.comparison.classes[0].group,'2B');
  assert.equal(selected.comparison.classes[0].currentMinutes,45);
  assert.equal(selected.comparison.classes[0].proposedMinutes,45);
  assert.equal(selected.comparison.supports[0].fixedMinutes,45);
  assert.equal(selected.comparison.supports[0].additionalMinutes,45);
  assert.ok(blocks(selected).every(x=>x.classGroups.includes('2B')));
  assert.equal(original.comparison.classes.length,2);
});

test('filtrar docente recupera las sesiones PT desde el payload sin atribuciones inciertas',()=>{
  const {state,payload,result}=setup();
  const projection=buildWeeklyPreviewCalendar(state,result,payload);
  const own=filterWeeklyPreviewCalendar(projection,{teacherId:'PT1'});
  assert.equal(own.counts.ordinaryProposed,0);
  assert.equal(own.counts.fixedSupports,1);
  assert.equal(own.counts.additionalSupports,2);
  assert.equal(own.comparison.supports[0].totalMinutes,120);
  assert.ok(blocks(own).every(x=>x.teacherId==='PT1'));
});

test('filtrar sala y combinar filtros recalcula siempre cifras visibles',()=>{
  const {state,payload,result}=setup();
  const projection=buildWeeklyPreviewCalendar(state,result,payload);
  const room=filterWeeklyPreviewCalendar(projection,{room:'Aula PT'});
  assert.equal(room.counts.ordinaryCurrent,0);
  assert.equal(room.counts.additionalSupports,2);
  assert.equal(room.comparison.supports[0].additionalMinutes,75);
  const combined=filterWeeklyPreviewCalendar(projection,{
    classGroup:'2B',teacherId:'PT1',room:'Aula PT'
  });
  assert.equal(combined.counts.fixedSupports,1);
  assert.equal(combined.counts.additionalSupports,1);
  assert.equal(combined.comparison.supports[0].totalMinutes,90);
  assert.ok(blocks(combined).every(x=>x.room==='Aula PT'));
});

test('filtros sobre referencias inexistentes muestran cero sin inventar sesiones',()=>{
  const {state,payload,result}=setup();
  const projection=buildWeeklyPreviewCalendar(state,result,payload);
  const unknown=filterWeeklyPreviewCalendar(projection,{teacherId:'inexistente'});
  assert.equal(unknown.visible.current,0);
  assert.equal(unknown.visible.proposed,0);
  assert.equal(unknown.comparison.changes.added,0);
  assert.deepEqual(unknown.comparison.classes,[]);
});

test('sin payload de apoyos no se atribuye docente ni clase a una sesión propuesta',()=>{
  const {state,result}=setup();
  const projection=buildWeeklyPreviewCalendar(state,result);
  const selected=filterWeeklyPreviewCalendar(projection,{teacherId:'PT1'});
  assert.equal(selected.counts.additionalSupports,0);
  assert.equal(selected.counts.fixedSupports,1);
  assert.ok(projection.days.flatMap(day=>day.proposed)
    .some(x=>x.kind==='PT'&&x.source==='proposed'&&!x.teacherId));
});

test('la comparación filtrada es pura; reiniciar filtros devuelve el total sin persistir',()=>{
  const {state,payload,result}=setup();
  const before=JSON.stringify({state,payload,result});
  const p=buildWeeklyPreviewCalendar(state,result,payload);
  const snapshot=JSON.stringify(p);
  const first=filterWeeklyPreviewCalendar(p,{classGroup:'1A'});
  assert.equal(first.comparison.classes.length,1);
  const again=filterWeeklyPreviewCalendar(p,{});
  assert.equal(again.counts.ordinaryProposed,2);
  assert.equal(JSON.stringify(p),snapshot);
  assert.equal(JSON.stringify({state,payload,result}),before);
});
