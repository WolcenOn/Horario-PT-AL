import { get, getAll, put, remove, replaceClassSubjectData, replaceStoreData } from './db.js';
import { normalizeSchoolSettings } from './education.js';
import { normalizeAutomationSettings } from './automation-core.js';
import { normalizeCenterPlanningSettings } from './center-planning.js';

export async function loadState() {
  const [students, professionals, groups, sessions, classSchedules, schoolSettings, automationSettings, centerPlanningSettings] = await Promise.all([
    getAll('students'),
    getAll('professionals'),
    getAll('groups'),
    getAll('sessions'),
    getAll('classSchedules'),
    get('settings', 'school'),
    get('settings', 'automation'),
    get('settings', 'centerPlanning')
  ]);
  return {
    students,
    professionals,
    groups,
    sessions,
    classSchedules,
    schoolSettings: normalizeSchoolSettings(schoolSettings),
    automationSettings: normalizeAutomationSettings(automationSettings),
    centerPlanningSettings: normalizeCenterPlanningSettings(centerPlanningSettings)
  };
}

export const saveStudent = student => put('students', student);
export const saveProfessional = professional => put('professionals', professional);
export const saveGroup = group => put('groups', group);
export const saveSession = session => put('sessions', session);
export const saveClassSchedule = entry => entry?.__weeklyBatch
  ? replaceClassSubjectData(entry.grupoClase, entry.materia, entry.entries || [])
  : put('classSchedules', entry);
export const saveSchoolSettings = settings => put('settings', normalizeSchoolSettings(settings));
export const saveAutomationSettings = settings => put('settings', normalizeAutomationSettings(settings));
export const saveCenterPlanningSettings = settings => put('settings', normalizeCenterPlanningSettings(settings));
export const replaceSessions = sessions => replaceStoreData('sessions', sessions);
export const replaceClassSubjectSchedule = (grupoClase, materia, entries) => replaceClassSubjectData(grupoClase, materia, entries);

export async function deleteStudent(studentId, state) {
  const affectedGroups = state.groups.filter(g => (g.studentIds || []).includes(studentId));
  await Promise.all(affectedGroups.map(group => put('groups', {
    ...group,
    studentIds: group.studentIds.filter(id => id !== studentId)
  })));
  await remove('students', studentId);
}

export async function deleteProfessional(professionalId, state) {
  const supportGroups = state.groups.filter(g => g.professionalId === professionalId);
  const classEntries = (state.classSchedules || []).filter(entry => entry.professionalId === professionalId);
  if (supportGroups.length || classEntries.length) {
    const details = [
      supportGroups.length ? `${supportGroups.length} grupo(s) PT/AL` : '',
      classEntries.length ? `${classEntries.length} franja(s) de aula` : ''
    ].filter(Boolean).join(' y ');
    throw new Error(`No se puede eliminar: está asignado a ${details}. Reasigna esos elementos primero.`);
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
