import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeGlobalDistributionLimits } from '../js/global-recovery.js';

function settings(minutes = 480, maxSameSubjectPerDay = 3) {
  return {
    id:'centerPlanning',
    mode:'global',
    generation:{ start:'09:00', end:'14:00', lessonMinutes:30, stepMinutes:15, maxSameSubjectPerDay },
    curriculum:{
      'Infantil 3 años':{
        'Comunicación y Representación de la Realidad':minutes
      }
    },
    subjectPatterns:{},
    weeklyActivities:[]
  };
}

test('detecta que 480 minutos no caben en bloques de 30 con máximo 3 al día', () => {
  const result = analyzeGlobalDistributionLimits(settings());
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].blockCount, 16);
  assert.equal(result.issues[0].capacityBlocks, 15);
  assert.equal(result.issues[0].minimumPerDay, 4);
  assert.equal(result.suggestedGlobalMax, 4);
  assert.equal(result.canFixWithGlobalMax, true);
});

test('450 minutos sí caben con máximo 3 al día', () => {
  const result = analyzeGlobalDistributionLimits(settings(450));
  assert.equal(result.issues.length, 0);
  assert.equal(result.suggestedGlobalMax, 3);
});

test('respeta un máximo específico de materia como restricción explícita', () => {
  const value = settings();
  value.subjectPatterns = {
    'Infantil 3 años':{
      'Comunicación y Representación de la Realidad':{ sessionMinutes:30, maxSessionsPerDay:3 }
    }
  };
  const result = analyzeGlobalDistributionLimits(value);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].explicitSubjectMax, true);
  assert.equal(result.canFixWithGlobalMax, false);
});
