import { DAYS } from './constants.js';
import { configuredClassGroups } from './education.js';
import { professionalCanWork } from './professional-availability.js';
import { timeToMinutes, minutesToTime } from './utils.js';

const WEEKDAY = new Map(DAYS.map((day, index) => [day.id, index]));
const PRIORITY = { CANCELABLE:10, FLEXIBLE:20, NORMAL:30, HIGH:40, CRITICAL:50 };

export function buildGestorEscuelaConfiguration(state) {
  const activeProfessionals = (state.professionals || []).filter(item => item.activo !== false);
  const activeGroups = (state.groups || []).filter(item => item.activo !== false);
  const activeStudents = (state.students || []).filter(item => item.activo !== false);
  const sessions = (state.sessions || []).filter(item => {
    const group = activeGroups.find(groupItem => groupItem.id === item.groupId);
    return Boolean(group);
  });
  const classSchedules = state.classSchedules || [];
  const errors = [];
  const warnings = [];

  const classNames = collectClassNames(state, activeStudents, classSchedules);
  const groupIdByClass = new Map(classNames.map(name => [normalize(name), stableId('G', name)]));
  const groups = classNames.map(name => ({
    id:groupIdByClass.get(normalize(name)),
    label:name,
    stage:stageLabel(name),
    tutor_teacher_id:resolveTutorTeacherId(name, activeStudents, activeProfessionals)
  }));

  const teacherById = new Map(activeProfessionals.map(item => [item.id, item]));
  const teachers = activeProfessionals.map(professional => ({
    id:limitId(professional.id, 'T', professional.nombre || professional.id),
    display_name:String(professional.nombre || professional.id),
    profile:teacherProfile(professional),
    substitution_count:Math.max(0, Math.round(Number(professional.substitutionCount) || 0)),
    can_cover_groups:new Set(groups.map(group => group.id)),
    specialties:new Set(teacherSpecialties(professional)),
    emergency_only:professional.emergencyOnly === true
  }));
  const backendTeacherId = new Map(activeProfessionals.map((professional, index) => [professional.id, teachers[index].id]));

  const subjectNames = [...new Set(classSchedules.map(entry => String(entry.materia || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity:'base' }));
  const subjectIdByName = new Map(subjectNames.map(name => [normalize(name), stableId('S', name)]));
  const subjects = subjectNames.map(name => ({ id:subjectIdByName.get(normalize(name)), label:name, required_specialty:null }));

  const timeSlots = buildAtomicTimeSlots(state, sessions, classSchedules, activeProfessionals);
  const slotById = new Map(timeSlots.map(slot => [slot.id, slot]));
  if (!groups.length) errors.push('GestorEscuela necesita al menos un grupo-clase. Configura la estructura del centro o asigna grupo de clase al alumnado.');
  if (!teachers.length) errors.push('GestorEscuela necesita al menos un docente/profesional activo.');
  if (!timeSlots.length) errors.push('No hay franjas horarias suficientes para construir la configuración del backend.');

  const activities = [];
  const occupiedTeacherSlots = new Set();
  const occupiedGroupSlots = new Set();

  for (const entry of classSchedules) {
    const classId = groupIdByClass.get(normalize(entry.grupoClase));
    if (!classId) {
      warnings.push(`Se omite ${entry.grupoClase || 'una clase'} · ${entry.materia || 'sin materia'} porque el grupo-clase no se pudo resolver.`);
      continue;
    }
    const professional = resolveClassTeacher(entry, activeProfessionals);
    if (!professional) {
      errors.push(`${entry.grupoClase} · ${entry.materia}: falta enlazar un docente real en el horario de aula.`);
      continue;
    }
    const teacherId = backendTeacherId.get(professional.id);
    const subjectId = subjectIdByName.get(normalize(entry.materia));
    for (const slot of slotsInside(entry.inicio, entry.fin, timeSlots)) {
      const weekday = WEEKDAY.get(entry.dia);
      if (weekday == null) continue;
      const groupSlotKey = `${classId}|${weekday}|${slot.id}`;
      if (occupiedGroupSlots.has(groupSlotKey)) {
        errors.push(`${entry.grupoClase} tiene más de una actividad ordinaria el ${entry.dia} en ${slot.label}.`);
        continue;
      }
      occupiedGroupSlots.add(groupSlotKey);
      const teacherSlotKey = `${teacherId}|${weekday}|${slot.id}`;
      if (occupiedTeacherSlots.has(teacherSlotKey)) warnings.push(`${professional.nombre} aparece en más de una actividad en ${entry.dia} ${slot.label}.`);
      occupiedTeacherSlots.add(teacherSlotKey);
      activities.push({
        id:activityId('C', entry.id, weekday, slot.id),
        weekday,
        slot_id:slot.id,
        activity_type:'CLASS',
        teacher_id:teacherId,
        group_id:classId,
        subject_id:subjectId || null,
        required_specialty:null,
        priority:PRIORITY.NORMAL,
        movable:false,
        cancelable:false
      });
    }
  }

  const studentById = new Map(activeStudents.map(student => [student.id, student]));
  const supportGroupById = new Map(activeGroups.map(group => [group.id, group]));
  for (const session of sessions) {
    const supportGroup = supportGroupById.get(session.groupId);
    if (!supportGroup) continue;
    const professional = teacherById.get(session.professionalId || supportGroup.professionalId);
    if (!professional) {
      errors.push(`La sesión ${session.id} referencia un profesional que GestorEscuela no puede resolver.`);
      continue;
    }
    const teacherId = backendTeacherId.get(professional.id);
    const studentClasses = [...new Set((supportGroup.studentIds || [])
      .map(id => studentById.get(id)?.grupoClase)
      .filter(Boolean)
      .map(value => normalize(value)))];
    const classId = studentClasses.length === 1 ? groupIdByClass.get(studentClasses[0]) || null : null;
    for (const slot of slotsInside(session.inicio, session.fin, timeSlots)) {
      const weekday = WEEKDAY.get(session.dia);
      if (weekday == null) continue;
      const teacherSlotKey = `${teacherId}|${weekday}|${slot.id}`;
      if (occupiedTeacherSlots.has(teacherSlotKey)) warnings.push(`${professional.nombre} tiene un solapamiento local el ${session.dia} en ${slot.label}; se enviará al backend tal como está.`);
      occupiedTeacherSlots.add(teacherSlotKey);
      activities.push({
        id:activityId(supportGroup.tipo === 'PT' ? 'P' : 'A', session.id, weekday, slot.id),
        weekday,
        slot_id:slot.id,
        activity_type:supportGroup.tipo === 'PT' ? 'PT' : 'AL',
        teacher_id:teacherId,
        group_id:classId,
        subject_id:null,
        required_specialty:supportGroup.tipo === 'PT' ? 'PT' : 'AL',
        priority:PRIORITY.HIGH,
        movable:false,
        cancelable:false
      });
    }
  }

  // GestorEscuela todavía no tiene disponibilidad por intervalos. Para no perder esa
  // restricción, cada franja no disponible se representa como una actividad crítica e
  // inamovible. El solver la tratará como ocupación dura y no propondrá al docente.
  for (const professional of activeProfessionals) {
    const teacherId = backendTeacherId.get(professional.id);
    for (const day of DAYS) {
      const weekday = WEEKDAY.get(day.id);
      for (const slot of timeSlots) {
        const teacherSlotKey = `${teacherId}|${weekday}|${slot.id}`;
        const canWork = professionalCanWork(professional, day.id, slot.start, slot.end);
        if (canWork) continue;
        if (occupiedTeacherSlots.has(teacherSlotKey)) {
          warnings.push(`${professional.nombre} tiene una actividad en ${day.label} ${slot.label} fuera de su disponibilidad efectiva.`);
          continue;
        }
        occupiedTeacherSlots.add(teacherSlotKey);
        activities.push({
          id:activityId('X', professional.id, weekday, slot.id),
          weekday,
          slot_id:slot.id,
          activity_type:'SUPPORT',
          teacher_id:teacherId,
          group_id:null,
          subject_id:null,
          required_specialty:null,
          priority:PRIORITY.CRITICAL,
          movable:false,
          cancelable:false
        });
      }
    }
  }

  const dedupedErrors = unique(errors);
  const dedupedWarnings = unique(warnings);
  return {
    configuration:{ groups, subjects, time_slots:timeSlots.map(({ start, end, ...slot }) => slot), teachers, activities },
    report:{
      ready:dedupedErrors.length === 0,
      errors:dedupedErrors,
      warnings:dedupedWarnings,
      counts:{ groups:groups.length, subjects:subjects.length, timeSlots:timeSlots.length, teachers:teachers.length, activities:activities.length },
      slots:timeSlots,
      mappings:{
        classGroups:Object.fromEntries([...groupIdByClass.entries()]),
        teachers:Object.fromEntries([...backendTeacherId.entries()]),
        subjects:Object.fromEntries([...subjectIdByName.entries()])
      }
    }
  };
}

export function slotIdsForInterval(adapterResult, inicio, fin) {
  return slotsInside(inicio, fin, adapterResult?.report?.slots || []).map(slot => slot.id);
}

function buildAtomicTimeSlots(state, sessions, classSchedules, professionals) {
  const boundaries = new Set();
  const addInterval = (inicio, fin) => {
    const start = timeToMinutes(inicio);
    const end = timeToMinutes(fin);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      boundaries.add(start);
      boundaries.add(end);
    }
  };
  classSchedules.forEach(entry => addInterval(entry.inicio, entry.fin));
  sessions.forEach(session => addInterval(session.inicio, session.fin));
  for (const professional of professionals) {
    for (const day of DAYS) {
      (professional.disponibilidad?.[day.id] || []).forEach(interval => addInterval(interval.inicio, interval.fin));
      (professional.bloqueosExternos?.[day.id] || []).forEach(interval => addInterval(interval.inicio, interval.fin));
    }
  }
  const school = state.schoolSettings?.recesses || {};
  addInterval(school.infantil?.inicio, school.infantil?.fin);
  addInterval(school.primaria?.inicio, school.primaria?.fin);
  addInterval(state.centerPlanningSettings?.generation?.start, state.centerPlanningSettings?.generation?.end);

  const sorted = [...boundaries].sort((a, b) => a - b);
  if (sorted.length < 2) return [];
  return sorted.slice(0, -1).map((start, index) => {
    const end = sorted[index + 1];
    return { id:`TS${String(index + 1).padStart(2, '0')}`, label:`${minutesToTime(start)}–${minutesToTime(end)}`, order:index + 1, start:minutesToTime(start), end:minutesToTime(end) };
  }).filter(slot => timeToMinutes(slot.end) > timeToMinutes(slot.start));
}

function slotsInside(inicio, fin, slots) {
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return slots.filter(slot => timeToMinutes(slot.start) >= start && timeToMinutes(slot.end) <= end);
}

function collectClassNames(state, students, schedules) {
  const configured = configuredClassGroups(state.schoolSettings);
  return unique([
    ...configured,
    ...students.map(student => student.grupoClase),
    ...schedules.map(entry => entry.grupoClase)
  ].map(value => String(value || '').trim()).filter(Boolean)).sort((a, b) => a.localeCompare(b, 'es', { numeric:true }));
}

function resolveTutorTeacherId(className, students, professionals) {
  const tutorNames = unique(students.filter(student => normalize(student.grupoClase) === normalize(className)).map(student => student.tutor).filter(Boolean));
  if (tutorNames.length !== 1) return null;
  const professional = professionals.find(item => normalize(item.nombre) === normalize(tutorNames[0]));
  return professional ? limitId(professional.id, 'T', professional.nombre) : null;
}

function resolveClassTeacher(entry, professionals) {
  if (entry.professionalId) {
    const linked = professionals.find(item => item.id === entry.professionalId);
    if (linked) return linked;
  }
  if (entry.docente) {
    const matches = professionals.filter(item => normalize(item.nombre) === normalize(entry.docente));
    if (matches.length === 1) return matches[0];
  }
  const assignments = professionals.filter(professional => (professional.teachingAssignments || []).some(item =>
    normalize(item.grupoClase) === normalize(entry.grupoClase) && normalize(item.materia) === normalize(entry.materia)
  ));
  return assignments.length === 1 ? assignments[0] : null;
}

function teacherProfile(professional) {
  if (professional.tipo === 'PT') return 'PT';
  if (professional.tipo === 'AL') return 'AL';
  if ((professional.responsibilities || []).some(item => item.tipo === 'equipo-directivo')) return 'MANAGEMENT';
  if (professional.tutoriaGrupo) return 'TUTOR';
  return 'SPECIALIST';
}

function teacherSpecialties(professional) {
  const result = [];
  if (professional.tipo === 'PT') result.push('PT');
  if (professional.tipo === 'AL') result.push('AL');
  if (professional.especialidad) result.push(String(professional.especialidad).trim());
  return unique(result.filter(Boolean));
}

function stageLabel(className) {
  const text = normalize(className);
  return text.includes('infantil') ? 'Infantil' : 'Primaria';
}

function stableId(prefix, value) {
  const raw = String(value || 'item');
  const slug = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42) || 'item';
  return `${prefix}-${slug}-${hash(raw)}`.slice(0, 64);
}

function limitId(value, prefix, fallback) {
  const text = String(value || '').trim();
  if (text && text.length <= 64) return text;
  return stableId(prefix, fallback || text);
}

function activityId(prefix, sourceId, weekday, slotId) {
  return `${prefix}-${hash(sourceId)}-${weekday}-${slotId}`.slice(0, 96);
}

function hash(value) {
  let result = 2166136261;
  for (const char of String(value || '')) {
    result ^= char.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function unique(values) {
  return [...new Set(values)];
}
