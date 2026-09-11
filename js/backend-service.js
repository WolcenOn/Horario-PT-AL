const STORAGE_KEY = 'horario-gestor-escuela-backend';
const AUTH_TOKEN_STORAGE_KEY = 'horario-gestor-escuela-access-token';

export const DEFAULT_BACKEND_SETTINGS = Object.freeze({
  enabled:false,
  baseUrl:'https://gestorescuela-production.up.railway.app',
  schoolId:'',
  actorId:'',
  academicYearId:'',
  scenarioId:'',
  autoSync:false,
  accessToken:''
});

export function loadBackendSettings() {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const accessToken = readSessionToken();
    return normalizeBackendSettings({ ...(raw ? JSON.parse(raw) : {}), accessToken });
  } catch {
    return { ...DEFAULT_BACKEND_SETTINGS, accessToken:readSessionToken() };
  }
}

export function saveBackendSettings(value) {
  const normalized = normalizeBackendSettings(value);
  if (typeof localStorage !== 'undefined') {
    const { accessToken: _accessToken, ...persistent } = normalized;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistent));
  }
  writeSessionToken(normalized.accessToken);
  return normalized;
}

export function normalizeBackendSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    enabled:source.enabled === true,
    baseUrl:normalizeBaseUrl(source.baseUrl || DEFAULT_BACKEND_SETTINGS.baseUrl),
    schoolId:String(source.schoolId || '').trim(),
    actorId:String(source.actorId || '').trim(),
    academicYearId:String(source.academicYearId || '').trim(),
    scenarioId:String(source.scenarioId || '').trim(),
    autoSync:source.autoSync === true,
    accessToken:String(source.accessToken || '').trim()
  };
}

export function backendConfigured(settings) {
  const value = normalizeBackendSettings(settings);
  return Boolean(value.enabled && value.baseUrl && value.schoolId && (value.accessToken || value.actorId));
}

export function backendSettingsFromAuth(settings, auth, { schoolId = '' } = {}) {
  const base = normalizeBackendSettings(settings);
  const memberships = Array.isArray(auth?.memberships) ? auth.memberships : [];
  const membershipSchoolIds = new Set(
    memberships
      .map(item => String(item?.school_id || '').trim())
      .filter(Boolean)
  );
  const requestedSchool = String(schoolId || '').trim();
  const responseSchool = String(auth?.school?.id || '').trim();
  const onlyMembershipSchool = memberships.length === 1 ? String(memberships[0]?.school_id || '').trim() : '';
  const validRequestedSchool = membershipSchoolIds.has(requestedSchool) ? requestedSchool : '';
  const validResponseSchool = membershipSchoolIds.has(responseSchool) ? responseSchool : '';
  const validStoredSchool = membershipSchoolIds.has(base.schoolId) ? base.schoolId : '';
  const selectedSchool = validRequestedSchool || validResponseSchool || onlyMembershipSchool || validStoredSchool;
  return normalizeBackendSettings({
    ...base,
    enabled:true,
    schoolId:selectedSchool,
    actorId:'',
    accessToken:auth?.access_token || base.accessToken
  });
}

export async function loginBackend({ baseUrl, email, password }) {
  const settings = normalizeBackendSettings({ baseUrl });
  const cleanEmail = String(email || '').trim();
  const cleanPassword = String(password || '');
  if (!cleanEmail) throw new Error('Indica tu correo electrónico.');
  if (!cleanPassword) throw new Error('Indica tu contraseña.');
  return request(settings, '/auth/login', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ email:cleanEmail, password:cleanPassword }),
    timeoutMs:15000,
    auth:false
  });
}

export async function registerSchoolBackend({ baseUrl, email, password, displayName, schoolName }) {
  const settings = normalizeBackendSettings({ baseUrl });
  const payload = {
    email:String(email || '').trim(),
    password:String(password || ''),
    display_name:String(displayName || '').trim(),
    school_name:String(schoolName || '').trim()
  };
  if (!payload.email) throw new Error('Indica el correo del administrador.');
  if (payload.password.length < 10) throw new Error('La contraseña debe tener al menos 10 caracteres.');
  if (!payload.display_name) throw new Error('Indica el nombre del administrador.');
  if (!payload.school_name) throw new Error('Indica el nombre del centro.');
  return request(settings, '/auth/register-school', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload),
    timeoutMs:15000,
    auth:false
  });
}

export async function fetchCurrentAuth(settings) {
  const value = requireBearer(settings);
  return request(value, '/auth/me', { timeoutMs:15000 });
}

export async function logoutBackend(settings) {
  const value = requireBearer(settings);
  const result = await request(value, '/auth/logout', { method:'POST', timeoutMs:15000 });
  writeSessionToken('');
  return result;
}

export async function checkBackendHealth(settings, { timeoutMs = 8000 } = {}) {
  const value = normalizeBackendSettings(settings);
  if (!value.baseUrl) throw new Error('Indica la URL del backend GestorEscuela.');
  return request(value, '/health', { timeoutMs, auth:false });
}

export async function bootstrapBackendConnection({ baseUrl, schoolName, email, displayName }) {
  const settings = normalizeBackendSettings({ enabled:true, baseUrl });
  const cleanSchoolName = String(schoolName || '').trim();
  const cleanEmail = String(email || '').trim();
  const cleanDisplayName = String(displayName || '').trim();
  if (!settings.baseUrl) throw new Error('Falta la URL del backend GestorEscuela.');
  if (!cleanSchoolName) throw new Error('Indica el nombre del centro.');
  if (!cleanEmail) throw new Error('Indica el correo del administrador inicial.');
  if (!cleanDisplayName) throw new Error('Indica el nombre del administrador inicial.');

  const bootstrapHeaders = { 'Content-Type':'application/json', 'X-Actor-Role':'ADMIN' };
  const user = await request(settings, '/users', {
    method:'POST', headers:bootstrapHeaders,
    body:JSON.stringify({ email:cleanEmail, display_name:cleanDisplayName }),
    timeoutMs:15000, auth:false
  });

  let school;
  try {
    school = await request(settings, '/schools', {
      method:'POST', headers:bootstrapHeaders,
      body:JSON.stringify({ name:cleanSchoolName }), timeoutMs:15000, auth:false
    });
    await request(settings, `/schools/${encodeURIComponent(school.id)}/memberships`, {
      method:'PUT', headers:bootstrapHeaders,
      body:JSON.stringify({ user_id:user.id, role:'ADMIN' }), timeoutMs:15000, auth:false
    });
  } catch (error) {
    throw new Error(`Se creó el usuario (${user.id}), pero no se pudo completar la vinculación del centro: ${error.message || error}`);
  }

  return {
    settings:normalizeBackendSettings({
      enabled:true, baseUrl:settings.baseUrl, schoolId:school.id, actorId:user.id
    }),
    school,
    user
  };
}

export async function listAcademicYears(settings) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-years`, { timeoutMs:15000 });
}

export async function createAcademicYear(settings, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-years`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload), timeoutMs:15000
  });
}

export async function listPlanningScenarios(settings, academicYearId = null) {
  const value = requireConfigured(settings);
  const yearId = requireAcademicYearId(academicYearId || value.academicYearId);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-years/${encodeURIComponent(yearId)}/scenarios`, { timeoutMs:15000 });
}

export async function createPlanningScenario(settings, academicYearId, payload) {
  const value = requireConfigured(settings);
  const yearId = requireAcademicYearId(academicYearId || value.academicYearId);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-years/${encodeURIComponent(yearId)}/scenarios`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload), timeoutMs:15000
  });
}

export async function fetchPlanningScenarioSnapshot(settings) {
  const { value, path } = scenarioSnapshotTarget(settings);
  return request(value, path, { timeoutMs:20000 });
}

export async function savePlanningScenarioSnapshot(settings, payload, { sourceHash = null } = {}) {
  const { value, path } = scenarioSnapshotTarget(settings);
  return request(value, path, {
    method:'PUT',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ source_hash:sourceHash, payload }),
    timeoutMs:30000
  });
}

export async function pushAcademicConfiguration(settings, configuration) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-configuration`, {
    method:'PUT', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(configuration), timeoutMs:20000
  });
}

export async function fetchAcademicConfiguration(settings) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/academic-configuration`, { timeoutMs:15000 });
}

export async function pushRoster(settings, roster) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/students`, {
    method:'PUT', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(roster), timeoutMs:20000
  });
}

export async function fetchRoster(settings) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/students`, { timeoutMs:15000 });
}

export async function listDayPlans(settings, planDate) {
  const value = requireConfigured(settings);
  const query = planDate ? `?plan_date=${encodeURIComponent(planDate)}` : '';
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans${query}`, { timeoutMs:15000 });
}

export async function createDayPlan(settings, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload), timeoutMs:15000
  });
}

export async function solveAcademicDay(settings, planId, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/day-plans/${encodeURIComponent(planId)}/solve-academic`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload), timeoutMs:20000
  });
}

export async function solveStaffingAllocation(settings, payload) {
  const value = requireConfigured(settings);
  return request(value, `/schools/${encodeURIComponent(value.schoolId)}/staffing/solve`, {
    method:'POST', headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(payload), timeoutMs:30000
  });
}

function scenarioSnapshotTarget(settings) {
  const value = requireConfigured(settings);
  const yearId = requireAcademicYearId(value.academicYearId);
  const scenarioId = requireScenarioId(value.scenarioId);
  return {
    value,
    path:`/schools/${encodeURIComponent(value.schoolId)}/academic-years/${encodeURIComponent(yearId)}/scenarios/${encodeURIComponent(scenarioId)}/snapshot`
  };
}

function requireConfigured(settings) {
  const value = normalizeBackendSettings(settings);
  if (!value.enabled) throw new Error('La conexión con GestorEscuela está desactivada.');
  if (!value.baseUrl) throw new Error('Falta la URL del backend GestorEscuela.');
  if (!value.schoolId) throw new Error('Falta el ID del centro en GestorEscuela.');
  if (!value.accessToken && !value.actorId) throw new Error('Inicia sesión o configura temporalmente el Actor ID de GestorEscuela.');
  return value;
}

function requireBearer(settings) {
  const value = normalizeBackendSettings(settings);
  if (!value.baseUrl) throw new Error('Falta la URL del backend GestorEscuela.');
  if (!value.accessToken) throw new Error('Inicia sesión en GestorEscuela.');
  return value;
}

function requireAcademicYearId(value) {
  const yearId = String(value || '').trim();
  if (!yearId) throw new Error('Selecciona primero un curso académico de GestorEscuela.');
  return yearId;
}

function requireScenarioId(value) {
  const scenarioId = String(value || '').trim();
  if (!scenarioId) throw new Error('Selecciona primero un escenario de GestorEscuela.');
  return scenarioId;
}

async function request(settings, path, options = {}) {
  const { timeoutMs = 10000, auth = true, headers = {}, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authHeaders = auth
      ? settings.accessToken
        ? { Authorization:`Bearer ${settings.accessToken}` }
        : settings.actorId
          ? { 'X-Actor-Id':settings.actorId }
          : {}
      : {};
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

function normalizeBaseUrl(value) {
  const text = String(value || '').trim();
  return text ? text.replace(/\/+$/, '') : '';
}

function readSessionToken() {
  try {
    return typeof sessionStorage !== 'undefined' ? String(sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY) || '').trim() : '';
  } catch {
    return '';
  }
}

function writeSessionToken(value) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const token = String(value || '').trim();
    if (token) sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    else sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // El modo offline debe seguir funcionando incluso si el navegador bloquea sessionStorage.
  }
}
