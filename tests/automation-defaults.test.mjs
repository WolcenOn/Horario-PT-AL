import test from 'node:test';
import assert from 'node:assert/strict';
import { courseRuleDraft, normalizeAutomationSettings, subjectsForCourse } from '../js/automation-core.js';

const days = ['lunes','martes','miercoles','jueves','viernes'];

function baseState() {
  return {
    students:[{ id:'alu-1', curso:'1º', grupoClase:'1ºA', activo:true }],
    groups:[{ id:'grp-1', tipo:'PT', studentIds:['alu-1'], activo:true }],
    sessions:[],
    classSchedules:[],
    centerPlanningSettings:{
      mode:'global',
      generation:{ start:'09:00', end:'14:00' },
      curriculum:{
        '1º':{
          'Lengua Castellana y Literatura':300,
          'Matemáticas':300
        }
      }
    }
  };
}

test('detecta materias desde el currículo aunque el horario ordinario esté vacío', () => {
  const state = baseState();
  assert.deepEqual(subjectsForCourse(state, '1º'), [
    'Lengua Castellana y Literatura',
    'Matemáticas'
  ]);
});

test('las reglas nuevas heredan la jornada del centro en todos los días', () => {
  const state = baseState();
  const draft = courseRuleDraft(state, { id:'automation', courseRules:{} }, '1º');
  assert.equal(draft.windowMode, 'center');
  for (const day of days) {
    assert.deepEqual(draft.allowedWindows[day], { inicio:'09:00', fin:'14:00' });
  }
  assert.equal(draft.subjectPriorities['Lengua Castellana y Literatura'], 'medium');
  assert.equal(draft.subjectPriorities.Matemáticas, 'medium');
});

test('el horario ordinario no duplica la jornada cuando la regla hereda del centro', () => {
  const state = baseState();
  state.classSchedules = [
    { id:'c1', grupoClase:'1ºA', dia:'lunes', materia:'Matemáticas', inicio:'10:00', fin:'11:00' },
    { id:'c2', grupoClase:'1ºA', dia:'lunes', materia:'Lengua Castellana y Literatura', inicio:'12:00', fin:'13:30' }
  ];
  const draft = courseRuleDraft(state, { id:'automation', courseRules:{} }, '1º');
  assert.equal(draft.windowMode, 'center');
  assert.deepEqual(draft.allowedWindows.lunes, { inicio:'09:00', fin:'14:00' });
});

test('una regla antigua con franjas guardadas se conserva como personalizada', () => {
  const state = baseState();
  const settings = normalizeAutomationSettings({
    id:'automation',
    courseRules:{
      '1º':{
        confirmed:true,
        allowedWindows:Object.fromEntries(days.map(day => [day, { inicio:'10:00', fin:'13:00' }])),
        subjectPriorities:{ Matemáticas:'medium' }
      }
    }
  });

  assert.equal(settings.courseRules['1º'].windowMode, 'custom');
  const draft = courseRuleDraft(state, settings, '1º');
  assert.deepEqual(draft.allowedWindows.lunes, { inicio:'10:00', fin:'13:00' });
});

test('una regla vinculada al centro sigue los cambios de jornada sin copiar horarios', () => {
  const state = baseState();
  const settings = normalizeAutomationSettings({
    id:'automation',
    courseRules:{
      '1º':{
        confirmed:true,
        windowMode:'center',
        allowedWindows:Object.fromEntries(days.map(day => [day, { inicio:'09:00', fin:'14:00' }])),
        subjectPriorities:{ Matemáticas:'medium' }
      }
    }
  });

  state.centerPlanningSettings.generation = { start:'08:30', end:'13:30' };
  const draft = courseRuleDraft(state, settings, '1º');
  assert.equal(draft.windowMode, 'center');
  assert.deepEqual(draft.allowedWindows.martes, { inicio:'08:30', fin:'13:30' });
});
