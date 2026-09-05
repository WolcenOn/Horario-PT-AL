import { DAYS } from './constants.js';
import { classEntriesForInterval } from './class-schedules.js';
import { COURSE_OPTIONS, classesForCourse, recessForStage, recessOverlaps, schoolStructureConfigured, stageForCourse } from './education.js';
import { detectConflicts } from './conflicts.js';
import { sessionDuration } from './hours.js';
import { overlapInterval, timeToMinutes, minutesToTime } from './utils.js';

export const AUTOMATION_SETTINGS_ID = 'automation';
export const SUBJECT_PRIORITIES = [
  { value:'low', label:'Baja · buena franja para PT/AL', score:30 },
  { value:'medium', label:'Media · aceptable', score:0 },
  { value:'high', label:'Alta · mejor evitar', score:-45 },
  { value:'blocked', label:'Bloqueada · no sacar al alumno', score:null }
];

const PRIORITY_VALUES = new Set(SUBJECT_PRIORITIES.map(item => item.value));
const PRIORITY_SCORE = new Map(SUBJECT_PRIORITIES.map(item => [item.value, item.score]));
const DAY_ORDER = new Map(DAYS.map((day, index) => [day.id, index]));
const COURSE_VALUES = new Set(COURSE_OPTIONS.map(option => option.value));
const STEP_MINUTES = 15;

export function normalizeAutomationSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const courseRules = {};
  for (const [course, rawRule] of Object.entries(source.courseRules || {})) {
    if (!course) continue;
    courseRules[course] = normalizeCourseRule(rawRule);
  }
  return { id:AUTOMATION_SETTINGS_ID, courseRules };
}

export function relevantCourses(state) {
  const activeStudentIds = new Set(
    (state.groups || [])
      .filter(group => group.activo !== false)
      .flatMap(group => group.studentIds || [])
  );
  return [...new Set((state.students || [])
    .filter(student => student.activo !== false && activeStudentIds.has(student.id))
    .map(student => student.curso)
    .filter(Boolean))]
    .sort(courseCompare);
}

export function subjectsForCourse(state, course) {
  const classGroups = new Set((state.students || [])
    .filter(student => student.activo !== false && student.curso === course && student.grupoClase)
    .map(student => normalizeText(student.grupoClase)));
  return [...new Set((state.classSchedules || [])
    .filter(entry => classGroups.has(normalizeText(entry.grupoClase)))
    .map(entry => entry.materia?.trim())
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity:'base' }));
}

export function courseRuleDraft(state, settings, course) {
  const normalized = normalizeAutomationSettings(settings);
  const stored = normalized.courseRules[course];
  if (stored) return stored;

  const classGroups = new Set((state.students || [])
    .filter(student => student.activo !== false && student.curso === course && student.grupoClase)
    .map(student => normalizeText(student.grupoClase)));
  const allowedWindows = {};
  for (const day of DAYS) {
    const entries = (state.classSchedules || []).filter(entry => classGroups.has(normalizeText(entry.grupoClase)) && entry.dia === day.id);
    if (!entries.length) {
      allowedWindows[day.id] = { inicio:'', fin:'' };
      continue;
    }
    const starts = entries.map(entry => timeToMinutes(entry.inicio)).filter(Number.isFinite);
    const ends = entries.map(entry => timeToMinutes(entry.fin)).filter(Number.isFinite);
    allowedWindows[day.id] = starts.length && ends.length
      ? { inicio:minutesToTime(Math.min(...starts)), fin:minutesToTime(Math.max(...ends)) }
      : { inicio:'', fin:'' };
  }
  return {
    confirmed:false,
    allowedWindows,
    subjectPriorities:Object.fromEntries(subjectsForCourse(state, course).map(subject => [subject, 'medium']))
  };
}

export function buildReadinessReport(state, settings) {
  const normalized = normalizeAutomationSettings(settings);
  const courses = relevantCourses(state);
  const studentMap = new Map((state.students || []).map(student => [student.id, student]));
  const professionalMap = new Map((state.professionals || []).map(professional => [professional.id, professional]));
  const activeGroups = (state.groups || []).filter(group => group.activo !== false);
  const usedStudentIds = new Set(activeGroups.flatMap(group => group.studentIds || []));
  const usedStudents = (state.students || []).filter(student => usedStudentIds.has(student.id) && student.activo !== false);

  const structureReady = schoolStructureConfigured(state.schoolSettings);
  const structureItem = makeItem(
    'schoolStructure', 'Estructura de clases del colegio', structureReady,
    structureReady
      ? 'Líneas generales y desdobles por curso configurados.'
      : 'Falta definir cuántas líneas tiene el centro y los posibles desdobles de cada curso.',
    'classSchedules'
  );

  const incompleteStudents = usedStudents.filter(student => {
    if (!student.curso || !student.grupoClase || !COURSE_VALUES.has(student.curso)) return true;
    if (!structureReady) return false;
    return !classesForCourse(state.schoolSettings, student.curso).includes(student.grupoClase);
  });
  const studentsItem = makeItem(
    'students', 'Alumnos', incompleteStudents.length === 0 && usedStudents.length > 0,
    usedStudents.length === 0
      ? 'No hay alumnos activos incluidos en grupos.'
      : incompleteStudents.length
        ? `${incompleteStudents.length} alumno(s) necesitan curso y una clase válida según la estructura del colegio.`
        : `${usedStudents.length} alumno(s) con curso y grupo ordinario completos.`,
    'students'
  );

  const usedProfessionalIds = new Set(activeGroups.map(group => group.professionalId).filter(Boolean));
  const usedProfessionals = (state.professionals || []).filter(professional => usedProfessionalIds.has(professional.id));
  const incompleteProfessionals = usedProfessionals.filter(professional => professional.activo === false || !hasAvailability(professional));
  const professionalsItem = makeItem(
    'professionals', 'Profesionales y disponibilidad', usedProfessionals.length > 0 && incompleteProfessionals.length === 0,
    usedProfessionals.length === 0
      ? 'No hay profesionales asignados a grupos activos.'
      : incompleteProfessionals.length
        ? `${incompleteProfessionals.length} profesional(es) no tienen disponibilidad lectiva válida o están inactivos.`
        : `${usedProfessionals.length} profesional(es) con disponibilidad configurada.`,
    'professionals'
  );

  const invalidGroups = activeGroups.filter(group => {
    const professional = professionalMap.get(group.professionalId);
    const studentIds = group.studentIds || [];
    return !professional || professional.tipo !== group.tipo || !studentIds.length || studentIds.some(id => !studentMap.has(id));
  });
  const groupsItem = makeItem(
    'groups', 'Grupos PT/AL', activeGroups.length > 0 && invalidGroups.length === 0,
    activeGroups.length === 0
      ? 'No hay grupos activos.'
      : invalidGroups.length
        ? `${invalidGroups.length} grupo(s) tienen alumnado/profesional incompleto o incompatible.`
        : `${activeGroups.length} grupo(s) listos.`,
    'groups'
  );

  const sessionsByGroup = new Map(activeGroups.map(group => [group.id, []]));
  for (const session of state.sessions || []) {
    if (sessionsByGroup.has(session.groupId)) sessionsByGroup.get(session.groupId).push(session);
  }
  const groupsWithoutTemplate = activeGroups.filter(group => {
    const sessions = sessionsByGroup.get(group.id) || [];
    return !sessions.length || sessions.some(session => sessionDuration(session) <= 0);
  });
  const sessionsItem = makeItem(
    'sessions', 'Sesiones plantilla', activeGroups.length > 0 && groupsWithoutTemplate.length === 0,
    groupsWithoutTemplate.length
      ? `${groupsWithoutTemplate.length} grupo(s) necesitan al menos una sesión válida. Su número y duración se usarán como plantilla.`
      : `${state.sessions?.length || 0} sesión(es) disponibles como plantilla de frecuencia y duración.`,
    'sessions'
  );

  const classGroups = [...new Set(usedStudents.map(student => student.grupoClase).filter(Boolean))];
  const missingClassDays = [];
  for (const grupoClase of classGroups) {
    for (const day of DAYS) {
      const hasEntry = (state.classSchedules || []).some(entry => normalizeText(entry.grupoClase) === normalizeText(grupoClase) && entry.dia === day.id);
      if (!hasEntry) missingClassDays.push(`${grupoClase} · ${day.label}`);
    }
  }
  const classSchedulesItem = makeItem(
    'classSchedules', 'Horarios ordinarios', classGroups.length > 0 && missingClassDays.length === 0,
    classGroups.length === 0
      ? 'No hay grupos/clases ordinarias asociados a los alumnos.'
      : missingClassDays.length
        ? `Faltan horarios en ${missingClassDays.length} combinación(es) clase/día. Ej.: ${missingClassDays.slice(0,3).join(', ')}${missingClassDays.length > 3 ? '…' : ''}`
        : `${classGroups.length} clase(s) con horario cargado de lunes a viernes.`,
    'classSchedules'
  );

  const stages = [...new Set(usedStudents.map(student => stageForCourse(student.curso)).filter(Boolean))];
  const missingRecesses = stages.filter(stage => !recessForStage(state.schoolSettings, stage));
  const recessItem = makeItem(
    'recesses', 'Recreos del centro', stages.length === 0 || missingRecesses.length === 0,
    missingRecesses.length
      ? `Falta definir el recreo de: ${missingRecesses.map(stage => stage === 'infantil' ? 'Infantil' : 'Primaria').join(', ')}.`
      : stages.length ? 'Recreos de las etapas utilizadas correctamente definidos.' : 'No hay etapas que requieran recreo.',
    'recesses'
  );

  const incompleteRules = [];
  for (const course of courses) {
    const rule = normalized.courseRules[course];
    const subjects = subjectsForCourse(state, course);
    if (!rule?.confirmed || !hasAllowedWindow(rule)) {
      incompleteRules.push(course);
      continue;
    }
    if (subjects.some(subject => !PRIORITY_VALUES.has(rule.subjectPriorities?.[subject]))) incompleteRules.push(course);
  }
  const rulesItem = makeItem(
    'courseRules', 'Prioridades y franjas por curso', courses.length > 0 && incompleteRules.length === 0,
    courses.length === 0
      ? 'No hay cursos activos que configurar.'
      : incompleteRules.length
        ? `Falta confirmar la configuración de ${incompleteRules.length} curso(s): ${incompleteRules.join(', ')}.`
        : `${courses.length} curso(s) con prioridades y franjas permitidas configuradas.`,
    'automation'
  );

  const items = [structureItem, studentsItem, professionalsItem, groupsItem, sessionsItem, classSchedulesItem, recessItem, rulesItem];
  return { ready:items.every(item => item.ok), items, courses };
}

export function generateAutomaticProposal(state, settings) {
  const normalized = normalizeAutomationSettings(settings);
  const readiness = buildReadinessReport(state, normalized);
  if (!readiness.ready) {
    return { ok:false, readiness, unresolved:[], sessions:state.sessions || [], moved:[], score:0, conflicts:[] };
  }

  const groupMap = new Map(state.groups.map(group => [group.id, group]));
  const professionalMap = new Map(state.professionals.map(professional => [professional.id, professional]));
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const templates = (state.sessions || []).filter(session => groupMap.get(session.groupId)?.activo !== false);
  const fixedSessions = (state.sessions || []).filter(session => groupMap.get(session.groupId)?.activo === false);
  const candidateMap = new Map();

  for (const session of templates) {
    candidateMap.set(session.id, buildCandidates(session, state, normalized, groupMap, professionalMap, studentMap));
  }

  const ordered = [...templates].sort((a, b) => {
    const countDiff = (candidateMap.get(a.id)?.length || 0) - (candidateMap.get(b.id)?.length || 0);
    return countDiff || sessionDuration(b) - sessionDuration(a) || a.id.localeCompare(b.id);
  });

  const assigned = fixedSessions.map(session => ({ session, group:groupMap.get(session.groupId), studentIds:studentIdsForSession(session, groupMap) }));
  const chosen = new Map();
  const unresolved = [];
  let score = 0;

  for (const template of ordered) {
    const group = groupMap.get(template.groupId);
    const studentIds = studentIdsForSession(template, groupMap);
    const candidates = candidateMap.get(template.id) || [];
    let best = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      if (hasRuntimeOverlap(candidate, template, studentIds, assigned, group)) continue;
      const sameGroupSameDay = assigned.filter(item => item.group?.id === group?.id && item.session.dia === candidate.dia).length;
      const spreadPenalty = sameGroupSameDay * 35;
      const stabilityBonus = candidate.dia === template.dia && candidate.inicio === template.inicio ? 3 : 0;
      const candidateScore = candidate.score - spreadPenalty + stabilityBonus;
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = candidate;
      }
    }

    if (!best) {
      unresolved.push({ sessionId:template.id, groupId:template.groupId, candidateCount:candidates.length });
      continue;
    }

    const next = { ...template, dia:best.dia, inicio:best.inicio, fin:best.fin };
    chosen.set(template.id, next);
    assigned.push({ session:next, group, studentIds });
    score += bestScore;
  }

  if (unresolved.length) {
    return { ok:false, readiness, unresolved, sessions:state.sessions || [], moved:[], score, conflicts:[] };
  }

  const proposedSessions = (state.sessions || []).map(session => chosen.get(session.id) || session);
  const proposedState = { ...state, sessions:proposedSessions };
  const conflicts = detectConflicts(proposedState);
  const severe = conflicts.filter(conflict => conflict.severity === 'grave');
  if (severe.length) {
    return { ok:false, readiness, unresolved:severe.map(conflict => ({ conflict })), sessions:state.sessions || [], moved:[], score, conflicts };
  }

  const moved = proposedSessions
    .map(next => {
      const previous = state.sessions.find(session => session.id === next.id);
      if (!previous || (previous.dia === next.dia && previous.inicio === next.inicio && previous.fin === next.fin)) return null;
      return { id:next.id, groupId:next.groupId, from:{ dia:previous.dia, inicio:previous.inicio, fin:previous.fin }, to:{ dia:next.dia, inicio:next.inicio, fin:next.fin } };
    })
    .filter(Boolean);

  return { ok:true, readiness, unresolved:[], sessions:proposedSessions, moved, score, conflicts };
}

function buildCandidates(template, state, settings, groupMap, professionalMap, studentMap) {
  const group = groupMap.get(template.groupId);
  const professional = professionalMap.get(template.professionalId || group?.professionalId);
  const duration = sessionDuration(template);
  if (!group || !professional || duration <= 0) return [];
  const studentIds = studentIdsForSession(template, groupMap);
  const students = studentIds.map(id => studentMap.get(id)).filter(Boolean);
  const courses = [...new Set(students.map(student => student.curso).filter(Boolean))];
  const candidates = [];

  for (const day of DAYS) {
    const courseWindows = courses.map(course => settings.courseRules[course]?.allowedWindows?.[day.id]).filter(Boolean);
    if (courseWindows.length !== courses.length || courseWindows.some(window => !validWindow(window))) continue;
    const allowedStart = Math.max(...courseWindows.map(window => timeToMinutes(window.inicio)));
    const allowedEnd = Math.min(...courseWindows.map(window => timeToMinutes(window.fin)));
    if (!Number.isFinite(allowedStart) || !Number.isFinite(allowedEnd) || allowedEnd - allowedStart < duration) continue;

    for (const availability of professional.disponibilidad?.[day.id] || []) {
      const start = Math.max(allowedStart, timeToMinutes(availability.inicio));
      const end = Math.min(allowedEnd, timeToMinutes(availability.fin));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < duration) continue;
      const first = Math.ceil(start / STEP_MINUTES) * STEP_MINUTES;
      for (let minute = first; minute + duration <= end; minute += STEP_MINUTES) {
        const inicio = minutesToTime(minute);
        const fin = minutesToTime(minute + duration);
        const evaluation = evaluateCandidate(students, day.id, inicio, fin, state, settings);
        if (!evaluation.valid) continue;
        candidates.push({ dia:day.id, inicio, fin, score:evaluation.score });
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score || (DAY_ORDER.get(a.dia) ?? 99) - (DAY_ORDER.get(b.dia) ?? 99) || a.inicio.localeCompare(b.inicio));
}

function evaluateCandidate(students, dia, inicio, fin, state, settings) {
  let score = 0;
  for (const student of students) {
    const stage = stageForCourse(student.curso);
    if (stage && recessOverlaps(state.schoolSettings, stage, inicio, fin)) return { valid:false, score:-Infinity };

    for (const restriction of student.restricciones || []) {
      if (restriction.tipo !== 'no-salir' || restriction.dia !== dia) continue;
      if (overlapInterval(timeToMinutes(inicio), timeToMinutes(fin), timeToMinutes(restriction.inicio), timeToMinutes(restriction.fin))) {
        return { valid:false, score:-Infinity };
      }
    }

    const entries = classEntriesForInterval(state.classSchedules || [], student.grupoClase, dia, inicio, fin);
    if (!entries.length) {
      score += 5;
      continue;
    }
    for (const entry of entries) {
      const priority = settings.courseRules[student.curso]?.subjectPriorities?.[entry.materia] || 'medium';
      if (priority === 'blocked') return { valid:false, score:-Infinity };
      score += PRIORITY_SCORE.get(priority) ?? 0;
    }
  }
  return { valid:true, score };
}

function hasRuntimeOverlap(candidate, template, studentIds, assigned, group) {
  const start = timeToMinutes(candidate.inicio);
  const end = timeToMinutes(candidate.fin);
  const professionalId = template.professionalId || group?.professionalId;
  for (const item of assigned) {
    if (item.session.dia !== candidate.dia) continue;
    const overlap = overlapInterval(start, end, timeToMinutes(item.session.inicio), timeToMinutes(item.session.fin));
    if (!overlap) continue;
    const otherProfessionalId = item.session.professionalId || item.group?.professionalId;
    if (professionalId && professionalId === otherProfessionalId) return true;
    if (studentIds.some(id => item.studentIds.includes(id))) return true;
  }
  return false;
}

function studentIdsForSession(session, groupMap) {
  const group = groupMap.get(session.groupId);
  const excluded = new Set(session.excludedStudentIds || []);
  return (group?.studentIds || []).filter(id => !excluded.has(id));
}

function normalizeCourseRule(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const allowedWindows = {};
  for (const day of DAYS) {
    const window = raw.allowedWindows?.[day.id];
    allowedWindows[day.id] = {
      inicio:typeof window?.inicio === 'string' ? window.inicio : '',
      fin:typeof window?.fin === 'string' ? window.fin : ''
    };
  }
  const subjectPriorities = {};
  for (const [subject, priority] of Object.entries(raw.subjectPriorities || {})) {
    if (subject && PRIORITY_VALUES.has(priority)) subjectPriorities[subject] = priority;
  }
  return { confirmed:raw.confirmed === true, allowedWindows, subjectPriorities };
}

function hasAllowedWindow(rule) {
  return DAYS.some(day => validWindow(rule.allowedWindows?.[day.id]));
}

function validWindow(window) {
  const start = timeToMinutes(window?.inicio);
  const end = timeToMinutes(window?.fin);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function hasAvailability(professional) {
  return DAYS.some(day => (professional.disponibilidad?.[day.id] || []).some(validWindow));
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function courseCompare(a, b) {
  const ai = COURSE_OPTIONS.findIndex(option => option.value === a);
  const bi = COURSE_OPTIONS.findIndex(option => option.value === b);
  if (ai >= 0 || bi >= 0) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  return String(a).localeCompare(String(b), 'es', { numeric:true, sensitivity:'base' });
}

function makeItem(id, label, ok, detail, target) {
  return { id, label, ok, detail, target };
}
