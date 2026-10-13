import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyPreviewCalendar,renderWeeklyPreviewCalendar} from '../js/weekly-preview-calendar.js';

const current=()=>({
  students:[{id:'real-student-secret',nombre:'Pupil private',apellidos:'Secret surname'}],
  classSchedules:[{
    grupoClase:'1ºA',materia:'Matemáticas',dia:'lunes',
    inicio:'09:00',fin:'10:00'
  }],
  groups:[{id:'support-group',tipo:'PT',roomId:'PT-1',
    nombre:'Sensitive group',studentIds:['real-student-secret']}],
  sessions:[{groupId:'support-group',dia:'martes',inicio:'10:00',fin:'10:45'}]
});
const preview=()=>({
  preview_only:true,status:'feasible',lessons:[
    {group_id:'1ºA',subject_id:'Matemáticas',weekday:0,
      start_time:'09:15',end_time:'10:15'},
    {group_id:'1ºA',subject_id:'Inglés',weekday:2,
      start_time:'11:00',end_time:'11:45'}
  ],
  supports:[{service:'AL',weekday:0,start_time:'10:15',end_time:'10:45',
    request_id:'private-token',pupil_token:'private-token',room_id:'AL-2'}],
  group_supports:[{service:'PT',weekday:1,start_time:'09:00',
    end_time:'09:45',participant_count:2,request_id:'private-group'}]
});

test('distingue materias actuales, propuestas, apoyos fijos y adicionales',()=>{
  const result=buildWeeklyPreviewCalendar(current(),preview());
  assert.deepEqual(result.counts,{
    ordinaryCurrent:1,ordinaryProposed:2,fixedSupports:1,additionalSupports:2
  });
  const monday=result.days[0];
  assert.equal(monday.current[0].start,'09:00');
  assert.equal(monday.proposed[0].start,'09:15');
  assert.equal(monday.proposed[1].room,'AL-2');
  const tuesday=result.days[1];
  assert.equal(tuesday.current.length,1);
  assert.deepEqual(tuesday.proposed.map(row=>row.source),['proposed','fixed']);
});

test('suma intervalos sin alterar la duración original de materias ni apoyos',()=>{
  const result=buildWeeklyPreviewCalendar(current(),preview());
  assert.equal(result.days[0].current[0].duration,60);
  assert.equal(result.days[0].proposed[0].duration,60);
  assert.equal(result.days[0].proposed[1].duration,30);
  assert.equal(result.days[1].proposed[0].duration,45);
});

test('ningún token o dato del alumnado pasa a la proyección o al HTML',()=>{
  const p=preview();p.supports[0].participant_count=1;
  const projection=buildWeeklyPreviewCalendar(current(),p);
  const output=JSON.stringify(projection)+renderWeeklyPreviewCalendar(projection);
  for(const secret of [
    'real-student-secret','Pupil private','Secret surname',
    'Sensitive group','private-token','private-group'
  ])assert.ok(!output.includes(secret),secret);
  assert.match(output,/identidad protegida/);
  assert.match(output,/2 participante\(s\)/);
});

test('solo una vista previa factible y explícitamente no persistente se muestra',()=>{
  for(const status of ['infeasible','unknown','invalid']){
    assert.equal(buildWeeklyPreviewCalendar(current(),{...preview(),status}),null);
  }
  assert.equal(buildWeeklyPreviewCalendar(current(),{...preview(),preview_only:false}),null);
  assert.equal(renderWeeklyPreviewCalendar(null),'');
});

test('rechaza franjas inválidas y contenidos HTML sin ejecutarlos',()=>{
  const c=current();c.classSchedules.push({
    grupoClase:'1ºB',materia:'Mal formateado',dia:'jueves',
    inicio:'10:17',fin:'11:17'
  });
  const p=preview();
  p.lessons.push({weekday:6,start_time:'09:00',end_time:'10:00',
    group_id:'bad',subject_id:'Fuera de semana'});
  p.lessons.push({weekday:2,start_time:'09:00',end_time:'10:00',
    group_id:'1ºA',subject_id:'<img src=x onerror=alert(1)>'});
  const projection=buildWeeklyPreviewCalendar(c,p);
  const html=renderWeeklyPreviewCalendar(projection);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('Fuera de semana'));
  assert.ok(!html.includes('Mal formateado'));
});

test('genera solo información derivada sin mutar el estado de planificación',()=>{
  const state=current(),response=preview();
  const before=JSON.stringify({state,response});
  buildWeeklyPreviewCalendar(state,response);
  assert.equal(JSON.stringify({state,response}),before);
});


test('etiqueta diferencias y compara minutos semanales sin redondeo',()=>{
  const c=current();
  c.classSchedules.push({
    grupoClase:'1ºA',materia:'Lengua Castellana y Literatura',
    dia:'miercoles',inicio:'11:00',fin:'11:45'
  });
  const p=preview();
  const projection=buildWeeklyPreviewCalendar(c,p);
  assert.deepEqual(projection.comparison.changes,{
    same:0,changed:1,added:1,removed:1,ambiguous:0
  });
  assert.deepEqual(projection.comparison.classes,[
    {group:'1ºA',currentMinutes:105,proposedMinutes:105,
      differenceMinutes:0,currentSessions:2,proposedSessions:2}
  ]);
  assert.deepEqual(projection.comparison.supports,[
    {service:'PT',fixedMinutes:45,additionalMinutes:45,totalMinutes:90,
      fixedSessions:1,additionalSessions:1},
    {service:'AL',fixedMinutes:0,additionalMinutes:30,totalMinutes:30,
      fixedSessions:0,additionalSessions:1}
  ]);
  const html=renderWeeklyPreviewCalendar(projection);
  assert.match(html,/Minutos semanales por clase/);
  assert.match(html,/Minutos de sesiones PT\/AL/);
  assert.match(html,/data-weekly-review-change="changed"/);
  assert.match(html,/data-weekly-review-change="removed"/);
  assert.match(html,/data-weekly-review-change="new"/);
  assert.match(html,/90 min/);
});

test('un apoyo fijo cuenta una sola vez al calcular totales',()=>{
  const projection=buildWeeklyPreviewCalendar(current(),preview());
  assert.equal(projection.comparison.supports[0].fixedMinutes,45);
  assert.equal(projection.comparison.supports[0].totalMinutes,90);
});

test('los textos de comparación con material no fiable se escapan en HTML',()=>{
  const c=current();
  c.classSchedules.push({
    grupoClase:'<script>alert(1)</script>',materia:'MAT',
    dia:'lunes',inicio:'11:00',fin:'11:45'
  });
  const projection=buildWeeklyPreviewCalendar(c,preview());
  const html=renderWeeklyPreviewCalendar(projection);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
