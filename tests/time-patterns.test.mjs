import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dayAllowed,
  effectiveMaxSessionsPerDay,
  effectiveSessionMinutes,
  normalizeSubjectPatterns,
  normalizeTimePattern,
  subjectPatternForCourse,
  timePreferenceScore,
  timeWindowAllows,
  validateTimePattern
} from '../js/time-patterns.js';

test('normaliza patrones temporales y filtra días preferidos fuera de los permitidos', () => {
  const pattern = normalizeTimePattern({
    sessionMinutes:60,
    maxSessionsPerDay:1,
    allowedDays:['lunes','miercoles'],
    preferredDays:['miercoles','viernes'],
    earliestStart:'09:00',
    latestEnd:'12:00'
  });
  assert.deepEqual(pattern.allowedDays, ['lunes','miercoles']);
  assert.deepEqual(pattern.preferredDays, ['miercoles']);
  assert.equal(dayAllowed(pattern, 'lunes'), true);
  assert.equal(dayAllowed(pattern, 'martes'), false);
  assert.equal(effectiveSessionMinutes(pattern, 45), 60);
  assert.equal(effectiveMaxSessionsPerDay(pattern, 2), 1);
  assert.equal(timeWindowAllows(pattern, 540, 600), true);
  assert.equal(timeWindowAllows(pattern, 480, 540), false);
});

test('las preferencias puntúan sin convertirse en restricciones duras', () => {
  const pattern = normalizeTimePattern({
    allowedDays:['lunes','martes'],
    preferredDays:['martes'],
    preferredStart:'10:00',
    preferredEnd:'11:00'
  });
  assert.equal(dayAllowed(pattern, 'lunes'), true);
  assert.ok(timePreferenceScore(pattern, 'martes', 600, 660) > timePreferenceScore(pattern, 'lunes', 540, 600));
});

test('valida ventanas temporales incompatibles', () => {
  assert.throws(() => validateTimePattern({ earliestStart:'12:00', latestEnd:'10:00' }, 'Biblioteca'), /posterior/i);
});

test('normaliza patrones por curso y materia', () => {
  const subjectPatterns = normalizeSubjectPatterns({
    '1º':{
      'Lengua Castellana y Literatura':{ sessionMinutes:60, allowedDays:['lunes','martes'] }
    }
  });
  const pattern = subjectPatternForCourse({ subjectPatterns }, '1º', 'Lengua Castellana y Literatura');
  assert.equal(pattern.sessionMinutes, 60);
  assert.deepEqual(pattern.allowedDays, ['lunes','martes']);
});
