import test from 'node:test';
import assert from 'node:assert/strict';

import { parseStudentList } from '../js/class-rosters.js';
import { studentServiceKey, studentServices } from '../js/student-services.js';

test('bulk roster parser accepts common pasted formats', () => {
  const parsed = parseStudentList('García López, Ana\nPablo\tMartín Ruiz\nLucía;Santos Pérez');
  assert.deepEqual(parsed, [
    { nombre:'Ana', apellidos:'García López' },
    { nombre:'Pablo', apellidos:'Martín Ruiz' },
    { nombre:'Lucía', apellidos:'Santos Pérez' }
  ]);
});

test('ordinary pupils can coexist with PT, AL or both without duplicate records', () => {
  const ordinary = { id:'a', horasPTObjetivoMin:0, horasALObjetivoMin:0 };
  const pt = { id:'b', horasPTObjetivoMin:60, horasALObjetivoMin:0 };
  const both = { id:'c', horasPTObjetivoMin:60, horasALObjetivoMin:30 };
  const groupedAl = { id:'d', horasPTObjetivoMin:0, horasALObjetivoMin:0 };
  const groups = [{ id:'g', tipo:'AL', studentIds:['d'] }];

  assert.equal(studentServiceKey(ordinary, groups), 'NONE');
  assert.deepEqual(studentServices(pt, groups), ['PT']);
  assert.equal(studentServiceKey(both, groups), 'PT+AL');
  assert.deepEqual(studentServices(groupedAl, groups), ['AL']);
});
