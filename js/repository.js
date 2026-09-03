import { getAll, put, remove } from './db.js';

export async function loadState() {
  const [students, professionals, groups, sessions, classSchedules] = await Promise.all([
    getAll('students'), getAll('professionals'), getAll('groups'), getAll('sessions'), getAll('classSchedules')
  ]);
  return { students, professionals, groups, sessions, classSchedules };
}

export const saveStudent = student => put('students', student);
export const saveProfessional = professional => put('professionals', professional);
export const saveGroup = group => put('groups', group);
export const saveSession = session => put('sessions', session);
export const saveClassSchedule = entry => put('classSchedules', entry);

export async function deleteStudent(studentId, state) {
  const affectedGroups = state.groups.filter(g => (g.studentIds || []).includes(studentId));
  await Promise.all(affectedGroups.map(group => put('groups', {
    ...group,
    studentIds: group.studentIds.filter(id => id !== studentId)
  })));
  await remove('students', studentId);
}

export async function deleteProfessional(professionalId, state) {
  const inUse = state.groups.filter(g => g.professionalId === professionalId);
  if (inUse.length) {
    throw new Error(`No se puede eliminar: está asignado a ${inUse.length} grupo(s). Reasigna esos grupos primero.`);
  }
  await remove('professionals', professionalId);
}

export async function deleteGroup(groupId, state) {
  const linkedSessions = state.sessions.filter(s => s.groupId === groupId);
  await Promise.all(linkedSessions.map(session => remove('sessions', session.id)));
  await remove('groups', groupId);
}

export const deleteSession = sessionId => remove('sessions', sessionId);
export const deleteClassSchedule = entryId => remove('classSchedules', entryId);
