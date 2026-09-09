import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyPrintEntries, dayIdForDate } from '../js/teacher-print.js';

const state={
  professionals:[{
    id:'doc',nombre:'Docente Demo',tipo:'DOCENTE',activo:true,especialidad:'Primaria',
    teachingAssignments:[],responsibilities:[],disponibilidadBase:{},disponibilidad:{},bloqueosExternos:{}
  }],
  students:[],groups:[],sessions:[],
  classSchedules:[{id:'c1',grupoClase:'3ºA',materia:'Matemáticas',professionalId:'doc',dia:'lunes',inicio:'09:00',fin:'10:00'}],
  centerPlanningSettings:{id:'centerPlanning',mode:'global',weeklyActivities:[]}
};

test('resuelve el día lectivo desde una fecha local',()=>{
  assert.equal(dayIdForDate('2026-09-07'),'lunes');
  assert.equal(dayIdForDate('2026-09-12'),null);
  assert.equal(dayIdForDate('no-date'),null);
});

test('combina el horario habitual con las sustituciones del día',()=>{
  const entries=dailyPrintEntries(state,'doc','2026-09-07',[{
    inicio:'10:00',fin:'11:00',grupo:'5ºA',absentTeacher:'Docente ausente'
  }]);
  assert.equal(entries.length,2);
  assert.equal(entries[0].kind,'class');
  assert.equal(entries[1].kind,'substitution');
  assert.equal(entries[1].title,'Sustitución · 5ºA');
  assert.equal(entries[1].detail,'Ausencia de Docente ausente');
});