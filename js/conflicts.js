import { fullName, minutesToTime, overlapInterval, timeToMinutes } from './utils.js';
import { externalBlockOverlap } from './professional-availability.js';

export function detectConflicts({ students, professionals, groups, sessions }) {
  const studentMap = new Map(students.map(s => [s.id, s]));
  const professionalMap = new Map(professionals.map(p => [p.id, p]));
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const conflicts = [];

  const resolved = sessions.map(session => {
    const group = groupMap.get(session.groupId);
    const professionalId = session.professionalId || group?.professionalId;
    const excluded = new Set(session.excludedStudentIds || []);
    const studentIds = (group?.studentIds || []).filter(id => !excluded.has(id));
    return {
      ...session,
      group,
      professionalId,
      studentIds,
      startMin: timeToMinutes(session.inicio),
      endMin: timeToMinutes(session.fin)
    };
  });

  for (const item of resolved) {
    if (!item.group) {
      conflicts.push(makeConflict('integrity', 'grave', [item.id], [], [], `La sesión ${item.id} referencia un grupo inexistente.`));
      continue;
    }
    if (!Number.isFinite(item.startMin) || !Number.isFinite(item.endMin) || item.endMin <= item.startMin) {
      conflicts.push(makeConflict('invalid-time', 'grave', [item.id], [], [], `La sesión de ${item.group.nombre} tiene un horario no válido.`));
    }
    const professional = professionalMap.get(item.professionalId);
    if (!professional) {
      conflicts.push(makeConflict('integrity', 'grave', [item.id], [], [], `La sesión de ${item.group.nombre} no tiene un profesional válido.`));
    } else {
      if (professional.tipo !== item.group.tipo) {
        conflicts.push(makeConflict('service-mismatch', 'grave', [item.id], [], [professional.id], `${professional.nombre} es ${professional.tipo} pero está asignado a un grupo ${item.group.tipo}.`));
      }
      const hasDayAvailability = Object.prototype.hasOwnProperty.call(professional.disponibilidad || {}, item.dia);
      const availability = professional.disponibilidad?.[item.dia] || [];
      const inside = availability.some(interval => {
        const start = timeToMinutes(interval.inicio);
        const end = timeToMinutes(interval.fin);
        return item.startMin >= start && item.endMin <= end;
      });
      if (hasDayAvailability && !inside) {
        conflicts.push(makeConflict('professional-availability', 'aviso', [item.id], [], [professional.id], `${professional.nombre} no está disponible el ${item.dia} de ${item.inicio} a ${item.fin}.`));
      }
      const external = externalBlockOverlap(professional, item.dia, item.inicio, item.fin);
      if (external) {
        conflicts.push(makeConflict(
          'professional-external-center', 'grave', [item.id], [], [professional.id],
          `${professional.nombre} está en ${external.centro} el ${item.dia} de ${external.inicio} a ${external.fin}.`
        ));
      }
    }

    for (const studentId of item.studentIds) {
      const student = studentMap.get(studentId);
      if (!student) continue;
      for (const restriction of student.restricciones || []) {
        if (restriction.dia !== item.dia || restriction.tipo !== 'no-salir') continue;
        const overlap = overlapInterval(item.startMin, item.endMin, timeToMinutes(restriction.inicio), timeToMinutes(restriction.fin));
        if (overlap) {
          conflicts.push(makeConflict(
            'student-restriction', 'aviso', [item.id], [studentId], [],
            `${fullName(student)} tiene una restricción el ${item.dia} entre ${restriction.inicio} y ${restriction.fin}.`
          ));
        }
      }
    }
  }

  for (const professional of professionals) {
    if (!professional.maxWeeklyMinutes) continue;
    const assigned = resolved
      .filter(item => item.professionalId === professional.id && Number.isFinite(item.startMin) && Number.isFinite(item.endMin) && item.endMin > item.startMin)
      .reduce((sum, item) => sum + (item.endMin - item.startMin), 0);
    if (assigned > professional.maxWeeklyMinutes) {
      conflicts.push(makeConflict(
        'professional-max-hours', 'aviso',
        resolved.filter(item => item.professionalId === professional.id).map(item => item.id),
        [], [professional.id],
        `${professional.nombre} supera su máximo semanal configurado (${assigned} min asignados frente a ${professional.maxWeeklyMinutes} min).`
      ));
    }
  }

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const a = resolved[i];
      const b = resolved[j];
      if (a.dia !== b.dia) continue;
      const overlap = overlapInterval(a.startMin, a.endMin, b.startMin, b.endMin);
      if (!overlap) continue;

      if (a.professionalId && a.professionalId === b.professionalId) {
        const prof = professionalMap.get(a.professionalId);
        conflicts.push(makeConflict(
          'professional-overlap', 'grave', [a.id, b.id], [], [a.professionalId],
          `${prof?.nombre || 'Un profesional'} aparece simultáneamente en ${a.group?.nombre || a.id} y ${b.group?.nombre || b.id} el ${a.dia} de ${minutesToTime(overlap.start)} a ${minutesToTime(overlap.end)}.`
        ));
      }

      const commonStudents = a.studentIds.filter(id => b.studentIds.includes(id));
      for (const studentId of commonStudents) {
        const student = studentMap.get(studentId);
        conflicts.push(makeConflict(
          'student-overlap', 'grave', [a.id, b.id], [studentId], [],
          `${fullName(student) || 'Un alumno'} aparece simultáneamente en ${a.group?.nombre || a.id} y ${b.group?.nombre || b.id} el ${a.dia} de ${minutesToTime(overlap.start)} a ${minutesToTime(overlap.end)}.`
        ));
      }
    }
  }

  return conflicts;
}

function makeConflict(type, severity, sessionIds, studentIds, professionalIds, message) {
  return {
    id: `${type}_${sessionIds.join('_')}_${studentIds.join('_')}_${professionalIds.join('_')}`,
    type, severity, sessionIds, studentIds, professionalIds, message
  };
}

export function conflictsForSession(conflicts, sessionId) {
  return conflicts.filter(c => c.sessionIds.includes(sessionId));
}

export function conflictStudentIds(conflicts) {
  return new Set(conflicts.flatMap(c => c.studentIds));
}
