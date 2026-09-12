import { normalizeBackendSettings } from './backend-service.js';

export async function changeBackendPassword(settings, { currentPassword, newPassword }) {
  const value = requireBearer(settings);
  const current_password = String(currentPassword || '');
  const new_password = String(newPassword || '');
  if (!current_password) throw new Error('Indica tu contraseña actual.');
  validateNewPassword(new_password);
  return request(value, '/auth/password/change', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ current_password, new_password })
  });
}

export async function requestBackendPasswordReset({ baseUrl, email }) {
  const value = normalizeBackendSettings({ baseUrl });
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Indica tu correo electrónico.');
  return request(value, '/auth/password/reset-request', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ email:cleanEmail }),
    auth:false
  });
}

export async function confirmBackendPasswordReset({ baseUrl, token, newPassword }) {
  const value = normalizeBackendSettings({ baseUrl });
  const cleanToken = String(token || '').trim();
  const new_password = String(newPassword || '');
  if (!cleanToken) throw new Error('El enlace de recuperación no contiene un token válido.');
  validateNewPassword(new_password);
  return request(value, '/auth/password/reset-confirm', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ token:cleanToken, new_password }),
    auth:false
  });
}

function validateNewPassword(value) {
  if (value.length < 10) throw new Error('La contraseña nueva debe tener al menos 10 caracteres.');
}

function requireBearer(settings) {
  const value = normalizeBackendSettings(settings);
  if (!value.baseUrl) throw new Error('Falta la URL del backend GestorEscuela.');
  if (!value.accessToken) throw new Error('Inicia sesión en GestorEscuela.');
  return value;
}

async function request(settings, path, options = {}) {
  const { auth = true, headers = {}, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const authHeaders = auth ? { Authorization:`Bearer ${settings.accessToken}` } : {};
    const response = await fetch(`${settings.baseUrl}${path}`, {
      ...fetchOptions,
      headers:{ ...authHeaders, ...headers },
      signal:controller.signal
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' ? payload.detail : payload;
      const error = new Error(detail || `GestorEscuela respondió con HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('GestorEscuela no respondió dentro del tiempo esperado.');
    if (error instanceof TypeError) throw new Error('No se pudo conectar con GestorEscuela. Revisa URL, CORS y disponibilidad del servidor.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
