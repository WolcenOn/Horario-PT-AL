// Student-free, preview-only contract between Horario-PT-AL and GestorEscuela.
// It does NOT include pupil lists or notes, nor overwrite local/remote plans.
import { DAYS } from './constants.js';
import { curriculumForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile, validateGlobalGeneration } from './center-planning.js';
import { configuredClassGroups, courseForClassGroup, recessForStage, stageForCourse } from './education.js';
import { professionalCanWork } from './professional-availability.js';
import { buildAnonymousSupportPreview } from './weekly-support-preview.js';
import { dayAllowed, effectiveMaxSessionsPerDay, planSessionDurations, subjectPatternForCourse, validateTimePattern } from './time-patterns.js';
import { minutesToTime, timeToMinutes } from './utils.js';

const normalize = value => String(value || '').trim().toLocaleLowerCase('es');
const days = new Map(DAYS.map((day, index) => [day.id, index]));

function appendUnavailability(result, prof, day, start, end) {
  let blockedSince = null;
  for (let minute = start; minute < end; minute += 15) {
    const working = professionalCanWork(prof, day.id, minutesToTime(minute), minutesToTime(minute + 15));
    if (!working && blockedSince == null) blockedSince = minute;
    if (working && blockedSince != null) {
      result.push({
        weekday:days.get(day.id), start_time:minutesToTime(blockedSince),
        end_time:minutesToTime(minute), teacher_id:prof.id
      });
      blockedSince = null;
    }
  }
  if (blockedSince != null) result.push({
    weekday:days.get(day.id), start_time:minutesToTime(blockedSince),
    end_time:minutesToTime(end), teacher_id:prof.id
  });
}

export function buildWeeklyPreviewRequest(state, rawSettings = state.centerPlanningSettings, {autoFormGroups=true}={}) {
  const settings = normalizeCenterPlanningSettings(rawSettings);
  if (settings.mode !== 'global') throw new Error('Activa el modo Centro completo para calcular una propuesta semanal.');
  const generation = validateGlobalGeneration(settings);
  const begin = timeToMinutes(generation.start);
  const finish = timeToMinutes(generation.end);
  if (begin % 15 || finish % 15) throw new Error('La jornada debe respetar la rejilla de 15 minutos.');

  const active = (state.professionals || []).filter(prof => prof.activo !== false).map(normalizeProfessionalProfile);
  const lessons = [];
  const teachersUsed = new Map();
  const groupsUsed = new Set();
  for (const grupoClase of configuredClassGroups(state.schoolSettings)) {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    for (const [subject, weeklyMinutes] of Object.entries(curriculumForCourse(settings, course))) {
      const eligible = active.filter(prof => prof.teachingAssignments.some(assignment =>
        normalize(assignment.grupoClase) === normalize(grupoClase)
        && normalize(assignment.materia) === normalize(subject)));
      if (eligible.length !== 1) {
        throw new Error(`Asigna exactamente un docente activo a ${grupoClase} · ${subject} antes de usar GestorEscuela.`);
      }
      const pattern = subjectPatternForCourse(settings, course, subject);
      validateTimePattern(pattern, `${grupoClase} · ${subject}`);
      const durations = planSessionDurations(weeklyMinutes, pattern, generation.lessonMinutes, 15);
      const allowedDays = DAYS.map((day, index) => dayAllowed(pattern, day.id) ? index : -1).filter(index => index >= 0);
      if (!allowedDays.length) throw new Error(`${grupoClase} · ${subject}: no hay días permitidos.`);
      lessons.push({
        group_id:grupoClase, subject_id:subject, teacher_id:eligible[0].id,
        weekly_minutes:weeklyMinutes, durations, allowed_days:allowedDays,
        preferred_days:pattern.preferredDays.map(day => days.get(day)).filter(index => index != null),
        earliest_start:pattern.earliestStart || null,
        latest_end:pattern.latestEnd || null,
        max_sessions_per_day:effectiveMaxSessionsPerDay(pattern, generation.maxSameSubjectPerDay),
        // Classroom ID is a location proxy only for user-configured travel time.
        ...((generation.travelMinutes || generation.travelRules.length)
          ? {location_id:`class:${grupoClase}`} : {})
      });
      teachersUsed.set(eligible[0].id, eligible[0]);
      groupsUsed.add(grupoClase);
    }
  }
  if (!lessons.length) throw new Error('Define primero las horas semanales de alguna materia.');
  const busy = [];
  for (const prof of teachersUsed.values()) {
    for (const day of DAYS) appendUnavailability(busy, prof, day, begin, finish);
  }

  // A recess blocks whole-class lessons but not a PT/AL professional's own
  // schedule. PT/AL extraction policies and pupil-level clashes come later.
  for (const grupoClase of groupsUsed) {
    const stage = stageForCourse(courseForClassGroup(state.schoolSettings, grupoClase));
    const recess = recessForStage(state.schoolSettings, stage);
    if (recess) {
      busy.push({
        weekday:0, start_time:recess.inicio, end_time:recess.fin,
        group_id:grupoClase
      });
      for (let index = 1; index < DAYS.length; index++) {
        busy.push({
          weekday:index, start_time:recess.inicio, end_time:recess.fin,
          group_id:grupoClase
        });
      }
    }
  }

  const support = buildAnonymousSupportPreview(state, lessons, {
    autoFormGroups, supportRoomId:generation.supportRoomId
  });
  busy.push(...support.busy);
  for (const teacher of support.teachers) {
    if (teachersUsed.has(teacher.id)) continue;
    for (const day of DAYS) appendUnavailability(busy, teacher, day, begin, finish);
  }

  const warnings = [
    'Vista previa parcial PT/AL: no optimiza actividades móviles sin hora fija, rutas reales ni asignaciones automáticas de salas.',
    ...((generation.travelMinutes || generation.travelRules.length) && !generation.supportRoomId
      ? ['Desplazamientos PT/AL: no se conoce la sala de apoyos; solo se aplica traslado entre las aulas de clase configuradas.']
      : []),
    ...(generation.supportRoomId
      ? ['La sala PT/AL indicada se trata como un único recurso físico exclusivo para todos los apoyos enviados.']
      : []),
    'Los horarios existentes no se sustituyen ni se envían a la base de datos como propuesta confirmada.',
    ...support.warnings
  ];
  for (const activity of settings.weeklyActivities.filter(item => item.active !== false && item.weeklyMinutes > 0)) {
    if (!(activity.scheduledSlots || []).length) continue;
    for (const slot of activity.scheduledSlots) {
      const weekday = days.get(slot.dia);
      if (weekday == null) continue;
      for (const teacherId of new Set([...(activity.assignedTeacherIds || []), ...(slot.teacherIds || [])])) {
        if (teachersUsed.has(teacherId)) busy.push({
          weekday, start_time:slot.inicio, end_time:slot.fin, teacher_id:teacherId
        });
      }
      for (const groupId of activity.classGroupIds || []) {
        if (groupsUsed.has(groupId)) busy.push({
          weekday, start_time:slot.inicio, end_time:slot.fin, group_id:groupId
        });
      }
    }
  }
  if (lessons.length + support.supports.length + support.groupSupports.length > 100 ||
      lessons.reduce((sum, lesson) => sum + lesson.durations.length, 0)
        + support.supports.reduce((sum, request) => sum + request.durations.length, 0)
        + support.groupSupports.reduce((sum, group) =>
          sum + Math.max(...group.participants.map(person=>person.weekly_minutes))/group.session_minutes, 0
        ) > 150 ||
      busy.length > 500) {
    throw new Error('La vista previa supera los límites actuales de GestorEscuela; reduce el alcance del cálculo.');
  }
  return {
    payload:{
      start_time:generation.start, end_time:generation.end,
      lessons, supports:support.supports, group_supports:support.groupSupports,
      busy, max_time_seconds:5,
      travel_minutes:generation.travelMinutes,
      travel_rules:generation.travelRules.map(rule=>({
        from_location_id:rule.fromLocationId,
        to_location_id:rule.toLocationId,
        minutes:rule.minutes
      }))
    },
    warnings,
    autoGroups:support.autoGroups || 0
  };
}
