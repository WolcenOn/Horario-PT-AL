import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bootstrapBackendConnection,
  createAcademicYear,
  createPlanningScenario,
  DEFAULT_BACKEND_SETTINGS,
  listAcademicYears,
  listPlanningScenarios,
  normalizeBackendSettings
} from '../js/backend-service.js';

test('usa Railway como backend predeterminado sin activar la conexión', () => {
  assert.equal(DEFAULT_BACKEND_SETTINGS.enabled, false);
  assert.equal(DEFAULT_BACKEND_SETTINGS.baseUrl, 'https://gestorescuela-production.up.railway.app');
  assert.equal(DEFAULT_BACKEND_SETTINGS.academicYearId, '');
  assert.equal(DEFAULT_BACKEND_SETTINGS.scenarioId, '');
});

test('normaliza el contexto de curso académico y escenario', () => {
  const settings = normalizeBackendSettings({
    enabled:true,
    baseUrl:'https://example.test/',
    schoolId:' school ',
    actorId:' actor ',
    academicYearId:' year ',
    scenarioId:' scenario '
  });
  assert.equal(settings.baseUrl, 'https://example.test');
  assert.equal(settings.schoolId, 'school');
  assert.equal(settings.actorId, 'actor');
  assert.equal(settings.academicYearId, 'year');
  assert.equal(settings.scenarioId, 'scenario');
});

test('bootstrap crea usuario, centro y membresía ADMIN y devuelve los UUID', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const responses = [
    { id:'11111111-1111-1111-1111-111111111111', email:'admin@centro.es', display_name:'Admin' },
    { id:'22222222-2222-2222-2222-222222222222', name:'CEIP Prueba' },
    { id:'33333333-3333-3333-3333-333333333333', school_id:'22222222-2222-2222-2222-222222222222', user_id:'11111111-1111-1111-1111-111111111111', role:'ADMIN' }
  ];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    const payload = responses[calls.length - 1];
    return {
      ok:true,
      status:200,
      async text() { return JSON.stringify(payload); }
    };
  };

  try {
    const result = await bootstrapBackendConnection({
      baseUrl:'https://gestorescuela-production.up.railway.app/',
      schoolName:'CEIP Prueba',
      email:'admin@centro.es',
      displayName:'Admin'
    });

    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /\/users$/);
    assert.match(calls[1].url, /\/schools$/);
    assert.match(calls[2].url, /\/schools\/22222222-2222-2222-2222-222222222222\/memberships$/);
    assert.equal(calls[0].options.headers['X-Actor-Role'], 'ADMIN');
    assert.equal(calls[2].options.headers['X-Actor-Role'], 'ADMIN');
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      user_id:'11111111-1111-1111-1111-111111111111',
      role:'ADMIN'
    });
    assert.equal(result.settings.enabled, true);
    assert.equal(result.settings.schoolId, '22222222-2222-2222-2222-222222222222');
    assert.equal(result.settings.actorId, '11111111-1111-1111-1111-111111111111');
    assert.equal(result.settings.academicYearId, '');
    assert.equal(result.settings.scenarioId, '');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('gestiona cursos académicos y escenarios usando el actor configurado', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const settings = normalizeBackendSettings({
    enabled:true,
    baseUrl:'https://example.test',
    schoolId:'school-1',
    actorId:'actor-1',
    academicYearId:'year-1'
  });
  const responses = [
    [{ id:'year-1', label:'2026/27' }],
    { id:'year-2', label:'2027/28' },
    [{ id:'scenario-1', name:'Borrador', status:'DRAFT' }],
    { id:'scenario-2', name:'Alternativa', status:'DRAFT' }
  ];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return {
      ok:true,
      status:200,
      async text() { return JSON.stringify(responses[calls.length - 1]); }
    };
  };

  try {
    await listAcademicYears(settings);
    await createAcademicYear(settings, { label:'2027/28' });
    await listPlanningScenarios(settings);
    await createPlanningScenario(settings, 'year-1', { name:'Alternativa' });

    assert.equal(calls.length, 4);
    assert.match(calls[0].url, /\/schools\/school-1\/academic-years$/);
    assert.match(calls[2].url, /\/academic-years\/year-1\/scenarios$/);
    assert.equal(calls[0].options.headers['X-Actor-Id'], 'actor-1');
    assert.equal(calls[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[1].options.body), { label:'2027/28' });
    assert.equal(calls[3].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[3].options.body), { name:'Alternativa' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
