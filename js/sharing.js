import { DAYS, SERVICE_TYPES } from './constants.js';
import { replaceCoreData } from './db.js';
import { timeToMinutes } from './utils.js';

const FORMAT = 'horario-pt-al';
const SCHEMA_VERSION = 1;
const CORE_KEYS = ['students', 'professionals', 'groups', 'sessions'];

export function createSharePackage(state) {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'Horario PT / AL',
    data: Object.fromEntries(CORE_KEYS.map(key => [key, structuredClone(state[key] || [])]))
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
  return {
    students: data.students.length,
    professionals: data.professionals.length,
    groups: data.groups.length,
    sessions: data.sessions.length
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

  const data = payload.data && typeof payload.data === 'object' ? payload.data : payload;
  for (const key of CORE_KEYS) {
    if (!Array.isArray(data[key])) throw new Error(`Falta la colección "${key}" en el archivo.`);
    assertUniqueIds(data[key], key);
  }

  const studentIds = new Set(data.students.map(item => item.id));
  const professionalMap = new Map(data.professionals.map(item => [item.id, item]));
  const groupMap = new Map(data.groups.map(item => [item.id, item]));
  const validDays = new Set(DAYS.map(day => day.id));

  for (const professional of data.professionals) {
    if (!SERVICE_TYPES.includes(professional.tipo)) {
      throw new Error(`El profesional ${professional.id} tiene un tipo PT/AL no válido.`);
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

  return {
    students: structuredClone(data.students),
    professionals: structuredClone(data.professionals),
    groups: structuredClone(data.groups),
    sessions: structuredClone(data.sessions)
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
