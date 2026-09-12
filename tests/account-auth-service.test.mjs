import test from 'node:test';
import assert from 'node:assert/strict';
import {
  changeBackendPassword,
  confirmBackendPasswordReset,
  requestBackendPasswordReset
} from '../js/account-auth-service.js';

function response(status = 204, payload = '') {
  return {
    ok:status >= 200 && status < 300,
    status,
    async text() { return payload ? JSON.stringify(payload) : ''; }
  };
}

test('cambia contraseña usando Bearer y el contrato esperado', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return response();
  };
  try {
    await changeBackendPassword({
      baseUrl:'https://gestor.test',
      accessToken:'session-token'
    }, {
      currentPassword:'old password value',
      newPassword:'new password value'
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://gestor.test/auth/password/change');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer session-token');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      current_password:'old password value',
      new_password:'new password value'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('solicita recuperación sin autenticación y sin exponer diferencias de cuenta', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return response(202, { status:'accepted' });
  };
  try {
    const result = await requestBackendPasswordReset({
      baseUrl:'https://gestor.test/',
      email:' user@example.test '
    });
    assert.deepEqual(result, { status:'accepted' });
    assert.equal(calls[0].url, 'https://gestor.test/auth/password/reset-request');
    assert.equal(calls[0].options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(calls[0].options.body), { email:'user@example.test' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('confirma recuperación con token de un solo uso y contraseña nueva', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url:String(url), options });
    return response();
  };
  try {
    await confirmBackendPasswordReset({
      baseUrl:'https://gestor.test',
      token:'reset-token-with-enough-length',
      newPassword:'replacement password'
    });
    assert.equal(calls[0].url, 'https://gestor.test/auth/password/reset-confirm');
    assert.deepEqual(JSON.parse(calls[0].options.body), {
      token:'reset-token-with-enough-length',
      new_password:'replacement password'
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rechaza contraseñas nuevas demasiado cortas antes de llamar a la API', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return response();
  };
  try {
    await assert.rejects(
      changeBackendPassword(
        { baseUrl:'https://gestor.test', accessToken:'token' },
        { currentPassword:'old password', newPassword:'short' }
      ),
      /al menos 10 caracteres/
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
