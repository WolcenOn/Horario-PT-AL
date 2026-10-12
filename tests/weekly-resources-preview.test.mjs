import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCenterPlanningSettings } from '../js/center-planning.js';
import { buildWeeklyPreviewRequest } from '../js/weekly-preview-adapter.js';

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
