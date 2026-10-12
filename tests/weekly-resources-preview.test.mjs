import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCenterPlanningSettings } from '../js/center-planning.js';
import { buildWeeklyPreviewRequest } from '../js/weekly-preview-adapter.js';
import { parseRoomResources, formatRoomResources, parseTravelRules, supportRoomId } from '../js/weekly-location-rules.js';

const intervals=Object.fromEntries(
  ['lunes','martes','miercoles','jueves','viernes']
    .map(day=>[day,[{inicio:'09:00',fin:'12:00'}]])
);

function fixture() {
  return {
    schoolSettings:{
      structure:{configured:true,defaultLines:1,courseLines:{}},
      recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
    },
    centerPlanningSettings:{
      mode:'global',
      generation:{
        start:'09:00',end:'12:00',lessonMinutes:45,
        maxSameSubjectPerDay:2,travelMinutes:15,supportRoomId:'ROOM-1'
      },
      curriculum:{'1º':{Matemáticas:90},'2º':{Matemáticas:90}},
      subjectPatterns:{}
    },
    professionals:[
      {id:'teacher',tipo:'DOCENTE',activo:true,disponibilidad:intervals,
       teachingAssignments:[
         {grupoClase:'1ºA',materia:'Matemáticas'},
         {grupoClase:'2ºA',materia:'Matemáticas'}
       ]},
      {id:'pt',tipo:'PT',activo:true,disponibilidad:intervals}
    ],
    groups:[{id:'support-group',tipo:'PT',professionalId:'pt',studentIds:['p-1']}],
    students:[{
      id:'p-1',curso:'1º',grupoClase:'1ºA',horasPTObjetivoMin:90,activo:true
    }],
    sessions:[{
      id:'existing',groupId:'support-group',professionalId:'pt',
      dia:'lunes',inicio:'09:00',fin:'09:45'
    }]
  };
}

test('opciones de traslado y sala predeterminadas mantienen el legado',()=>{
  const d=normalizeCenterPlanningSettings({mode:'global'}).generation;
  assert.equal(d.travelMinutes,0);
  assert.equal(d.supportRoomId,'');
  const v=normalizeCenterPlanningSettings({
    mode:'global',generation:{travelMinutes:30,supportRoomId:' SHARED '}
  }).generation;
  assert.equal(v.travelMinutes,30);
  assert.equal(v.supportRoomId,'SHARED');
  const invalid=normalizeCenterPlanningSettings({
    mode:'global',generation:{travelMinutes:10}
  });
  assert.equal(invalid.generation.travelMinutes,0);
});

test('envía ubicaciones de aulas y traslados explícitos al motor',()=>{
  const {payload}=buildWeeklyPreviewRequest(fixture());
  assert.equal(payload.travel_minutes,15);
  assert.deepEqual(payload.lessons.map(i=>i.location_id),['class:1ºA','class:2ºA']);
  assert.equal(payload.supports.length,1);
  assert.equal(payload.supports[0].room_id,'ROOM-1');
  assert.equal(payload.supports[0].location_id,'room:ROOM-1');
  assert.ok(payload.busy.some(b=>b.teacher_id==='pt'&&b.room_id==='ROOM-1'));
  assert.equal(JSON.stringify(payload).includes('p-1'),false);
});

test('sin sala no presume la ubicación de las sesiones PT',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.supportRoomId='';
  const {payload,warnings}=buildWeeklyPreviewRequest(state);
  assert.equal(payload.supports[0].room_id,undefined);
  assert.ok(warnings.some(w=>w.includes('no se conoce la sala')));
});


test('una sesión grupal también utiliza la sala compartida indicada',()=>{
  const state=fixture();
  state.students.push({
    id:'p-2',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:45,activo:true
  });
  state.groups[0].studentIds.push('p-2');
  state.sessions[0].excludedStudentIds=['p-2'];
  const {payload}=buildWeeklyPreviewRequest(state);
  assert.equal(payload.group_supports.length,1);
  assert.equal(payload.group_supports[0].room_id,'ROOM-1');
  assert.equal(payload.group_supports[0].location_id,'room:ROOM-1');
  assert.equal(JSON.stringify(payload).includes('p-2'),false);
});


test('rutas dirigidas tienen sentido independiente y validación explícita',()=>{
  const matrix=parseTravelRules(
    'class:1ºA | room:PT-1 | 15\nroom:PT-1 | class:1ºA | 30'
  );
  assert.deepEqual(matrix,[
    {fromLocationId:'class:1ºA',toLocationId:'room:PT-1',minutes:15},
    {fromLocationId:'room:PT-1',toLocationId:'class:1ºA',minutes:30}
  ]);
  assert.throws(()=>parseTravelRules('A | A | 15'),/Trayecto 1/);
  assert.throws(()=>parseTravelRules('A | B | 10'),/Trayecto 1/);
  assert.throws(()=>parseTravelRules('A | B | 15\nA | B | 30'),/duplicados/);
});

test('el motor recibe reglas dirigidas sin enviar datos del alumnado',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.travelRules=[
    {fromLocationId:'class:1ºA',toLocationId:'room:ROOM-1',minutes:15},
    {fromLocationId:'room:ROOM-1',toLocationId:'class:1ºA',minutes:30}
  ];
  const {payload}=buildWeeklyPreviewRequest(state);
  assert.deepEqual(payload.travel_rules,[
    {from_location_id:'class:1ºA',to_location_id:'room:ROOM-1',minutes:15},
    {from_location_id:'room:ROOM-1',to_location_id:'class:1ºA',minutes:30}
  ]);
  assert.equal(JSON.stringify(payload).includes('p-1'),false);
});

test('la sala de grupo prevalece sobre la sala del profesional y la general',()=>{
  const state=fixture();
  state.professionals[1].supportRoomId='ROOM-PRO';
  state.groups[0].roomId='ROOM-GROUP';
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.equal(payload.supports[0].room_id,'ROOM-GROUP');
  assert.equal(payload.supports[0].location_id,'room:ROOM-GROUP');
  assert.ok(payload.busy.some(block=>
    block.teacher_id==='pt'&&block.room_id==='ROOM-GROUP'
  ));
  assert.equal(supportRoomId({},state.professionals[1],'ROOM-1'),'ROOM-PRO');
});

test('la sala explícita de sesión existente tiene prioridad máxima',()=>{
  const state=fixture();
  state.groups[0].roomId='ROOM-GROUP';
  state.sessions[0].aula='ROOM-SPECIAL';
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.ok(payload.busy.some(block=>
    block.teacher_id==='pt'&&block.room_id==='ROOM-SPECIAL'
    &&block.location_id==='room:ROOM-SPECIAL'
  ));
  assert.equal(payload.supports[0].room_id,'ROOM-GROUP');
});

test('el profesional aporta sala cuando el grupo no la tiene',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.supportRoomId='ROOM-GLOBAL';
  state.professionals[1].supportRoomId='ROOM-PT';
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.equal(payload.supports[0].room_id,'ROOM-PT');
  assert.ok(payload.busy.some(block=>
    block.teacher_id==='pt'&&block.room_id==='ROOM-PT'
  ));
});

test('las sesiones agrupadas respetan la sala configurada en su grupo',()=>{
  const state=fixture();
  state.groups[0].roomId='ROOM-GROUP';
  state.students.push({
    id:'new-pupil',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:45,activo:true
  });
  state.groups[0].studentIds.push('new-pupil');
  state.sessions[0].excludedStudentIds=['new-pupil'];
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.equal(payload.group_supports[0].room_id,'ROOM-GROUP');
  assert.equal(payload.group_supports[0].location_id,'room:ROOM-GROUP');
  assert.equal(JSON.stringify(payload).includes('new-pupil'),false);
});


test('una ruta concreta activa las ubicaciones aunque el margen general sea cero',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.travelMinutes=0;
  state.centerPlanningSettings.generation.travelRules=[
    {fromLocationId:'class:1ºA',toLocationId:'class:2ºA',minutes:30}
  ];
  const result=buildWeeklyPreviewRequest(state);
  assert.equal(result.payload.travel_minutes,0);
  assert.deepEqual(result.payload.travel_rules,[{
    from_location_id:'class:1ºA',
    to_location_id:'class:2ºA',
    minutes:30
  }]);
  assert.deepEqual(result.payload.lessons.map(i=>i.location_id),[
    'class:1ºA','class:2ºA'
  ]);
});


test('configuración de aforo: una sala libre y otra con franjas semanales',()=>{
  const data=parseRoomResources(
    'Sala A | 2\nSala PT | 4 | lunes | 09:00 | 12:00\nSala PT | 4 | martes | 10:00 | 11:45'
  );
  assert.deepEqual(data,[
    {roomId:'Sala A',capacity:2,windows:[]},
    {roomId:'Sala PT',capacity:4,windows:[
      {weekday:0,startTime:'09:00',endTime:'12:00'},
      {weekday:1,startTime:'10:00',endTime:'11:45'}
    ]}
  ]);
  assert.deepEqual(parseRoomResources(formatRoomResources(data)),data);
});

test('rechaza aforos inválidos, horarios solapados y días fuera de la semana',()=>{
  for(const definition of [
    'Sala | 0','Sala | 31','Sala | 3 | domingo | 09:00 | 10:00',
    'Sala | 2 | lunes | 09:05 | 10:00',
    'Sala | 2 | lunes | 10:00 | 09:00',
    'Sala | 2\nSala | 2 | martes | 09:00 | 10:00',
    'Sala | 2 | lunes | 09:00 | 10:00\nSala | 3 | martes | 10:00 | 11:00',
    'Sala | 2 | lunes | 09:00 | 10:00\nSala | 2 | lunes | 09:45 | 11:00'
  ]) assert.throws(()=>parseRoomResources(definition),/Sala/);
});

test('envía los aforos y franjas sin nombres ni identificadores originales de alumnos',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.roomResources=[{
    roomId:'ROOM-1',capacity:4,windows:[
      {weekday:0,startTime:'09:00',endTime:'11:00'},
      {weekday:2,startTime:'10:00',endTime:'12:00'}
    ]
  }];
  const {payload,warnings}=buildWeeklyPreviewRequest(state);
  assert.deepEqual(payload.rooms,[{
    room_id:'ROOM-1',capacity:4,windows:[
      {weekday:0,start_time:'09:00',end_time:'11:00'},
      {weekday:2,start_time:'10:00',end_time:'12:00'}
    ]
  }]);
  assert.ok(payload.busy.some(block=>
    block.room_id==='ROOM-1'&&block.room_units===1
  ));
  assert.ok(warnings.some(w=>w.includes('aforo definido')));
  assert.equal(JSON.stringify(payload).includes('p-1'),false);
});

test('el recuento de una sesión existente excluye al alumno que no asiste',()=>{
  const state=fixture();
  state.students.push({
    id:'p-2',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:45,activo:true
  });
  state.groups[0].studentIds.push('p-2');
  state.sessions[0].excludedStudentIds=['p-2'];
  const payload=buildWeeklyPreviewRequest(state).payload;
  const reservation=payload.busy.find(block=>
    block.room_id==='ROOM-1'&&block.teacher_id==='pt'
  );
  assert.equal(reservation.room_units,1);
  assert.equal(JSON.stringify(payload).includes('p-2'),false);
});

test('una sala sin aforo permanece reservada en exclusiva como en versiones anteriores',()=>{
  const state=fixture();
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.deepEqual(payload.rooms,[]);
  assert.equal(payload.supports[0].room_id,'ROOM-1');
  assert.ok(payload.warnings===undefined);
});
