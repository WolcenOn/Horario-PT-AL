import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStaffingSolverPayload } from '../js/staffing-adapter.js';

const schoolSettings = {
  id:'school',
  recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} },
  structure:{ configured:true, defaultLines:1, courseLines:{ '1º':1 } }
};

function baseState() {
  return {
    schoolSettings,
    students:[],
    groups:[],
    sessions:[],
    classSchedules:[],
    professionals:[{
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
      responsibilities:[{ tipo:'coordinacion', nombre:'Ciclo', weeklyMinutes:60 }],
      disponibilidad:{}
    }],
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
        eligibleTeacherIds:['p1'],
        classGroupIds:['1ºA'],
        active:true,
        movable:true
      }]
    }
  };
}

test('staffing payload sends activities without double-subtracting their minutes', () => {
  const { payload, study } = buildStaffingSolverPayload(baseState());
  assert.equal(study.teachers[0].activityMinutes, 120);
  assert.equal(payload.teachers[0].available_minutes, 1140);
  assert.equal(payload.activities.length, 1);
  assert.deepEqual(payload.activities[0], {
    id:'act-bib',
    name:'Biblioteca',
    minutes:120,
    required_staff:1,
    fixed_teacher_ids:['p1'],
    eligible_teacher_ids:['p1'],
    group_ids:['1ºA']
  });
});
