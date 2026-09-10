import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_CONFIG_SCHEMA,
  buildAiCenterConfigurationContext,
  buildAiCenterConfigurationPrompt
} from '../js/ai-config-prompt.js';

const state = {
  schoolSettings:{ lineas:{ '1º':1 } },
  centerPlanningSettings:{ mode:'global', generation:{ start:'09:00', end:'14:00' } },
  automationSettings:{
    id:'automation',
    courseRules:{
      '1º':{
        confirmed:true,
        subjectPriorities:{ Matemáticas:'high' },
        subjectPolicies:{ Matemáticas:{ extraction:'pt' } }
      }
    }
  },
  professionals:[{
    id:'prof-secret',
    nombre:'Ana Profesora',
    email:'ana@centro.example',
    tipo:'PT',
    especialidad:'Pedagogía terapéutica',
    tutoriaGrupo:'1ºA',
    activo:true,
    disponibilidad:{ lunes:[{ inicio:'09:00', fin:'14:00' }] }
  }],
  students:[{
    id:'student-secret',
    nombre:'Alumno Secreto',
    diagnostico:'Dato que no debe salir',
    curso:'1º',
    grupoClase:'1ºA',
    horasPTObjetivoMin:90,
    horasALObjetivoMin:0,
    activo:true
  }],
  groups:[{
    id:'group-secret',
    nombre:'Grupo de Alumno Secreto',
    tipo:'PT',
    professionalId:'prof-secret',
    studentIds:['student-secret'],
    activo:true
  }],
  classSchedules:[],
  sessions:[]
};

test('el contexto para IA anonimiza personas y conserva restricciones útiles', () => {
  const context = buildAiCenterConfigurationContext(state);
  assert.equal(context.professionals[0].alias, 'PROF_1');
  assert.equal(context.professionals[0].tipo, 'PT');
  assert.equal(context.students[0].alias, 'ALUMNO_1');
  assert.equal(context.students[0].horasPTObjetivoMin, 90);
  assert.equal(context.supportGroups[0].professional, 'PROF_1');
  assert.deepEqual(context.supportGroups[0].students, ['ALUMNO_1']);
  assert.equal(context.supportRules.courseRules['1º'].subjectPriorities.Matemáticas, 'high');
  assert.equal(context.supportRules.courseRules['1º'].subjectPolicies.Matemáticas.extraction, 'pt');
});

test('el prompt no expone nombres, correo ni diagnóstico del ejemplo', () => {
  const prompt = buildAiCenterConfigurationPrompt(state);
  assert.equal(prompt.includes('Ana Profesora'), false);
  assert.equal(prompt.includes('ana@centro.example'), false);
  assert.equal(prompt.includes('Alumno Secreto'), false);
  assert.equal(prompt.includes('Dato que no debe salir'), false);
  assert.equal(prompt.includes(AI_CONFIG_SCHEMA), true);
  assert.equal(prompt.includes('No des de alta un centro nuevo'), true);
  assert.equal(prompt.includes('Devuelve JSON válido'), true);
  assert.equal(prompt.includes('subjectPolicies'), true);
  assert.equal(prompt.includes('subjectPriorities'), true);
});
