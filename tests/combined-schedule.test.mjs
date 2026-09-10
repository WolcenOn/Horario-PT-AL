import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCombinedScheduleProjection } from '../js/combined-schedule.js';

function baseState() {
  return {
    automationSettings:{
      courseRules:{
        '4º':{
          subjectPriorities:{
            Matemáticas:'low',
            'Educación Física':'blocked',
            Lengua:'high'
          },
          subjectPolicies:{
            Lengua:{ extraction:'pt' }
          }
        }
      }
    },
    classSchedules:[
      { id:'math', grupoClase:'4ºA', dia:'lunes', inicio:'09:00', fin:'10:00', materia:'Matemáticas' },
      { id:'ef', grupoClase:'4ºA', dia:'lunes', inicio:'10:00', fin:'11:00', materia:'Educación Física' },
      { id:'lengua', grupoClase:'4ºA', dia:'martes', inicio:'09:00', fin:'10:00', materia:'Lengua' }
    ],
    professionals:[
      { id:'pt-1', nombre:'PT Uno', tipo:'PT' },
      { id:'al-1', nombre:'AL Uno', tipo:'AL' }
    ],
    students:[
      { id:'s1', nombre:'Alumno 1', curso:'4º', grupoClase:'4ºA' },
      { id:'s2', nombre:'Alumno 2', curso:'4º', grupoClase:'4ºA' }
    ],
    groups:[
      { id:'gpt', nombre:'PT 4º', tipo:'PT', professionalId:'pt-1', studentIds:['s1'] },
      { id:'gal', nombre:'AL 4º', tipo:'AL', professionalId:'al-1', studentIds:['s2'] }
    ],
    sessions:[]
  };
}

test('la vista combinada permite solapar apoyo con una materia extraíble', () => {
  const state = baseState();
  state.sessions = [{ id:'sp1', groupId:'gpt', dia:'lunes', inicio:'09:15', fin:'09:45' }];

  const projection = buildCombinedScheduleProjection(state);
  assert.equal(projection.supportItems.length, 1);
  assert.equal(projection.supportItems[0].status, 'ok');
  assert.equal(projection.supportItems[0].studentChecks[0].sources[0].entry.materia, 'Matemáticas');
  assert.equal(projection.supportItems[0].studentChecks[0].sources[0].allowed, true);
});

test('marca como bloqueada una extracción sobre una materia no extraíble', () => {
  const state = baseState();
  state.sessions = [{ id:'sp1', groupId:'gpt', dia:'lunes', inicio:'10:15', fin:'10:45' }];

  const projection = buildCombinedScheduleProjection(state);
  assert.equal(projection.supportItems[0].status, 'blocked');
  assert.equal(projection.counts.blocked, 1);
  assert.equal(projection.supportItems[0].studentChecks[0].sources[0].allowed, false);
});

test('distingue tipo de apoyo con una regla dura y conserva la preferencia aparte', () => {
  const ptState = baseState();
  ptState.sessions = [{ id:'sp1', groupId:'gpt', dia:'martes', inicio:'09:10', fin:'09:40' }];
  const ptSource = buildCombinedScheduleProjection(ptState).supportItems[0].studentChecks[0].sources[0];
  assert.equal(ptSource.allowed, true);
  assert.equal(ptSource.policy.preference, 'avoid');
  assert.equal(ptSource.status, 'warning');

  const alState = baseState();
  alState.groups[1].studentIds = ['s1'];
  alState.sessions = [{ id:'sa1', groupId:'gal', dia:'martes', inicio:'09:10', fin:'09:40' }];
  const alSource = buildCombinedScheduleProjection(alState).supportItems[0].studentChecks[0].sources[0];
  assert.equal(alSource.allowed, false);
  assert.equal(alSource.policy.preference, 'avoid');
});

test('bloquea solapes de apoyo cuando comparten alumno aunque PT y AL sean profesionales distintos', () => {
  const state = baseState();
  state.groups[1].studentIds = ['s1'];
  state.sessions = [
    { id:'sp1', groupId:'gpt', dia:'lunes', inicio:'09:00', fin:'09:30' },
    { id:'sa1', groupId:'gal', dia:'lunes', inicio:'09:15', fin:'09:45' }
  ];

  const projection = buildCombinedScheduleProjection(state);
  assert.equal(projection.supportItems[0].status, 'blocked');
  assert.equal(projection.supportItems[1].status, 'blocked');
  assert.deepEqual(projection.supportItems[0].overlaps[0].sharedStudents, ['s1']);
});
