import { timeToMinutes } from './utils.js';

export function sessionDuration(session) {
  const start = timeToMinutes(session.inicio);
  const end = timeToMinutes(session.fin);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
}

export function calculateStudentHours(students, groups, sessions) {
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const result = new Map();

  for (const student of students) {
    result.set(student.id, {
      studentId: student.id,
      ptTarget: student.horasPTObjetivoMin || 0,
      ptAssigned: 0,
      alTarget: student.horasALObjetivoMin || 0,
      alAssigned: 0
    });
  }

  for (const session of sessions) {
    const group = groupMap.get(session.groupId);
    if (!group || group.activo === false) continue;
    const duration = sessionDuration(session);
    if (!duration) continue;
    const excluded = new Set(session.excludedStudentIds || []);
    for (const studentId of group.studentIds || []) {
      if (excluded.has(studentId)) continue;
      const row = result.get(studentId);
      if (!row) continue;
      if (group.tipo === 'PT') row.ptAssigned += duration;
      if (group.tipo === 'AL') row.alAssigned += duration;
    }
  }

  for (const row of result.values()) {
    row.ptPending = row.ptTarget - row.ptAssigned;
    row.alPending = row.alTarget - row.alAssigned;
  }
  return result;
}

export function deriveStudentStatus(hours, hasConflict = false) {
  if (hasConflict) return 'Conflicto';
  if (hours.ptPending < 0 || hours.alPending < 0) return 'Exceso';
  if (hours.ptPending > 0 || hours.alPending > 0) return 'Pendiente';
  return 'Completo';
}

export function totalsFromHours(hoursMap) {
  const totals = { ptTarget: 0, ptAssigned: 0, ptPending: 0, ptExcess: 0, alTarget: 0, alAssigned: 0, alPending: 0, alExcess: 0 };
  for (const row of hoursMap.values()) {
    totals.ptTarget += row.ptTarget;
    totals.ptAssigned += row.ptAssigned;
    totals.alTarget += row.alTarget;
    totals.alAssigned += row.alAssigned;
    totals.ptPending += Math.max(0, row.ptPending);
    totals.ptExcess += Math.max(0, -row.ptPending);
    totals.alPending += Math.max(0, row.alPending);
    totals.alExcess += Math.max(0, -row.alPending);
  }
  return totals;
}
