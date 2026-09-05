import test from 'node:test';
import assert from 'node:assert/strict';
import { curriculumCoverage, normalizeCenterPlanningSettings, normalizeProfessionalProfile } from '../js/center-planning.js';
import { validateSchoolSettings } from '../js/education.js';
import { detectConflicts } from '../js/conflicts.js';

const schoolSettings = validateSchoolSettings({
  id:'school',
  structure:{ configured:true, defaultLines:1, courseLines:{} },
  recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} }
});

test('el plan del centro mantiene PT/AL como modo predeterminado y admite modo global', () => {
  assert.equal(normalizeCenterPlanningSettings().mode, 'ptal');
  const global = normalizeCenterPlanningSettings({ mode:'global', profileName:'Perfil oficial' });
  assert.equal(global.mode, 'global');
  assert.equal(global.profileName, 'Perfil oficial');
});

test('el perfil profesional admite docentes ordinarios, tutoría, materias y coordinaciones', () => {
  const profile = normalizeProfessionalProfile({
    id:'d1', nombre:'Docente Uno', tipo:'DOCENTE', tutoriaGrupo:'4ºA',
    teachingAssignments:[{grupoClase:'4ºA',materia:'Matemáticas'},{grupoClase:'4ºA',materia:'Matemáticas'}],
    responsibilities:[{tipo:'coordinacion',nombre:'TIC',weeklyMinutes:60}]
  });
  assert.equal(profile.tipo, 'DOCENTE');
  assert.equal(profile.tutoriaGrupo, '4ºA');
  assert.equal(profile.teachingAssignments.length, 1);
  assert.equal(profile.responsibilities[0].weeklyMinutes, 60);
});

test('calcula la cobertura curricular de una clase frente al objetivo semanal', () => {
  const centerPlanningSettings = normalizeCenterPlanningSettings({
    mode:'global',
    curriculum:{ '4º':{ 'Matemáticas':180, 'Lengua Castellana y Literatura':120 } }
  });
  const state = {
    schoolSettings,
    classSchedules:[
      {id:'m1',grupoClase:'4ºA',dia:'lunes',inicio:'09:00',fin:'10:00',materia:'Matemáticas'},
      {id:'m2',grupoClase:'4ºA',dia:'martes',inicio:'09:00',fin:'10:00',materia:'Matemáticas'},
      {id:'m3',grupoClase:'4ºA',dia:'miercoles',inicio:'09:00',fin:'10:00',materia:'Matemáticas'},
      {id:'l1',grupoClase:'4ºA',dia:'jueves',inicio:'09:00',fin:'10:00',materia:'Lengua Castellana y Literatura'},
      {id:'l2',grupoClase:'4ºA',dia:'viernes',inicio:'09:00',fin:'10:00',materia:'Lengua Castellana y Literatura'}
    ]
  };
  const fourth = curriculumCoverage(state, centerPlanningSettings).find(item => item.grupoClase === '4ºA');
  assert.equal(fourth.complete, true);
  assert.equal(fourth.targetTotal, 300);
  assert.equal(fourth.actualTotal, 300);
});

test('detecta que un mismo docente está simultáneamente en dos aulas', () => {
  const professional = {id:'d1',nombre:'Docente Uno',tipo:'DOCENTE'};
  const conflicts = detectConflicts({
    students:[], professionals:[professional], groups:[], sessions:[],
    classSchedules:[
      {id:'c1',grupoClase:'3ºA',materia:'Matemáticas',dia:'lunes',inicio:'09:00',fin:'10:00',professionalId:'d1'},
      {id:'c2',grupoClase:'4ºA',materia:'Lengua Castellana y Literatura',dia:'lunes',inicio:'09:30',fin:'10:30',professionalId:'d1'}
    ]
  });
  assert.ok(conflicts.some(conflict => conflict.type === 'class-teacher-overlap' && conflict.severity === 'grave'));
});

test('detecta choque entre una sesión PT/AL y una clase ordinaria del mismo profesional', () => {
  const professional = {id:'p1',nombre:'PT Uno',tipo:'PT'};
  const group = {id:'g1',nombre:'Grupo PT',tipo:'PT',professionalId:'p1',studentIds:[],activo:true};
  const conflicts = detectConflicts({
    students:[], professionals:[professional], groups:[group],
    sessions:[{id:'s1',groupId:'g1',professionalId:'p1',dia:'martes',inicio:'10:00',fin:'10:45'}],
    classSchedules:[{id:'c1',grupoClase:'2ºA',materia:'Matemáticas',dia:'martes',inicio:'10:30',fin:'11:15',professionalId:'p1'}]
  });
  assert.ok(conflicts.some(conflict => conflict.type === 'support-class-teacher-overlap' && conflict.severity === 'grave'));
});
