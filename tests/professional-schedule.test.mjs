import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfessionalSchedule } from '../js/professional-schedule.js';

const professional={
  id:'doc',nombre:'Docente',tipo:'DOCENTE',activo:true,especialidad:'Primaria',
  maxWeeklyMinutes:1200,
  teachingAssignments:[{grupoClase:'4ºA',materia:'Matemáticas'}],
  responsibilities:[{tipo:'coordinacion',nombre:'Coordinación TIC',weeklyMinutes:60}],
  disponibilidadBase:{lunes:[{inicio:'09:00',fin:'14:00'}]},
  disponibilidad:{lunes:[{inicio:'09:00',fin:'14:00'}]},
  bloqueosExternos:{martes:[{centro:'IES',inicio:'09:00',fin:'11:00'}]}
};

const state={
  professionals:[professional],
  students:[],
  groups:[{id:'gpt',nombre:'Apoyo PT 4º',tipo:'PT',professionalId:'doc',studentIds:[]}],
  sessions:[{id:'s1',groupId:'gpt',professionalId:'doc',dia:'lunes',inicio:'10:00',fin:'11:00'}],
  classSchedules:[{id:'c1',grupoClase:'4ºA',materia:'Matemáticas',professionalId:'doc',dia:'lunes',inicio:'09:00',fin:'10:00'}],
  centerPlanningSettings:{
    id:'centerPlanning',mode:'global',
    weeklyActivities:[{
      id:'a1',name:'Biblioteca',category:'biblioteca',weeklyMinutes:60,sessionMinutes:60,requiredStaff:1,
      assignedTeacherIds:['doc'],eligibleTeacherIds:[],classGroupIds:[],active:true,movable:true,
      scheduledSlots:[{dia:'lunes',inicio:'12:00',fin:'13:00',teacherIds:['doc']}]
    }]
  }
};

test('reúne en una ficha la docencia, PT/AL, actividades y otros centros',()=>{
  const model=buildProfessionalSchedule(state,'doc');
  assert.ok(model);
  assert.equal(model.entries.length,4);
  assert.equal(model.metrics.ordinaryMinutes,60);
  assert.equal(model.metrics.supportMinutes,60);
  assert.equal(model.metrics.activityMinutes,60);
  assert.equal(model.metrics.responsibilityMinutes,60);
  assert.equal(model.metrics.modeledMinutes,240);
  assert.equal(model.metrics.remaining,960);
  assert.equal(model.byDay.lunes.length,3);
  assert.equal(model.byDay.martes[0].kind,'external');
});
