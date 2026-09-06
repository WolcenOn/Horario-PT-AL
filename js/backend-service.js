const STORAGE_KEY = 'horario-gestor-escuela-backend';

export const DEFAULT_BACKEND_SETTINGS = Object.freeze({
  enabled:false,
  baseUrl:'https://gestorescuela-production.up.railway.app',
  schoolId:'',
  actorId:'',
  autoSync:false
});

export function loadBackendSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return normalizeBackendSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_BACKEND_SETTINGS };
  }
}

export function saveBackendSettings(value) {
  const normalized = normalizeBackendSettings(value);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function normalizeBackendSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled:source.enabled === true,
    baseUrl:normalizeBaseUrl(source.baseUrl || DEFAULT_BACKEND_SETTINGS.baseUrl),
    schoolId:String(source.schoolId || '').trim(),
    actorId:String(source.actorId || '').trim(),
    autoSync:source.autoSync === true
  };
}

export function backendConfigured(settings) {
  const value = normalizeBackendSettings(settings);
  return Boolean(value.enabled && value.baseUrl && value.schoolId && value.actorId);
}

export async function checkBackendHealth(settings, { timeoutMs = 8000 } = {}) {
  const value = normalizeBackendSettings(settings);
  if (!value.baseUrl) throw new Error('Indica la URL del backend GestorEscuela.');
  return request(value, '/health', { timeoutMs, auth:false });
}

export async function pushAcademicConfiguration(settings, configuration) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-configuration`, {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(configuration),
    timeoutMs:20000
  });
}

export async function fetchAcademicConfiguration(settings) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-configuration`, { timeoutMs:15000 });
}

export async function listDayPlans(settings, planDate) {
  const value = requireConfigured(settings);
  const query = planDate ? `?plan_date=${encodeURIComponent(planDate)}` : '';
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans${query}`, { timeoutMs:15000 });
}

export async function createDayPlan(settings, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload),
    timeoutMs:15000
  });
}

export async function solveAcademicDay(settings, planId, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans/${encodeURIComponent(planId)}/solve-academic`, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload),
    timeoutMs:20000
  });
}

function requireConfigured(settings) {
  const value = normalizeBackendSettings(settings);
  if (!value.enabled) throw new Error('La conexión con GestorEscuela está desactivada.');
  if (!value.baseUrl) throw new Error('Falta la URL del backend GestorEscuela.');
  if (!value.schoolId) throw new Error('Falta el ID del centro en GestorEscuela.');
  if (!value.actorId) throw new Error('Falta el ID de usuario (Actor ID) de GestorEscuela.');
  return value;
}

async function request(settings, path, options = {}) {
  const { timeoutMs = 10000, auth = true, headers = {}, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      ...fetchOptions,
      headers:{
        ...(auth && settings.actorId ? { 'X-Actor-Id':settings.actorId } : {}),
        ...headers
      },
      signal:controller.signal
    });
    const text = await response.text();
    let payload = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      const detail = payload && typeof payload === 'object' ? payload.detail : payload;
      throw new Error(detail || `GestorEscuela respondió con HTTP ${response.status}.`);
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

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  return text ? text.replace(/\/+$/, '') : '';
}
