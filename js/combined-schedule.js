import { DAYS } from './constants.js';
import { classEntriesForInterval } from './class-schedules.js';
import { canExtractForSupport, resolveSupportPolicy } from './support-policy.js';
import { overlapInterval, timeToMinutes } from './utils.js';

const DAY_ORDER = new Map(DAYS.map((day, index) => [day.id, index]));

export function buildCombinedScheduleProjection(state) {
  const groups = new Map((state.groups || []).map(group => [group.id, group]));
  const professionals = new Map((state.professionals || []).map(professional => [professional.id, professional]));
  const students = new Map((state.students || []).map(student => [student.id, student]));
  const classSchedules = state.classSchedules || [];
  const courseRules = state.automationSettings?.courseRules || {};

  const supportItems = (state.sessions || [])
    .map(session => buildSupportItem(session, { groups, professionals, students, classSchedules, courseRules }))
    .filter(Boolean)
    .sort(itemCompare);

  attachSupportOverlapWarnings(supportItems);

  for (const item of supportItems) {
    item.status = combinedStatus([
      ...(item.studentChecks.length ? item.studentChecks.map(check => check.status) : ['warning']),
      ...(item.overlaps.length ? ['blocked'] : [])
    ]);
  }

  const counts = supportItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, { ok:0, warning:0, blocked:0 });

  return {
    ordinaryBlocks:classSchedules.length,
    supportItems,
    counts,
    days:DAYS.map(day => ({
      ...day,
      items:supportItems.filter(item => item.dia === day.id)
    }))
  };
}

function buildSupportItem(session, context) {
  const group = context.groups.get(session.groupId);
  if (!group) return null;
  const professionalId = session.professionalId || group.professionalId;
  const professional = context.professionals.get(professionalId);
  const supportType = String(session.tipo || group.tipo || professional?.tipo || '').toUpperCase();
  if (!['PT', 'AL'].includes(supportType)) return null;

  const excluded = new Set(session.excludedStudentIds || []);
  const studentIds = (group.studentIds || []).filter(id => !excluded.has(id));
  const studentChecks = studentIds
    .map(id => context.students.get(id))
    .filter(Boolean)
    .map(student => evaluateStudentSource(student, session, supportType, context));

  return {
    id:session.id,
    session,
    group,
    professional,
    professionalId,
    professionalName:professional?.nombre || '',
    supportType,
    dia:session.dia,
    inicio:session.inicio,
    fin:session.fin,
    studentIds,
    studentChecks,
    overlaps:[],
    status:combinedStatus(studentChecks.length ? studentChecks.map(check => check.status) : ['warning'])
  };
}

function evaluateStudentSource(student, session, supportType, context) {
  const entries = classEntriesForInterval(
    context.classSchedules,
    student.grupoClase,
    session.dia,
    session.inicio,
    session.fin
  );

  if (!entries.length) {
    return {
      student,
      status:'warning',
      sources:[],
      message:'No hay materia ordinaria cargada para esta franja.'
    };
  }

  const sources = entries.map(entry => {
    const rule = context.courseRules?.[student.curso] || {};
    const preference = rule.subjectPriorities?.[entry.materia] ?? 'medium';
    const extraction = rule.subjectPolicies?.[entry.materia]?.extraction ?? rule.subjectPolicies?.[entry.materia] ?? null;
    const policy = resolveSupportPolicy(preference, extraction);
    const allowed = canExtractForSupport(policy, supportType);
    return {
      entry,
      policy,
      allowed,
      status:!allowed ? 'blocked' : policy.preference === 'avoid' ? 'warning' : 'ok'
    };
  });

  const status = combinedStatus(sources.map(source => source.status));
  return {
    student,
    status,
    sources,
    message:status === 'blocked'
      ? `La materia de origen no permite extracción a ${supportType}.`
      : status === 'warning'
        ? 'La extracción es posible, pero alguna materia está marcada como mejor evitar.'
        : 'La extracción es compatible con la configuración actual.'
  };
}

function attachSupportOverlapWarnings(items) {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    const left = items[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const right = items[rightIndex];
      if (left.dia !== right.dia) continue;
      if (!overlapInterval(timeToMinutes(left.inicio), timeToMinutes(left.fin), timeToMinutes(right.inicio), timeToMinutes(right.fin))) continue;

      const sharedStudents = left.studentIds.filter(id => right.studentIds.includes(id));
      const sameProfessional = Boolean(left.professionalId && left.professionalId === right.professionalId);
      if (!sharedStudents.length && !sameProfessional) continue;

      left.overlaps.push({ itemId:right.id, sharedStudents, sameProfessional });
      right.overlaps.push({ itemId:left.id, sharedStudents, sameProfessional });
    }
  }
}

function combinedStatus(statuses) {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('warning')) return 'warning';
  return 'ok';
}

function itemCompare(a, b) {
  return (DAY_ORDER.get(a.dia) ?? 99) - (DAY_ORDER.get(b.dia) ?? 99)
    || timeToMinutes(a.inicio) - timeToMinutes(b.inicio)
    || String(a.supportType).localeCompare(String(b.supportType), 'es')
    || String(a.id || '').localeCompare(String(b.id || ''));
}
