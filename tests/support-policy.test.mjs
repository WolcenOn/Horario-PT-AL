import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canExtractForSupport,
  describeSupportPolicy,
  normalizeSupportPolicy,
  supportPolicyFromLegacyPriority,
  supportPreferenceScore
} from '../js/support-policy.js';

test('mantiene compatibilidad con prioridades PT AL antiguas', () => {
  assert.deepEqual(supportPolicyFromLegacyPriority('low'), {
    extraction:'ptal',
    preference:'preferred'
  });
  assert.equal(canExtractForSupport('low', 'PT'), true);
  assert.equal(canExtractForSupport('low', 'AL'), true);
  assert.equal(supportPreferenceScore('low'), 30);
  assert.equal(supportPreferenceScore('high'), -45);
});

test('blocked sigue siendo una restriccion dura para ambos apoyos', () => {
  assert.equal(canExtractForSupport('blocked', 'PT'), false);
  assert.equal(canExtractForSupport('blocked', 'AL'), false);
  assert.equal(supportPreferenceScore('blocked'), null);
});

test('el modelo nuevo puede permitir PT y bloquear AL en una misma materia', () => {
  const policy = normalizeSupportPolicy({ extraction:'pt', preference:'avoid' });
  assert.equal(canExtractForSupport(policy, 'PT'), true);
  assert.equal(canExtractForSupport(policy, 'AL'), false);
  assert.equal(supportPreferenceScore(policy), -45);
  assert.equal(describeSupportPolicy(policy), 'Solo PT · mejor evitar');
});

test('una preferencia no altera por si sola la compatibilidad dura', () => {
  assert.equal(canExtractForSupport({ extraction:'ptal', preference:'preferred' }, 'AL'), true);
  assert.equal(canExtractForSupport({ extraction:'ptal', preference:'avoid' }, 'AL'), true);
});
