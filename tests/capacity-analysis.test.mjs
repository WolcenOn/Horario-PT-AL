import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCapacityStudy } from '../js/capacity-analysis.js';
import { normalizeProfessionalProfile } from '../js/center-planning.js';

const schoolSettings = {
  id:'school',
  structure:{ configured:true, defaultLines:1, courseLines:{} },
  recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} }
};

function baseState() {
  return {
    schoolSettings,
    centerPlanningSettings:{
      id:'centerPlanning',
      mode:'global',
      curriculum:{
        '1º':{
          'Matemáticas':240,
          'Lengua Castellana y Literatura':300,
          'Inglés':180
        }
      }
    },
    professionals:[],
    groups:[],
    sessions:[],
    classSchedules:[]
  };
}

test('normaliza habilitaciones y preferencias de tutoría sin perder asignaciones fijadas', () => {
  const profile = normalizeProfessionalProfile({
    id:'p1', nombre:'Docente', tipo:'DOCENTE', especialidad:'Inglés',
    allowedSubjects:['Inglés'],
    teachingAssignments:[{ grupoClase:'1ºA', materia:'Matemáticas' }]
  });
  assert.equal(profile.teacherRole, 'especialista');
  assert.equal(profile.tutorPreference, 'evitar');
  assert.deepEqual(profile.allowedSubjects, ['Inglés', 'Matemáticas']);
});

test('calcula necesidades, carga fijada y capacidad compatible por materia', () => {
  const state = baseState();
  state.professionals = [
    {
      id:'tutor', nombre:'Tutor 1', tipo:'DOCENTE', teacherRole:'generalista', tutorPreference:'preferente',
      tutoriaGrupo:'1ºA', maxWeeklyMinutes:900,
      allowedSubjects:['Matemáticas','Lengua Castellana y Literatura'],
      teachingAssignments:[{ grupoClase:'1ºA', materia:'Lengua Castellana y Literatura' }],
      responsibilities:[], disponibilidad:{}
    },
    {
      id:'english', nombre:'Especialista Inglés', tipo:'DOCENTE', teacherRole:'especialista', tutorPreference:'evitar',
      especialidad:'Inglés', maxWeeklyMinutes:300,
      allowedSubjects:['Inglés'], teachingAssignments:[], responsibilities:[], disponibilidad:{}
    }
  ];
  const study = buildCapacityStudy(state);
  assert.equal(study.totals.requiredMinutes, 720);
  assert.equal(study.teachers.find(item => item.id === 'tutor').fixedOrdinaryMinutes, 300);
  assert.equal(study.subjects.find(item => item.subject === 'Inglés').requiredMinutes, 180);
  assert.equal(study.subjects.find(item => item.subject === 'Inglés').eligibleTeachers, 1);
  assert.equal(study.totals.uncoveredMinutes, 0);
});

test('detecta déficit cuando una materia no tiene ningún docente habilitado', () => {
  const state = baseState();
  state.professionals = [{
    id:'only', nombre:'Solo Matemáticas', tipo:'DOCENTE', teacherRole:'generalista', tutorPreference:'disponible',
    maxWeeklyMinutes:1200, allowedSubjects:['Matemáticas'], teachingAssignments:[], responsibilities:[], disponibilidad:{}
  }];
  const study = buildCapacityStudy(state);
  assert.ok(study.totals.uncoveredMinutes >= 480);
  assert.ok(study.issues.some(item => item.type === 'subject-without-teacher'));
});

test('una sesión PT/AL sin alumnado también consume capacidad, por ejemplo coordinación', () => {
  const state = baseState();
  state.centerPlanningSettings.curriculum = {};
  state.professionals = [{
    id:'al', nombre:'AL', tipo:'AL', teacherRole:'especialista', tutorPreference:'no',
    maxWeeklyMinutes:1080, allowedSubjects:[], teachingAssignments:[], responsibilities:[], disponibilidad:{}
  }];
  state.groups = [{
    id:'coord', nombre:'Coordinación AL', tipo:'AL', professionalId:'al', studentIds:[]
  }];
  state.sessions = [{
    id:'coord-session', groupId:'coord', professionalId:'al', dia:'jueves', inicio:'13:00', fin:'14:00'
  }];
  const study = buildCapacityStudy(state);
  const row = study.teachers.find(item => item.id === 'al');
  assert.equal(row.ptalMinutes, 60);
  assert.equal(row.freeMinutes, 1020);
});
