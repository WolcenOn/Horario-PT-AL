import { DAYS } from './constants.js';
import { curriculumForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile, validateGlobalGeneration } from './center-planning.js';
import { configuredClassGroups, courseForClassGroup, recessForStage, recessOverlaps, schoolStructureConfigured, stageForCourse } from './education.js';
import { detectConflicts } from './conflicts.js';
import { professionalCanWork } from './professional-availability.js';
import { minutesToTime, overlapInterval, timeToMinutes } from './utils.js';

const DAY_INDEX = new Map(DAYS.map((day, index) => [day.id, index]));
const PRIORITY_SCORE = { low:90, medium:20, high:-100 };

export function buildGlobalReadiness(state, rawSettings = state.centerPlanningSettings) {
  const settings = normalizeCenterPlanningSettings(rawSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const participatingClasses = classes.filter(group => {
    const course = courseForClassGroup(state.schoolSettings, group);
    return Object.keys(curriculumForCourse(settings, course)).length > 0;
  });
  const items = [];

  items.push(item('mode', 'Modo Centro completo', settings.mode === 'global', settings.mode === 'global'
    ? 'El generador global está activado.'
    : 'Activa “Centro completo” en Plan del centro.'));

  const structureReady = schoolStructureConfigured(state.schoolSettings) && classes.length > 0;
  items.push(item('structure', 'Estructura del centro', structureReady, structureReady
    ? `${classes.length} clase(s) definidas.`
    : 'Configura primero las líneas y clases del colegio.'));

  let generation = settings.generation;
  let generationError = '';
  try { generation = validateGlobalGeneration(settings); } catch (error) { generationError = error.message; }
  const generationReady = !generationError && generation.lessonMinutes % 15 === 0;
  items.push(item('generation', 'Jornada y duración de tramos', generationReady, generationReady
    ? `${generation.start}–${generation.end}, tramo habitual ${generation.lessonMinutes} min.`
    : generationError || 'La duración habitual debe ser múltiplo de 15 minutos.'));

  items.push(item('curriculum', 'Currículo objetivo', participatingClasses.length > 0, participatingClasses.length
    ? `${participatingClasses.length} clase(s) tienen carga curricular y entrarán en la propuesta.`
    : 'Introduce horas semanales en al menos un curso. Los cursos sin currículo se omiten.'));

  const gridErrors = [];
  for (const grupoClase of participatingClasses) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    for (const [subject, minutes] of Object.entries(curriculumForCourse(settings, course))) {
      if (minutes % 15 !== 0) gridErrors.push(`${grupoClase} · ${subject}: ${minutes} min`);
    }
  }
  items.push(item('grid', 'Encaje en la rejilla de 15 minutos', gridErrors.length === 0, gridErrors.length
    ? `${gridErrors.length} carga(s) no son múltiplo de 15 min. Ej.: ${gridErrors.slice(0,3).join(', ')}.`
    : 'Todas las cargas curriculares se pueden dividir en la rejilla de 15 minutos.'));

  const teacherResolution = resolveTeachers(state, settings, participatingClasses);
  items.push(item('teachers', 'Profesorado por clase y asignatura', teacherResolution.errors.length === 0, teacherResolution.errors.length
    ? `${teacherResolution.errors.length} asignación(es) necesitan exactamente un docente activo. Ej.: ${teacherResolution.errors.slice(0,3).join(', ')}${teacherResolution.errors.length > 3 ? '…' : ''}`
    : `${teacherResolution.map.size} combinaciones clase/asignatura tienen un docente único.'));

  const teacherIds = new Set([...teacherResolution.map.values()].map(prof => prof.id));
  const unavailable = [...teacherIds]
    .map(id => state.professionals.find(prof => prof.id === id))
    .filter(prof => !prof || !DAYS.some(day => (prof.disponibilidad?.[day.id] || []).length));
  items.push(item('availability', 'Disponibilidad del profesorado', unavailable.length === 0, unavailable.length
    ? `${unavailable.length} docente(s) no tienen disponibilidad lectiva configurada.`
    : teacherIds.size ? `${teacherIds.size} docente(s) con disponibilidad utilizable.` : 'No hay docentes implicados todavía.'));

  const capacityErrors = generationReady ? classCapacityErrors(state, settings, participatingClasses, generation) : [];
  items.push(item('capacity', 'Capacidad semanal de las clases', capacityErrors.length === 0, capacityErrors.length
    ? `${capacityErrors.length} clase(s) tienen más minutos curriculares que tiempo lectivo disponible. Ej.: ${capacityErrors.slice(0,3).join(', ')}.`
    : participatingClasses.length ? 'La carga curricular cabe dentro de la jornada y los recreos configurados.' : 'Sin clases participantes.'));

  const workloadErrors = generationReady && teacherResolution.errors.length === 0
    ? teacherWorkloadErrors(state, settings, participatingClasses, teacherResolution.map)
    : [];
  items.push(item('workload', 'Carga máxima del profesorado', workloadErrors.length === 0, workloadErrors.length
    ? `${workloadErrors.length} docente(s) superarían su máximo semanal antes de colocar el horario. Ej.: ${workloadErrors.slice(0,3).join(', ')}.`
    : 'Las cargas modeladas no superan los máximos semanales configurados.'));

  return {
    ready:items.every(entry => entry.ok),
    items,
    participatingClasses,
    teacherMap:teacherResolution.map,
    settings,
    generation
  };
}

export function generateGlobalProposal(state, rawSettings = state.centerPlanningSettings) {
  const readiness = buildGlobalReadiness(state, rawSettings);
  if (!readiness.ready) return emptyProposal(state, readiness);

  const tasks = buildTasks(state, readiness.settings, readiness.participatingClasses, readiness.teacherMap, readiness.generation);
  const candidatesByTask = new Map();
  for (const task of tasks) candidatesByTask.set(task.id, buildCandidates(task, state, readiness.settings, readiness.generation));

  const noCandidate = tasks.filter(task => !(candidatesByTask.get(task.id) || []).length);
  if (noCandidate.length) {
    return {
      ...emptyProposal(state, readiness),
      unresolved:noCandidate.map(task => ({ task, reason:'No existe ningún hueco compatible con jornada, recreo, disponibilidad, centro externo y PT/AL.' }))
    };
  }

  let best = { assigned:[], unresolved:tasks, score:-Infinity };
  const attempts = Math.min(32, Math.max(8, tasks.length));
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = greedyAttempt(tasks, candidatesByTask, state, readiness.settings, attempt);
    if (result.unresolved.length < best.unresolved.length || (result.unresolved.length === best.unresolved.length && result.score > best.score)) best = result;
    if (!result.unresolved.length) break;
  }

  if (best.unresolved.length) {
    return {
      ...emptyProposal(state, readiness),
      unresolved:best.unresolved.map(task => ({ task, reason:'Los huecos posibles entran en conflicto con otras clases o con el mismo docente durante la construcción de la propuesta.' })),
      partial:best.assigned.map(item => item.entry)
    };
  }

  const generated = best.assigned
    .map(item => item.entry)
    .sort((a, b) => normalize(a.grupoClase).localeCompare(normalize(b.grupoClase), 'es', { numeric:true }) || (DAY_INDEX.get(a.dia) ?? 99) - (DAY_INDEX.get(b.dia) ?? 99) || timeToMinutes(a.inicio) - timeToMinutes(b.inicio));

  const proposedState = { ...state, classSchedules:generated };
  const conflicts = detectConflicts(proposedState);
  const severe = conflicts.filter(conflict => conflict.severity === 'grave');
  if (severe.length) {
    return {
      ...emptyProposal(state, readiness),
      unresolved:severe.map(conflict => ({ conflict, reason:conflict.message })),
      conflicts
    };
  }

  const changed = countChangedEntries(state.classSchedules || [], generated);
  const ptalAligned = best.assigned.filter(item => item.candidate.ptalOverlapCount > 0).length;
  return {
    ok:true,
    readiness,
    classSchedules:generated,
    unresolved:[],
    conflicts,
    score:best.score,
    stats:{
      classes:readiness.participatingClasses.length,
      subjects:new Set(tasks.map(task => `${task.grupoClase}\u0000${task.materia}`)).size,
      blocks:generated.length,
      minutes:generated.reduce((sum, entry) => sum + (timeToMinutes(entry.fin) - timeToMinutes(entry.inicio)), 0),
      changed,
      ptalAligned
    }
  };
}

function buildTasks(state, settings, classes, teacherMap, generation) {
  const tasks = [];
  let counter = 0;
  for (const grupoClase of classes) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    const curriculum = curriculumForCourse(settings, course);
    for (const [materia, totalMinutes] of Object.entries(curriculum)) {
      const teacher = teacherMap.get(pairKey(grupoClase, materia));
      const chunks = splitMinutes(totalMinutes, generation.lessonMinutes);
      const existing = (state.classSchedules || []).filter(entry => normalize(entry.grupoClase) === normalize(grupoClase) && normalize(entry.materia) === normalize(materia));
      const aula = existing.find(entry => entry.aula)?.aula || '';
      const observaciones = existing.find(entry => entry.observaciones)?.observaciones || '';
      chunks.forEach((duration, index) => tasks.push({
        id:`global-task-${counter++}`,
        grupoClase,
        course,
        stage:stageForCourse(course),
        materia,
        duration,
        teacher,
        sequence:index,
        existing,
        aula,
        observaciones
      }));
    }
  }
  return tasks;
}

function buildCandidates(task, state, settings, generation) {
  const startDay = timeToMinutes(generation.start);
  const endDay = timeToMinutes(generation.end);
  const candidates = [];
  for (const day of DAYS) {
    for (let start = startDay; start + task.duration <= endDay; start += generation.stepMinutes) {
      const end = start + task.duration;
      const inicio = minutesToTime(start);
      const fin = minutesToTime(end);
      if (recessOverlaps(state.schoolSettings, task.stage, inicio, fin)) continue;
      if (!professionalCanWork(task.teacher, day.id, inicio, fin)) continue;
      if (teacherSupportConflict(task.teacher.id, day.id, start, end, state)) continue;
      const ptal = ptalCompatibility(task, day.id, start, end, state, settings);
      if (ptal.blocked) continue;
      const stability = task.existing.some(entry => entry.dia === day.id && entry.inicio === inicio && entry.fin === fin) ? 35 : 0;
      candidates.push({
        dia:day.id,
        inicio,
        fin,
        start,
        end,
        baseScore:ptal.score + stability,
        ptalOverlapCount:ptal.overlapCount
      });
    }
  }
  return candidates;
}

function greedyAttempt(tasks, candidatesByTask, state, settings, attempt) {
  const teacherTaskCount = new Map();
  for (const task of tasks) teacherTaskCount.set(task.teacher.id, (teacherTaskCount.get(task.teacher.id) || 0) + 1);
  const ordered = [...tasks].sort((a, b) => {
    const scarcity = (candidatesByTask.get(a.id)?.length || 0) - (candidatesByTask.get(b.id)?.length || 0);
    if (scarcity) return scarcity;
    const sharedTeacher = (teacherTaskCount.get(b.teacher.id) || 0) - (teacherTaskCount.get(a.teacher.id) || 0);
    if (sharedTeacher) return sharedTeacher;
    if (b.duration !== a.duration) return b.duration - a.duration;
    return pseudoOrder(a.id, attempt) - pseudoOrder(b.id, attempt);
  });

  const assigned = [];
  const unresolved = [];
  let score = 0;
  for (const task of ordered) {
    const valid = (candidatesByTask.get(task.id) || [])
      .filter(candidate => !runtimeOverlap(task, candidate, assigned))
      .map(candidate => ({ candidate, score:dynamicScore(task, candidate, assigned, settings, attempt) }))
      .sort((a, b) => b.score - a.score || a.candidate.start - b.candidate.start);
    if (!valid.length) {
      unresolved.push(task);
      continue;
    }
    const selected = valid[0];
    const entry = {
      id:`global-${safeId(task.grupoClase)}-${safeId(task.materia)}-${task.sequence + 1}`,
      grupoClase:task.grupoClase,
      materia:task.materia,
      dia:selected.candidate.dia,
      inicio:selected.candidate.inicio,
      fin:selected.candidate.fin,
      professionalId:task.teacher.id,
      docente:task.teacher.nombre || '',
      aula:task.aula,
      observaciones:task.observaciones
    };
    assigned.push({ task, candidate:selected.candidate, entry });
    score += selected.score;
  }
  return { assigned, unresolved, score };
}

function dynamicScore(task, candidate, assigned, settings, attempt) {
  let score = candidate.baseScore;
  const sameSubjectDay = assigned.filter(item => item.task.grupoClase === task.grupoClase && item.task.materia === task.materia && item.candidate.dia === candidate.dia).length;
  if (sameSubjectDay >= settings.generation.maxSameSubjectPerDay) return -1000000;
  score -= sameSubjectDay * 120;

  const classDayMinutes = assigned
    .filter(item => item.task.grupoClase === task.grupoClase && item.candidate.dia === candidate.dia)
    .reduce((sum, item) => sum + item.task.duration, 0);
  score -= classDayMinutes * 0.07;

  const teacherDayMinutes = assigned
    .filter(item => item.task.teacher.id === task.teacher.id && item.candidate.dia === candidate.dia)
    .reduce((sum, item) => sum + item.task.duration, 0);
  score -= teacherDayMinutes * 0.035;

  score += ((pseudoOrder(`${task.id}-${candidate.dia}-${candidate.inicio}`, attempt) % 100) / 1000);
  return score;
}

function runtimeOverlap(task, candidate, assigned) {
  for (const item of assigned) {
    if (item.candidate.dia !== candidate.dia) continue;
    if (!overlapInterval(candidate.start, candidate.end, item.candidate.start, item.candidate.end)) continue;
    if (item.task.grupoClase === task.grupoClase) return true;
    if (item.task.teacher.id === task.teacher.id) return true;
  }
  return false;
}

function resolveTeachers(state, settings, classes) {
  const map = new Map();
  const errors = [];
  const active = (state.professionals || []).filter(prof => prof.activo !== false).map(normalizeProfessionalProfile);
  for (const grupoClase of classes) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    for (const subject of Object.keys(curriculumForCourse(settings, course))) {
      const matches = active.filter(prof => prof.teachingAssignments.some(assignment => normalize(assignment.grupoClase) === normalize(grupoClase) && normalize(assignment.materia) === normalize(subject)));
      if (matches.length !== 1) {
        errors.push(`${grupoClase} · ${subject} (${matches.length ? `${matches.length} docentes` : 'sin docente'})`);
        continue;
      }
      map.set(pairKey(grupoClase, subject), matches[0]);
    }
  }
  return { map, errors };
}

function classCapacityErrors(state, settings, classes, generation) {
  const errors = [];
  const daily = timeToMinutes(generation.end) - timeToMinutes(generation.start);
  for (const grupoClase of classes) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    const stage = stageForCourse(course);
    const recess = recessForStage(state.schoolSettings, stage);
    const recessMinutes = recess ? timeToMinutes(recess.fin) - timeToMinutes(recess.inicio) : 0;
    const capacity = Math.max(0, daily - recessMinutes) * DAYS.length;
    const target = Object.values(curriculumForCourse(settings, course)).reduce((sum, value) => sum + value, 0);
    if (target > capacity) errors.push(`${grupoClase}: ${target} min > ${capacity} min`);
  }
  return errors;
}

function teacherWorkloadErrors(state, settings, classes, teacherMap) {
  const required = new Map();
  for (const grupoClase of classes) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    for (const [subject, minutes] of Object.entries(curriculumForCourse(settings, course))) {
      const teacher = teacherMap.get(pairKey(grupoClase, subject));
      if (teacher) required.set(teacher.id, (required.get(teacher.id) || 0) + minutes);
    }
  }
  for (const session of state.sessions || []) {
    const group = (state.groups || []).find(item => item.id === session.groupId);
    const professionalId = session.professionalId || group?.professionalId;
    const start = timeToMinutes(session.inicio);
    const end = timeToMinutes(session.fin);
    if (professionalId && Number.isFinite(start) && Number.isFinite(end) && end > start) required.set(professionalId, (required.get(professionalId) || 0) + (end - start));
  }
  for (const prof of state.professionals || []) {
    const responsibilities = (prof.responsibilities || []).reduce((sum, item) => sum + Math.max(0, Number(item.weeklyMinutes) || 0), 0);
    if (responsibilities) required.set(prof.id, (required.get(prof.id) || 0) + responsibilities);
  }
  const errors = [];
  for (const prof of state.professionals || []) {
    if (!prof.maxWeeklyMinutes) continue;
    const minutes = required.get(prof.id) || 0;
    if (minutes > prof.maxWeeklyMinutes) errors.push(`${prof.nombre}: ${minutes}/${prof.maxWeeklyMinutes} min`);
  }
  return errors;
}

function teacherSupportConflict(professionalId, dayId, start, end, state) {
  for (const session of state.sessions || []) {
    const group = (state.groups || []).find(item => item.id === session.groupId);
    const sessionProfessional = session.professionalId || group?.professionalId;
    if (sessionProfessional !== professionalId || session.dia !== dayId) continue;
    if (overlapInterval(start, end, timeToMinutes(session.inicio), timeToMinutes(session.fin))) return true;
  }
  return false;
}

function ptalCompatibility(task, dayId, start, end, state, settings) {
  const students = (state.students || []).filter(student => normalize(student.grupoClase) === normalize(task.grupoClase));
  if (!students.length) return { blocked:false, score:0, overlapCount:0 };
  const classStudentIds = new Set(students.map(student => student.id));
  const priority = settingsFromAutomation(state, task.course, task.materia);
  let overlapCount = 0;
  for (const session of state.sessions || []) {
    if (session.dia !== dayId || !overlapInterval(start, end, timeToMinutes(session.inicio), timeToMinutes(session.fin))) continue;
    const group = (state.groups || []).find(item => item.id === session.groupId);
    if (!group) continue;
    const excluded = new Set(session.excludedStudentIds || []);
    const hasClassStudent = (group.studentIds || []).some(id => classStudentIds.has(id) && !excluded.has(id));
    if (!hasClassStudent) continue;
    overlapCount++;
  }
  if (!overlapCount) return { blocked:false, score:0, overlapCount:0 };
  if (priority === 'blocked') return { blocked:true, score:-Infinity, overlapCount };
  return { blocked:false, score:(PRIORITY_SCORE[priority] ?? 0) * overlapCount, overlapCount };
}

function settingsFromAutomation(state, course, subject) {
  return state.automationSettings?.courseRules?.[course]?.subjectPriorities?.[subject] || 'medium';
}

function splitMinutes(total, standard) {
  const result = [];
  let remaining = total;
  while (remaining > standard) {
    result.push(standard);
    remaining -= standard;
  }
  if (remaining > 0) result.push(remaining);
  return result;
}

function countChangedEntries(previous, next) {
  const previousKeys = new Set(previous.map(entry => entryKey(entry)));
  const nextKeys = new Set(next.map(entry => entryKey(entry)));
  let changed = 0;
  for (const key of nextKeys) if (!previousKeys.has(key)) changed++;
  for (const key of previousKeys) if (!nextKeys.has(key)) changed++;
  return changed;
}

function entryKey(entry) {
  return `${normalize(entry.grupoClase)}|${normalize(entry.materia)}|${entry.dia}|${entry.inicio}|${entry.fin}|${entry.professionalId || ''}`;
}

function item(id, label, ok, message) { return { id, label, ok, message }; }
function pairKey(group, subject) { return `${normalize(group)}\u0000${normalize(subject)}`; }
function normalize(value) { return String(value || '').trim().toLocaleLowerCase('es'); }
function safeId(value) { return normalize(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function pseudoOrder(value, seed) {
  let hash = 2166136261 ^ seed;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
function emptyProposal(state, readiness) {
  return { ok:false, readiness, classSchedules:state.classSchedules || [], unresolved:[], conflicts:[], score:0, stats:{ classes:0, subjects:0, blocks:0, minutes:0, changed:0, ptalAligned:0 } };
}
