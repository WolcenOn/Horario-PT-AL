import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyPreviewCalendar,renderWeeklyPreviewCalendar}
  from '../js/weekly-preview-calendar.js';
import {analyzeWeeklyPreviewAudit,renderWeeklyPreviewAudit}
  from '../js/weekly-preview-audit.js';
import {filterWeeklyPreviewCalendar} from '../js/weekly-preview-filters.js';

const lesson=(group,subject,start='09:00',end='09:45',weekday=0,teacher_id='T1')=>
  ({group_id:group,subject_id:subject,weekday,start_time:start,end_time:end,teacher_id});
const fixture=()=>{
  const state={
    classSchedules:[],sessions:[],groups:[],students:[],professionals:[],
    schoolSettings:{structure:{configured:false}},
    centerPlanningSettings:{mode:'global',curriculum:{}}
  };
  const payload={
    lessons:[{group_id:'1A',subject_id:'MAT',teacher_id:'T1',
      weekly_minutes:45,durations:[45]}],
    supports:[{request_id:'support-1',service:'PT',group_id:'1A',
      weekly_minutes:30,teacher_id:'PT1',pupil_token:'hidden-token'}],
    group_supports:[],rooms:[]
  };
  const result={
    status:'feasible',preview_only:true,
    lessons:[lesson('1A','MAT')],
    supports:[{request_id:'support-1',service:'PT',weekday:0,
      start_time:'10:00',end_time:'10:30',room_id:'PT-Sala'}],
    group_supports:[]
  };
  return {state,payload,result};
};
const inspect=({state,payload,result})=>
  buildWeeklyPreviewCalendar(state,result,payload);

test('verifica minutos exactos para demandas y apoyos individuales sin certificar el centro',()=>{
  const p=inspect(fixture());
  assert.equal(p.audit.summary.exactSubjects,1);
  assert.equal(p.audit.summary.requestedSubjects,1);
  assert.equal(p.audit.summary.exactIndividual,1);
  assert.equal(p.audit.summary.requestedIndividual,1);
  assert.equal(p.audit.state,'partial'); // room without capacity
  const html=renderWeeklyPreviewCalendar(p);
  assert.match(html,/Comprobación parcial/);
  assert.match(html,/Factible/iu); // "Factible" not equivalent to full curriculum
  assert.match(html,/PT\/AL/);
});

test('detecta faltas curriculares aunque el resultado se etiquete factible',()=>{
  const f=fixture();
  f.payload.lessons[0].weekly_minutes=90;
  const p=inspect(f);
  assert.equal(p.audit.state,'review');
  assert.deepEqual(p.audit.curriculum[0],{
    group:'1A',subject:'MAT',required:90,placed:45,missing:45,surplus:0
  });
  assert.match(renderWeeklyPreviewAudit(p.audit),/45 min/);
});

test('detecta minutos de exceso, materia no pedida y objetivo sin colocar',()=>{
  const f=fixture();
  f.result.lessons.push(lesson('1A','MAT','11:00','11:45'));
  f.result.lessons.push(lesson('1A','ING','12:00','12:30'));
  const p=inspect(f);
  assert.equal(p.audit.curriculum[0].surplus,45);
  assert.equal(p.audit.unexpected,1);
  assert.equal(p.audit.state,'review');
});

test('los apoyos individuales se suman por solicitud y no por número de menores',()=>{
  const f=fixture();
  f.payload.supports[0].weekly_minutes=45;
  const p=inspect(f);
  assert.equal(p.audit.individual.missingMinutes,15);
  assert.equal(p.audit.summary.exactIndividual,0);
  assert.match(renderWeeklyPreviewAudit(p.audit),/Faltan 15 min/);
});

test('las peticiones grupales no declaran cumplida la cobertura por participante',()=>{
  const f=fixture();
  f.payload.group_supports.push({request_id:'group-1',service:'AL',
    session_minutes:45,teacher_id:'PT1',
    participants:[
      {pupil_token:'secret-one',group_id:'1A',weekly_minutes:90},
      {pupil_token:'secret-two',group_id:'2A',weekly_minutes:45}
    ]});
  f.result.group_supports.push({request_id:'group-1',service:'AL',
    weekday:1,start_time:'10:00',end_time:'10:45',participant_count:2,
    room_id:'PT-Sala'});
  const p=inspect(f);
  assert.equal(p.audit.summary.groupRequests,1);
  assert.match(renderWeeklyPreviewAudit(p.audit),/no se puede comprobar la cobertura individual/);
  const output=JSON.stringify(p.audit)+renderWeeklyPreviewCalendar(p);
  for(const secret of ['hidden-token','secret-one','secret-two'])
    assert.ok(!output.includes(secret));
});

test('advierte de sala exclusiva con sesiones simultáneas',()=>{
  const f=fixture();
  f.result.supports.push({request_id:'extra',service:'AL',weekday:0,
    start_time:'10:15',end_time:'10:45',room_id:'PT-Sala'});
  const p=inspect(f);
  assert.ok(p.audit.issues.some(x=>x.kind==='roomOverlap'));
  assert.equal(p.audit.state,'review');
});

test('comprueba aforo por asistentes y sesión grupal única',()=>{
  const f=fixture();
  f.payload.rooms=[{room_id:'PT-Sala',capacity:2,windows:[]}];
  f.payload.group_supports=[{request_id:'group-1',service:'PT',
    session_minutes:30,teacher_id:'PT2',participants:[
      {pupil_token:'a',group_id:'1A',weekly_minutes:30},
      {pupil_token:'b',group_id:'1A',weekly_minutes:30}
    ]}];
  f.result.group_supports=[{request_id:'group-1',service:'PT',
    weekday:0,start_time:'10:00',end_time:'10:30',
    participant_count:2,room_id:'PT-Sala'}];
  const p=inspect(f);
  assert.ok(p.audit.issues.some(x=>x.kind==='roomCapacity'));
  assert.ok(!JSON.stringify(p.audit).includes('pupil_token'));
});

test('marca sala con aforo conocido pero asistentes incompletos como no verificable',()=>{
  const f=fixture();
  f.payload.rooms=[{room_id:'PT-Sala',capacity:4,windows:[]}];
  f.payload.group_supports=[{request_id:'group-1',service:'PT',
    session_minutes:30,teacher_id:'PT2',participants:[]}];
  f.result.group_supports=[{request_id:'group-1',service:'PT',
    weekday:1,start_time:'10:00',end_time:'10:30',
    room_id:'PT-Sala'}];
  const p=inspect(f);
  assert.equal(p.audit.summary.roomsWithoutOccupancy,1);
  assert.equal(p.audit.state,'partial');
});

test('detecta ventanas de sala incumplidas',()=>{
  const f=fixture();
  f.payload.rooms=[{room_id:'PT-Sala',capacity:3,windows:[{
    weekday:0,start_time:'11:00',end_time:'12:00'
  }]}];
  const p=inspect(f);
  assert.ok(p.audit.issues.some(x=>x.kind==='roomWindow'));
});

test('detecta solapamientos entre sesiones de un docente conocido',()=>{
  const f=fixture();
  f.payload.lessons.push({group_id:'2A',subject_id:'ING',weekly_minutes:45});
  f.result.lessons.push(lesson('2A','ING','09:15','10:00',0,'T1'));
  const p=inspect(f);
  assert.ok(p.audit.issues.some(x=>x.kind==='teacherOverlap'));
  assert.equal(p.audit.issues.some(x=>x.kind==='classOverlap'),false);
});

test('detecta dos materias simultáneas de una misma clase',()=>{
  const f=fixture();
  f.payload.lessons.push({group_id:'1A',subject_id:'ING',weekly_minutes:45});
  f.result.lessons.push(lesson('1A','ING','09:15','10:00',0,'T2'));
  const p=inspect(f);
  assert.ok(p.audit.issues.some(x=>x.kind==='classOverlap'));
});

test('no confunde solapamiento de apoyo PT con clase ordinaria del alumno',()=>{
  const f=fixture();
  f.result.supports[0].start_time='09:00';
  f.result.supports[0].end_time='09:30';
  const p=inspect(f);
  assert.equal(p.audit.issues.some(x=>x.kind==='classOverlap'),false);
});

test('filtrar el calendario no altera el informe global de cobertura',()=>{
  const f=fixture();
  f.payload.lessons[0].weekly_minutes=90;
  const p=inspect(f);
  const filtered=filterWeeklyPreviewCalendar(p,{classGroup:'no-existent'});
  assert.equal(filtered.visible.current,0);
  assert.equal(filtered.visible.proposed,0);
  assert.equal(p.audit.curriculum[0].missing,45);
  assert.match(renderWeeklyPreviewCalendar(p,{classGroup:'no-existent'}),/Diferencias de minutos curriculares/);
});

test('no muestra informe cuando falta solicitud o es un estado no factible',()=>{
  const f=fixture();
  assert.equal(analyzeWeeklyPreviewAudit(f.state,null,f.result,{}),null);
  const p=buildWeeklyPreviewCalendar(f.state,{...f.result,status:'unknown'},f.payload);
  assert.equal(p,null);
  assert.equal(renderWeeklyPreviewAudit(null),'');
});

test('las entradas de clase, materia y sala se escapan y no se modifica el estado',()=>{
  const f=fixture();
  f.payload.lessons[0].group_id='<svg onload=alert(1)>';
  f.payload.lessons[0].subject_id='<script>MAT</script>';
  f.result.lessons[0].group_id='<svg onload=alert(1)>';
  f.result.lessons[0].subject_id='<script>MAT</script>';
  const before=JSON.stringify(f);
  const html=renderWeeklyPreviewCalendar(inspect(f));
  assert.ok(!html.includes('<script>')&&!html.includes('<svg'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(JSON.stringify(f),before);
});
