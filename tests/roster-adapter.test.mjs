import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRosterPayload } from '../js/roster-adapter.js';

test('maps ordinary students and allows PT plus AL on the same student', () => {
  const state = {
    students:[
      { id:'a1', nombre:'Lucía', apellidos:'García', grupoClase:'4ºA', activo:true, horasPTObjetivoMin:120, horasALObjetivoMin:60, observaciones:'' },
      { id:'a2', nombre:'Pablo', apellidos:'Martín', grupoClase:'4ºA', activo:true, horasPTObjetivoMin:0, horasALObjetivoMin:0, observaciones:'' }
    ],
    groups:[
      { id:'gpt', tipo:'PT', studentIds:['a1'] },
      { id:'gal', tipo:'AL', studentIds:['a1'] }
    ]
  };
  const adapterResult = {
    report:{ mappings:{ classGroups:{ '4ºa':'G-4A' } } }
  };
  const result = buildRosterPayload(state, adapterResult);
  assert.equal(result.report.ready, true);
  assert.equal(result.payload.students.length, 2);
  const lucia = result.payload.students.find(item => item.id === 'a1');
  assert.equal(lucia.group_id, 'G-4A');
  assert.deepEqual(lucia.supports.map(item => item.service), ['PT','AL']);
  assert.deepEqual(lucia.supports.map(item => item.target_minutes), [120,60]);
  const pablo = result.payload.students.find(item => item.id === 'a2');
  assert.deepEqual(pablo.supports, []);
});
