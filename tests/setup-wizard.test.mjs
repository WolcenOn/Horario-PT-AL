import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSetupWizardProgress } from '../js/setup-wizard.js';

function emptyState() {
  return {
    students:[],
    professionals:[],
    groups:[],
    sessions:[],
    classSchedules:[],
    schoolSettings:null,
    automationSettings:null,
    centerPlanningSettings:null
  };
}

test('el asistente empieza en cero y guía primero a la estructura del centro', () => {
  const progress = buildSetupWizardProgress(emptyState());
  assert.equal(progress.essentialCompleted, 0);
  assert.equal(progress.essentialTotal, 4);
  assert.equal(progress.globalReady, false);
  assert.equal(progress.nextEssential.id, 'structure');
  assert.equal(progress.nextEssential.target, 'classRosters');
});

test('la fase PT/AL no bloquea la configuración esencial', () => {
  const progress = buildSetupWizardProgress(emptyState());
  const support = progress.steps.find(step => step.id === 'support');
  const generate = progress.steps.find(step => step.id === 'generate');
  assert.equal(support.ok, false);
  assert.match(support.description, /no es necesaria para generar el horario ordinario/i);
  assert.equal(generate.phase, 'essential');
});

test('detecta un horario existente y cambia el paso final al ciclo de revisión y recálculo', () => {
  const state = emptyState();
  state.classSchedules = [{
    id:'class-1',
    grupoClase:'1ºA',
    materia:'Lengua Castellana y Literatura',
    dia:'lunes',
    inicio:'09:00',
    fin:'10:00'
  }];
  const progress = buildSetupWizardProgress(state);
  const generate = progress.steps.find(step => step.id === 'generate');
  assert.equal(progress.ordinarySchedulePresent, true);
  assert.equal(generate.title, 'Revisar y recalcular el horario');
  assert.match(generate.description, /horario actual se conserva/i);
});
