import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGlobalReadiness, generateGlobalProposal } from '../js/global-scheduler.js';
import { overlapInterval, timeToMinutes } from '../js/utils.js';

const days=['lunes','martes','miercoles','jueves','viernes'];
const schoolSettings={
  id:'school',
  structure:{configured:true,defaultLines:1,courseLines:{}},
  recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
};

function availability() {
  return Object.fromEntries(days.map(day => [day,[{inicio:'09:00',fin:'12:00'}]]));
}

function professional(id, nombre, assignments=[]) {
  return {
    id,nombre,tipo:'DOCENTE',activo:true,maxWeeklyMinutes:1200,
    disponibilidad:availability(),
    teachingAssignments:assignments,
    responsibilities:[]
  };
}

test('respeta días y ventana dura de una materia', () => {
  const subject='Lengua Castellana y Literatura';
  const settings={
    id:'centerPlanning',mode:'global',
    generation:{start:'09:00',end:'12:00',lessonMinutes:45,maxSameSubjectPerDay:2},
    curriculum:{'1º':{[subject]:60}},
    subjectPatterns:{'1º':{[subject]:{
      sessionMinutes:60,
      maxSessionsPerDay:1,
      allowedDays:['martes'],
      earliestStart:'09:00',
      latestEnd:'10:00'
    }}},
    weeklyActivities:[]
  };
  const state={
    students:[],groups:[],sessions:[],classSchedules:[],schoolSettings,
    professionals:[professional('t1','Tutor 1º',[{grupoClase:'1ºA',materia:subject}])],
    automationSettings:{id:'automation',courseRules:{}},centerPlanningSettings:settings
  };
  const proposal=generateGlobalProposal(state,settings);
  assert.equal(proposal.ok,true);
  assert.equal(proposal.classSchedules.length,1);
  assert.equal(proposal.classSchedules[0].dia,'martes');
  assert.equal(proposal.classSchedules[0].inicio,'09:00');
  assert.equal(proposal.classSchedules[0].fin,'10:00');
});

test('coloca una coordinación como bloque simultáneo y evita solapar al docente con su clase', () => {
  const subject='Matemáticas';
  const settings={
    id:'centerPlanning',mode:'global',
    generation:{start:'09:00',end:'12:00',lessonMinutes:60,maxSameSubjectPerDay:1},
    curriculum:{'1º':{[subject]:60}},
    weeklyActivities:[{
      id:'coord',name:'Coordinación de ciclo',category:'coordinacion',active:true,
      weeklyMinutes:60,sessionMinutes:60,requiredStaff:2,
      assignedTeacherIds:['t1','t2'],eligibleTeacherIds:[],classGroupIds:['1ºA'],
      movable:true,allowDuringRecess:false,
      timePattern:{allowedDays:['lunes'],earliestStart:'10:00',latestEnd:'12:00',maxSessionsPerDay:1}
    }]
  };
  const state={
    students:[],groups:[],sessions:[],classSchedules:[],schoolSettings,
    professionals:[
      professional('t1','Tutor 1º',[{grupoClase:'1ºA',materia:subject}]),
      professional('t2','Especialista')
    ],
    automationSettings:{id:'automation',courseRules:{}},centerPlanningSettings:settings
  };
  const readiness=buildGlobalReadiness(state,settings);
  assert.equal(readiness.ready,true);
  const proposal=generateGlobalProposal(state,settings);
  assert.equal(proposal.ok,true);
  assert.equal(proposal.activitySchedules.length,1);
  const activity=proposal.activitySchedules[0];
  assert.equal(activity.dia,'lunes');
  assert.deepEqual(new Set(activity.teacherIds),new Set(['t1','t2']));
  assert.ok(timeToMinutes(activity.inicio)>=600);
  assert.ok(timeToMinutes(activity.fin)<=720);
  for (const entry of proposal.classSchedules) {
    if (entry.dia!==activity.dia || entry.professionalId!=='t1') continue;
    assert.equal(overlapInterval(timeToMinutes(entry.inicio),timeToMinutes(entry.fin),timeToMinutes(activity.inicio),timeToMinutes(activity.fin)),null);
  }
  assert.equal(proposal.stats.activities,1);
  assert.equal(proposal.stats.activityBlocks,1);
});

test('marca como pendiente una actividad sin suficientes docentes asignados', () => {
  const subject='Matemáticas';
  const settings={
    id:'centerPlanning',mode:'global',
    generation:{start:'09:00',end:'12:00',lessonMinutes:60,maxSameSubjectPerDay:1},
    curriculum:{'1º':{[subject]:60}},
    weeklyActivities:[{
      id:'bib',name:'Biblioteca',category:'biblioteca',active:true,
      weeklyMinutes:60,sessionMinutes:60,requiredStaff:1,
      assignedTeacherIds:[],eligibleTeacherIds:['t1'],classGroupIds:[],movable:true
    }]
  };
  const state={
    students:[],groups:[],sessions:[],classSchedules:[],schoolSettings,
    professionals:[professional('t1','Tutor 1º',[{grupoClase:'1ºA',materia:subject}])],
    automationSettings:{id:'automation',courseRules:{}},centerPlanningSettings:settings
  };
  const readiness=buildGlobalReadiness(state,settings);
  assert.equal(readiness.ready,false);
  const activities=readiness.items.find(item=>item.id==='activities');
  assert.equal(activities.ok,false);
  assert.match(activities.message,/0\/1/);
});
