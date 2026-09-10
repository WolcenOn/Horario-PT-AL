import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharePackage, validateSharePackage } from '../js/sharing.js';

const DAYS = ['lunes','martes','miercoles','jueves','viernes'];

function stateWithSupportPolicy() {
  return {
    students:[],
    professionals:[],
    groups:[],
    sessions:[],
    classSchedules:[],
    schoolSettings:null,
    centerPlanningSettings:null,
    automationSettings:{
      id:'automation',
      courseRules:{
        '4º':{
          confirmed:true,
          allowedWindows:Object.fromEntries(DAYS.map(day => [day, { inicio:'09:00', fin:'14:00' }])),
          subjectPriorities:{ Lengua:'high' },
          subjectPolicies:{ Lengua:{ extraction:'pt' } }
        }
      }
    }
  };
}

test('exportar e importar conserva por separado extracción y preferencia PT/AL', () => {
  const shared = createSharePackage(stateWithSupportPolicy());

  assert.equal(shared.data.automationSettings.courseRules['4º'].subjectPolicies.Lengua.extraction, 'pt');
  assert.equal(shared.data.automationSettings.courseRules['4º'].subjectPriorities.Lengua, 'high');

  const restored = validateSharePackage(shared);
  assert.deepEqual(restored.automationSettings.courseRules['4º'].subjectPolicies.Lengua, { extraction:'pt' });
  assert.equal(restored.automationSettings.courseRules['4º'].subjectPriorities.Lengua, 'high');
});
