import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfessionalSchedule, summarizeProfessionalWorkload } from '../js/professional-schedule.js';

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


test('la tabla mide minutos realmente programados y el margen semanal',()=>{
  const data=summarizeProfessionalWorkload(state,'doc');
  assert.equal(data.capacitySource,'configured');
  assert.equal(data.capacityMinutes,1200);
  assert.equal(data.scheduledMinutes,180);
  assert.equal(data.differenceMinutes,1020);
  assert.equal(data.ordinaryMinutes,60);
  assert.equal(data.supportMinutes,60);
  assert.equal(data.activityMinutes,60);
  assert.equal(data.overlapMinutes,0);
});

test('no cuenta dos veces las clases, apoyos y actividades solapados',()=>{
  const withOverlap={
    ...state,
    classSchedules:[...state.classSchedules,{
      id:'c2',grupoClase:'5ºA',materia:'Lengua',professionalId:'doc',
      dia:'lunes',inicio:'09:30',fin:'10:30'
    }]
  };
  const data=summarizeProfessionalWorkload(withOverlap,'doc');
  assert.equal(data.scheduledMinutes,180);
  assert.equal(data.overlapMinutes,60);
});

test('la capacidad sin fijar usa disponibilidad; sin ambas, no inventa margen',()=>{
  const data={...state,professionals:[{...professional,maxWeeklyMinutes:0}]};
  const workload=summarizeProfessionalWorkload(data,'doc');
  assert.equal(workload.capacitySource,'availability');
  assert.equal(workload.capacityMinutes,300);
  assert.equal(workload.differenceMinutes,120);
  const undefinedCapacity=summarizeProfessionalWorkload({
    ...data,professionals:[{...professional,maxWeeklyMinutes:0,disponibilidad:{}}]
  },'doc');
  assert.equal(undefinedCapacity.capacitySource,'undefined');
  assert.equal(undefinedCapacity.differenceMinutes,null);
});

test('el exceso se calcula usando los bloques únicos, no los duplicados',()=>{
  const data={...state,professionals:[{...professional,maxWeeklyMinutes:120}]};
  const workload=summarizeProfessionalWorkload(data,'doc');
  assert.equal(workload.differenceMinutes,-60);
});
