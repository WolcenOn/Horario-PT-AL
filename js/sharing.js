import { DAYS, SERVICE_TYPES } from './constants.js';
import { put, replaceCoreData } from './db.js';
import { normalizeSchoolSettings, validateSchoolSettings } from './education.js';
import { normalizeAutomationSettings } from './automation-core.js';
import { normalizeCenterPlanningSettings, PROFESSIONAL_TYPES } from './center-planning.js';
import { timeToMinutes } from './utils.js';

const FORMAT = 'horario-pt-al';
const SCHEMA_VERSION = 6;
const REQUIRED_KEYS = ['students', 'professionals', 'groups', 'sessions'];
const ARRAY_SHARE_KEYS = [...REQUIRED_KEYS, 'classSchedules'];

export function createSharePackage(state) {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Horario PT / AL',
    data: {
      ...Object.fromEntries(ARRAY_SHARE_KEYS.map(key => [key, structuredClone(state[key] || [])])),
      schoolSettings: structuredClone(normalizeSchoolSettings(state.schoolSettings)),
      automationSettings: structuredClone(normalizeAutomationSettings(state.automationSettings)),
      centerPlanningSettings: structuredClone(normalizeCenterPlanningSettings(state.centerPlanningSettings))
    }
  };
}

export function downloadSharePackage(state) {
  const payload = createSharePackage(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `horario-pt-al-${date}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importShareFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('El archivo no contiene un JSON válido.');
  }
  const data = validateSharePackage(payload);
  await replaceCoreData(data);
  await put('settings', data.schoolSettings);
  await put('settings', data.automationSettings);
  await put('settings', data.centerPlanningSettings);
  return {
    students: data.students.length,
    professionals: data.professionals.length,
    groups: data.groups.length,
    sessions: data.sessions.length,
    classSchedules: data.classSchedules.length
  };
}

export function validateSharePackage(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('El archivo de horario no tiene una estructura válida.');
  }

  if (payload.format && payload.format !== FORMAT) {
    throw new Error('Este archivo no corresponde a Horario PT / AL.');
  }
  if (payload.schemaVersion && payload.schemaVersion > SCHEMA_VERSION) {
    throw new Error('El archivo fue creado con una versión más nueva de la aplicación.');
  }

  const source = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  for (const key of REQUIRED_KEYS) {
    if (!Array.isArray(source[key])) throw new Error(`Falta la colección "${key}" en el archivo.`);
  }

  const data = {
    students: source.students,
    professionals: source.professionals,
    groups: source.groups,
    sessions: source.sessions,
    classSchedules: Array.isArray(source.classSchedules) ? source.classSchedules : [],
    schoolSettings: validateSchoolSettings(source.schoolSettings || normalizeSchoolSettings()),
    automationSettings: normalizeAutomationSettings(source.automationSettings),
    centerPlanningSettings: normalizeCenterPlanningSettings(source.centerPlanningSettings)
  };
  for (const key of ARRAY_SHARE_KEYS) assertUniqueIds(data[key], key);

  const studentIds = new Set(data.students.map(item => item.id));
  const professionalMap = new Map(data.professionals.map(item => [item.id, item]));
  const groupMap = new Map(data.groups.map(item => [item.id, item]));
  const validDays = new Set(DAYS.map(day => day.id));

  for (const professional of data.professionals) {
    if (!PROFESSIONAL_TYPES.includes(professional.tipo)) {
      throw new Error(`El profesional ${professional.id} tiene un tipo profesional no válido.`);
    }
  }

  for (const group of data.groups) {
    if (!SERVICE_TYPES.includes(group.tipo)) throw new Error(`El grupo ${group.id} no tiene un tipo PT/AL válido.`);
    const professional = professionalMap.get(group.professionalId);
    if (!professional) throw new Error(`El grupo ${group.id} referencia un profesional inexistente.`);
    if (professional.tipo !== group.tipo) throw new Error(`El grupo ${group.id} no coincide con el tipo de su profesional.`);
    if (!Array.isArray(group.studentIds)) throw new Error(`El grupo ${group.id} no contiene una lista de alumnos válida.`);
    for (const studentId of group.studentIds) {
      if (!studentIds.has(studentId)) throw new Error(`El grupo ${group.id} referencia al alumno inexistente ${studentId}.`);
    }
  }

  for (const session of data.sessions) {
    const group = groupMap.get(session.groupId);
    if (!group) throw new Error(`La sesión ${session.id} referencia un grupo inexistente.`);
    if (!validDays.has(session.dia)) throw new Error(`La sesión ${session.id} tiene un día no válido.`);
    const start = timeToMinutes(session.inicio);
    const end = timeToMinutes(session.fin);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`La sesión ${session.id} tiene un horario no válido.`);
    }
    const professionalId = session.professionalId || group.professionalId;
    if (!professionalMap.has(professionalId)) throw new Error(`La sesión ${session.id} referencia un profesional inexistente.`);
    if (session.excludedStudentIds && !Array.isArray(session.excludedStudentIds)) {
      throw new Error(`La sesión ${session.id} contiene excepciones de alumnado no válidas.`);
    }
  }

  for (const entry of data.classSchedules) {
    if (typeof entry.grupoClase !== 'string' || !entry.grupoClase.trim()) throw new Error(`La franja de aula ${entry.id} no tiene grupo/clase.`);
    if (!validDays.has(entry.dia)) throw new Error(`La franja de aula ${entry.id} tiene un día no válido.`);
    if (typeof entry.materia !== 'string' || !entry.materia.trim()) throw new Error(`La franja de aula ${entry.id} no tiene materia.`);
    const start = timeToMinutes(entry.inicio);
    const end = timeToMinutes(entry.fin);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`La franja de aula ${entry.id} tiene un horario no válido.`);
    if (entry.professionalId && !professionalMap.has(entry.professionalId)) throw new Error(`La franja de aula ${entry.id} referencia un docente inexistente.`);
  }

  return {
    ...Object.fromEntries(ARRAY_SHARE_KEYS.map(key => [key, structuredClone(data[key])])),
    schoolSettings: structuredClone(data.schoolSettings),
    automationSettings: structuredClone(data.automationSettings),
    centerPlanningSettings: structuredClone(data.centerPlanningSettings)
  };
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`La colección "${label}" contiene un elemento sin ID válido.`);
    }
    if (ids.has(item.id)) throw new Error(`Hay un ID duplicado en "${label}": ${item.id}.`);
    ids.add(item.id);
  }
}
