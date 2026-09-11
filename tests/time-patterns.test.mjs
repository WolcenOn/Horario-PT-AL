import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dayAllowed,
  effectiveMaxSessionsPerDay,
  effectiveSessionMinutes,
  normalizeSubjectPatterns,
  normalizeTimePattern,
  planSessionDurations,
  subjectPatternForCourse,
  timePreferenceScore,
  timeWindowAllows,
  validateTimePattern
} from '../js/time-patterns.js';

test('normaliza patrones temporales y filtra días preferidos fuera de los permitidos', () => {
  const pattern = normalizeTimePattern({
    sessionMinutes:60,
    minSessionMinutes:45,
    maxSessionMinutes:75,
    maxSessionsPerDay:1,
    allowedDays:['lunes','miercoles'],
    preferredDays:['miercoles','viernes'],
    earliestStart:'09:00',
    latestEnd:'12:00'
  });
  assert.deepEqual(pattern.allowedDays, ['lunes','miercoles']);
  assert.deepEqual(pattern.preferredDays, ['miercoles']);
  assert.equal(pattern.minSessionMinutes, 45);
  assert.equal(pattern.maxSessionMinutes, 75);
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

test('valida ventanas y rangos de duración incompatibles', () => {
  assert.throws(() => validateTimePattern({ earliestStart:'12:00', latestEnd:'10:00' }, 'Biblioteca'), /posterior/i);
  assert.throws(() => validateTimePattern({ minSessionMinutes:75, maxSessionMinutes:45 }, 'Lengua'), /mínima/i);
  assert.throws(() => validateTimePattern({ sessionMinutes:30, minSessionMinutes:45 }, 'Lengua'), /preferida/i);
  assert.throws(() => validateTimePattern({ sessionMinutes:90, maxSessionMinutes:60 }, 'Lengua'), /preferida/i);
});

test('mantiene el reparto heredado si no se define un rango duro', () => {
  assert.deepEqual(planSessionDurations(150, { sessionMinutes:60 }, 45), [60, 60, 30]);
});

test('redistribuye el resto para respetar mínimo y máximo por materia', () => {
  const durations = planSessionDurations(270, {
    sessionMinutes:60,
    minSessionMinutes:45,
    maxSessionMinutes:60
  }, 45);
  assert.deepEqual(durations, [60, 60, 60, 45, 45]);
  assert.equal(durations.reduce((sum, value) => sum + value, 0), 270);
  assert.ok(durations.every(value => value >= 45 && value <= 60));
});

test('avisa si la carga semanal no puede dividirse dentro del rango configurado', () => {
  assert.throws(() => planSessionDurations(75, {
    sessionMinutes:60,
    minSessionMinutes:45,
    maxSessionMinutes:60
  }, 45), /no puede repartirse/i);
});

test('normaliza patrones por curso y materia', () => {
  const subjectPatterns = normalizeSubjectPatterns({
    '1º':{
      'Lengua Castellana y Literatura':{ sessionMinutes:60, minSessionMinutes:45, maxSessionMinutes:60, allowedDays:['lunes','martes'] }
    }
  });
  const pattern = subjectPatternForCourse({ subjectPatterns }, '1º', 'Lengua Castellana y Literatura');
  assert.equal(pattern.sessionMinutes, 60);
  assert.equal(pattern.minSessionMinutes, 45);
  assert.equal(pattern.maxSessionMinutes, 60);
  assert.deepEqual(pattern.allowedDays, ['lunes','martes']);
});
