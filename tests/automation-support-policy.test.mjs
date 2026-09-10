import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAutomaticProposal, normalizeAutomationSettings } from '../js/automation-core.js';

const days = ['lunes','martes','miercoles','jueves','viernes'];

function stateFor(type) {
  const professional = {
    id:`prof-${type}`,
    nombre:type,
    tipo:type,
    activo:true,
    disponibilidad:Object.fromEntries(days.map(day => [day, [{ inicio:'09:00', fin:'10:00' }]]))
  };
  const student = { id:'s1', nombre:'Alumno', curso:'4º', grupoClase:'4ºA', activo:true, restricciones:[] };
  const group = { id:`g-${type}`, nombre:`${type} 4ºA`, tipo:type, professionalId:professional.id, studentIds:[student.id], activo:true };
  const classSchedules = days.map((day, index) => ({
    id:`c${index}`,
    grupoClase:'4ºA',
    dia:day,
    inicio:'09:00',
    fin:'10:00',
    materia:'Lengua'
  }));
  const allowedWindows = Object.fromEntries(days.map(day => [day, { inicio:'09:00', fin:'10:00' }]));
  const automationSettings = {
    id:'automation',
    courseRules:{
      '4º':{
        confirmed:true,
        allowedWindows,
        subjectPriorities:{ Lengua:'medium' },
        subjectPolicies:{ Lengua:{ extraction:'pt' } }
      }
    }
  };

  return {
    students:[student],
    professionals:[professional],
    groups:[group],
    sessions:[{ id:`ses-${type}`, groupId:group.id, professionalId:professional.id, dia:'lunes', inicio:'09:00', fin:'09:30' }],
    classSchedules,
    schoolSettings:{
      id:'school',
      structure:{ configured:true, defaultLines:1, courseLines:{} },
      recesses:{ infantil:{ inicio:'10:30', fin:'11:00' }, primaria:{ inicio:'11:00', fin:'11:30' } }
    },
    automationSettings
  };
}

test('la normalización conserva la regla dura de extracción junto a la prioridad antigua', () => {
  const normalized = normalizeAutomationSettings(stateFor('PT').automationSettings);
  assert.equal(normalized.courseRules['4º'].subjectPriorities.Lengua, 'medium');
  assert.deepEqual(normalized.courseRules['4º'].subjectPolicies.Lengua, { extraction:'pt' });
});

test('una materia configurada como solo PT admite PT pero no AL', () => {
  const ptState = stateFor('PT');
  const ptProposal = generateAutomaticProposal(ptState, ptState.automationSettings);
  assert.equal(ptProposal.ok, true);

  const alState = stateFor('AL');
  const alProposal = generateAutomaticProposal(alState, alState.automationSettings);
  assert.equal(alProposal.ok, false);
  assert.equal(alProposal.unresolved.length, 1);
  assert.equal(alProposal.unresolved[0].candidateCount, 0);
});
