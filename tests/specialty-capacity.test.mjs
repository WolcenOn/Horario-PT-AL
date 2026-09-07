import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfessionalProfile } from '../js/center-planning.js';
import { buildCapacityStudy } from '../js/capacity-analysis.js';

const schoolSettings = {
  id:'school',
  recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} },
  structure:{ configured:true, defaultLines:1, courseLines:{ '1º':1 } }
};

const centerPlanningSettings = {
  id:'centerPlanning',
  mode:'global',
  curriculum:{ '1º':{ 'Inglés':180, 'Matemáticas':240 } }
};

test('normaliza materias de especialidad dentro de las materias permitidas', () => {
  const professional = normalizeProfessionalProfile({
    id:'p1',
    nombre:'Especialista',
    tipo:'DOCENTE',
    especialidad:'Inglés',
    allowedSubjects:['Inglés','Matemáticas'],
    specialtySubjects:['Inglés']
  });
  assert.deepEqual(professional.specialtySubjects, ['Inglés']);
  assert.ok(professional.allowedSubjects.includes('Inglés'));
});

test('el estudio separa capacidad especialista de capacidad total habilitada', () => {
  const state = {
    schoolSettings,
    centerPlanningSettings,
    groups:[], sessions:[],
    professionals:[
      {
        id:'en', nombre:'Inglés', tipo:'DOCENTE', especialidad:'Inglés', teacherRole:'especialista',
        allowedSubjects:['Inglés','Matemáticas'], specialtySubjects:['Inglés'], maxWeeklyMinutes:180,
        responsibilities:[], teachingAssignments:[], disponibilidad:{}
      },
      {
        id:'g', nombre:'Generalista', tipo:'DOCENTE', teacherRole:'generalista',
        allowedSubjects:['Inglés','Matemáticas'], specialtySubjects:[], maxWeeklyMinutes:300,
        responsibilities:[], teachingAssignments:[], disponibilidad:{}
      }
    ]
  };
  const study = buildCapacityStudy(state);
  const english = study.subjects.find(item => item.subject === 'Inglés');
  assert.equal(english.specialistTeachers, 1);
  assert.equal(english.specialistCapacityMinutes, 180);
  assert.equal(english.specialistMarginMinutes, 0);
  assert.equal(english.eligibleTeachers, 2);
});
