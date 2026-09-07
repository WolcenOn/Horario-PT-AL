import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapBackendConnection, DEFAULT_BACKEND_SETTINGS } from '../js/backend-service.js';

test('usa Railway como backend predeterminado sin activar la conexión', () => {
  assert.equal(DEFAULT_BACKEND_SETTINGS.enabled, false);
  assert.equal(DEFAULT_BACKEND_SETTINGS.baseUrl, 'https://gestorescuela-production.up.railway.app');
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});
