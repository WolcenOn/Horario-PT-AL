import test from 'node:test';
import assert from 'node:assert/strict';
import {
  backendConfigured,
  backendSettingsFromAuth,
  fetchCurrentAuth,
  listAcademicYears,
  loginBackend,
  logoutBackend,
  normalizeBackendSettings,
  registerSchoolBackend
} from '../js/backend-service.js';

function jsonResponse(payload, status = 200) {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() { return payload == null ? '' : JSON.stringify(payload); }
  };
}

test('una sesión Bearer configura el backend sin necesitar Actor ID', () => {
  const settings = backendSettingsFromAuth(
    { enabled:false, baseUrl:'https://example.test', actorId:'legacy-user' },
    {
      access_token:'token-123',
      memberships:[{ school_id:'school-1', user_id:'user-1', role:'ADMIN' }],
      user:{ id:'user-1', email:'admin@centro.es', display_name:'Admin' }
    }
  );

  assert.equal(settings.enabled, true);
  assert.equal(settings.schoolId, 'school-1');
  assert.equal(settings.actorId, '');
  assert.equal(settings.accessToken, 'token-123');
  assert.equal(backendConfigured(settings), true);
});

test('una sesión Bearer no conserva un centro ajeno a sus membresías', () => {
  const auth = {
    access_token:'token-multi',
    memberships:[
      { school_id:'school-1', user_id:'user-1', role:'ADMIN' },
      { school_id:'school-2', user_id:'user-1', role:'PLANNER' }
    ],
    school:null,
    user:{ id:'user-1', email:'admin@centro.es', display_name:'Admin' }
  };

  const stale = backendSettingsFromAuth(
    { enabled:true, baseUrl:'https://example.test', schoolId:'school-old' },
    auth
  );
  assert.equal(stale.schoolId, '');
  assert.equal(backendConfigured(stale), false);

  const validStored = backendSettingsFromAuth(
    { enabled:true, baseUrl:'https://example.test', schoolId:'school-2' },
    auth
  );
  assert.equal(validStored.schoolId, 'school-2');

  const explicitlySelected = backendSettingsFromAuth(
    { enabled:true, baseUrl:'https://example.test', schoolId:'school-2' },
    auth,
    { schoolId:'school-1' }
  );
  assert.equal(explicitlySelected.schoolId, 'school-1');
});

test('Bearer tiene prioridad sobre X-Actor-Id en peticiones académicas', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return jsonResponse([]);
  };

  try {
    const settings = normalizeBackendSettings({
      enabled:true,
      baseUrl:'https://example.test/',
      schoolId:'school-1',
      actorId:'legacy-user',
      accessToken:'signed-session-token'
    });
    await listAcademicYears(settings);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Bearer signed-session-token');
    assert.equal(calls[0].options.headers['X-Actor-Id'], undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('login, auth/me y logout usan los endpoints Bearer del backend', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const auth = {
    access_token:'token-login',
    token_type:'bearer',
    expires_at:'2026-09-11T08:00:00Z',
    user:{ id:'user-1', email:'admin@centro.es', display_name:'Admin' },
    memberships:[{ school_id:'school-1', user_id:'user-1', role:'ADMIN' }],
    school:null
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    if (String(url).endsWith('/auth/login')) return jsonResponse(auth);
    if (String(url).endsWith('/auth/me')) return jsonResponse({ ...auth, access_token:'' });
    if (String(url).endsWith('/auth/logout')) return jsonResponse(null, 204);
    return jsonResponse({ detail:'not found' }, 404);
  };

  try {
    const loggedIn = await loginBackend({
      baseUrl:'https://example.test/',
      email:' admin@centro.es ',
      password:'password-segura'
    });
    assert.equal(loggedIn.access_token, 'token-login');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      email:'admin@centro.es',
      password:'password-segura'
    });
    assert.equal(calls[0].options.headers.Authorization, undefined);

    const settings = backendSettingsFromAuth({ baseUrl:'https://example.test' }, loggedIn);
    const current = await fetchCurrentAuth(settings);
    assert.equal(current.user.email, 'admin@centro.es');
    assert.equal(calls[1].options.headers.Authorization, 'Bearer token-login');

    await logoutBackend(settings);
    assert.equal(calls[2].options.method, 'POST');
    assert.equal(calls[2].options.headers.Authorization, 'Bearer token-login');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registro de centro usa /auth/register-school y exige contraseña suficiente', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return jsonResponse({
      access_token:'token-register',
      memberships:[{ school_id:'school-new', user_id:'user-new', role:'ADMIN' }],
      school:{ id:'school-new', name:'CEIP Nuevo' },
      user:{ id:'user-new', email:'direccion@centro.es', display_name:'Dirección' }
    }, 201);
  };

  try {
    const auth = await registerSchoolBackend({
      baseUrl:'https://example.test',
      email:'direccion@centro.es',
      password:'1234567890segura',
      displayName:'Dirección',
      schoolName:'CEIP Nuevo'
    });
    assert.equal(auth.school.id, 'school-new');
    assert.match(calls[0].url, /\/auth\/register-school$/);
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      email:'direccion@centro.es',
      password:'1234567890segura',
      display_name:'Dirección',
      school_name:'CEIP Nuevo'
    });
    assert.equal(calls[0].options.headers.Authorization, undefined);

    await assert.rejects(
      registerSchoolBackend({
        baseUrl:'https://example.test',
        email:'direccion@centro.es',
        password:'corta',
        displayName:'Dirección',
        schoolName:'CEIP Nuevo'
      }),
      /al menos 10 caracteres/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
