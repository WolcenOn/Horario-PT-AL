import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeCenterPlanningSettings } from '../js/center-planning.js';
import { buildCapacityStudy } from '../js/capacity-analysis.js';

const schoolSettings = {
  id:'school',
  recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} },
  structure:{ configured:true, defaultLines:1, courseLines:{ '1º':1 } }
};

function teacher() {
  return {
    id:'p1',
    nombre:'Ana',
    tipo:'DOCENTE',
    activo:true,
    teacherRole:'generalista',
    tutorPreference:'disponible',
    maxWeeklyMinutes:1200,
    allowedSubjects:['Lengua Castellana y Literatura'],
    specialtySubjects:[],
    teachingAssignments:[],
    responsibilities:[],
    disponibilidad:{}
  };
}

test('normalizes configurable weekly activities', () => {
  const settings = normalizeCenterPlanningSettings({
    mode:'global',
    weeklyActivities:[{
      id:'act-bib',
      name:'Biblioteca',
      category:'biblioteca',
      weeklyMinutes:120,
      sessionMinutes:60,
      requiredStaff:1,
      assignedTeacherIds:['p1'],
      eligibleTeacherIds:['p1','p2'],
      classGroupIds:['1ºA']
    }]
  });
  assert.equal(settings.weeklyActivities.length, 1);
  assert.equal(settings.weeklyActivities[0].weeklyMinutes, 120);
  assert.deepEqual(settings.weeklyActivities[0].eligibleTeacherIds, ['p1','p2']);
});

test('assigned center activities reduce teacher free capacity', () => {
  const state = {
    schoolSettings,
    groups:[],
    sessions:[],
    classSchedules:[],
    professionals:[teacher()],
    centerPlanningSettings:{
      id:'centerPlanning',
      mode:'global',
      curriculum:{ '1º':{ 'Lengua Castellana y Literatura':300 } },
      weeklyActivities:[{
        id:'act-bib',
        name:'Biblioteca',
        category:'biblioteca',
        weeklyMinutes:120,
        sessionMinutes:60,
        requiredStaff:1,
        assignedTeacherIds:['p1'],
        eligibleTeacherIds:[],
        classGroupIds:[],
        active:true,
        movable:true
      }]
    }
  };
  const study = buildCapacityStudy(state);
  const row = study.teachers.find(item => item.id === 'p1');
  assert.equal(row.activityMinutes, 120);
  assert.equal(row.nonOrdinaryMinutes, 120);
  assert.equal(row.freeMinutes, 1080);
});

test('inactive center activities do not consume teacher capacity', () => {
  const state = {
    schoolSettings,
    groups:[],
    sessions:[],
    classSchedules:[],
    professionals:[teacher()],
    centerPlanningSettings:{
      id:'centerPlanning',
      mode:'global',
      curriculum:{ '1º':{ 'Lengua Castellana y Literatura':300 } },
      weeklyActivities:[{
        id:'act-read',
        name:'Lectura',
        category:'lectura',
        weeklyMinutes:60,
        sessionMinutes:60,
        requiredStaff:1,
        assignedTeacherIds:['p1'],
        eligibleTeacherIds:[],
        classGroupIds:['1ºA'],
        active:false,
        movable:true
      }]
    }
  };
  const study = buildCapacityStudy(state);
  const row = study.teachers.find(item => item.id === 'p1');
  assert.equal(row.activityMinutes, 0);
  assert.equal(row.freeMinutes, 1200);
});
