import { COURSE_OPTIONS, configuredClassGroups, courseForClassGroup, stageForCourse } from './education.js';
import { subjectsForStage } from './subjects.js';
import { timeToMinutes } from './utils.js';

export const CENTER_PLANNING_ID = 'centerPlanning';
export const PLANNING_MODES = [
  { value:'ptal', label:'Solo PT / AL' },
  { value:'global', label:'Centro completo' }
];
export const PROFESSIONAL_TYPES = ['PT', 'AL', 'DOCENTE'];
export const RESPONSIBILITY_TYPES = [
  { value:'coordinacion', label:'Coordinación' },
  { value:'plan-programa', label:'Plan / programa' },
  { value:'equipo-directivo', label:'Equipo directivo' },
  { value:'otra', label:'Otra función' }
];

export function normalizeCenterPlanningSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const mode = PLANNING_MODES.some(option => option.value === source.mode) ? source.mode : 'ptal';
  const curriculum = {};
  for (const [course, subjects] of Object.entries(source.curriculum || {})) {
    if (!course || !subjects || typeof subjects !== 'object' || Array.isArray(subjects)) continue;
    curriculum[course] = {};
    for (const [subject, rawMinutes] of Object.entries(subjects)) {
      const minutes = Math.max(0, Math.round(Number(rawMinutes) || 0));
      if (subject && minutes > 0) curriculum[course][subject] = minutes;
    }
  }
  return {
    id:CENTER_PLANNING_ID,
    mode,
    profileName:String(source.profileName || '').trim(),
    territory:String(source.territory || '').trim(),
    academicYear:String(source.academicYear || '').trim(),
    legalReference:String(source.legalReference || '').trim(),
    curriculum
  };
}

export function curriculumForCourse(settings, course) {
  const normalized = normalizeCenterPlanningSettings(settings);
  return { ...(normalized.curriculum[course] || {}) };
}

export function curriculumSubjectsForCourse(course) {
  return subjectsForStage(stageForCourse(course));
}

export function curriculumCoverage(state, settings) {
  const normalized = normalizeCenterPlanningSettings(settings);
  const groups = configuredClassGroups(state.schoolSettings);
  return groups.map(grupoClase => {
    const course = courseForClassGroup(state.schoolSettings, grupoClase);
    const target = curriculumForCourse(normalized, course);
    const actual = {};
    for (const entry of state.classSchedules || []) {
      if (normalizeText(entry.grupoClase) !== normalizeText(grupoClase)) continue;
      const start = timeToMinutes(entry.inicio);
      const end = timeToMinutes(entry.fin);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      actual[entry.materia] = (actual[entry.materia] || 0) + (end - start);
    }
    const subjects = [...new Set([...Object.keys(target), ...Object.keys(actual)])]
      .sort((a, b) => a.localeCompare(b, 'es', { sensitivity:'base' }));
    const rows = subjects.map(subject => ({
      subject,
      target:target[subject] || 0,
      actual:actual[subject] || 0,
      difference:(actual[subject] || 0) - (target[subject] || 0)
    }));
    const targetTotal = rows.reduce((sum, row) => sum + row.target, 0);
    const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
    const configured = Object.keys(target).length > 0;
    const complete = configured && rows.every(row => row.target === 0 || row.actual === row.target);
    return { grupoClase, course, rows, targetTotal, actualTotal, configured, complete };
  });
}

export function normalizeProfessionalProfile(professional) {
  const current = professional && typeof professional === 'object' ? professional : {};
  const type = PROFESSIONAL_TYPES.includes(current.tipo) ? current.tipo : 'DOCENTE';
  return {
    ...current,
    tipo:type,
    especialidad:String(current.especialidad || '').trim(),
    tutoriaGrupo:String(current.tutoriaGrupo || '').trim(),
    teachingAssignments:normalizeTeachingAssignments(current.teachingAssignments),
    responsibilities:normalizeResponsibilities(current.responsibilities)
  };
}

export function normalizeTeachingAssignments(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(item => ({
    grupoClase:String(item?.grupoClase || '').trim(),
    materia:String(item?.materia || '').trim()
  })).filter(item => {
    if (!item.grupoClase || !item.materia) return false;
    const key = `${normalizeText(item.grupoClase)}\u0000${normalizeText(item.materia)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeResponsibilities(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    tipo:RESPONSIBILITY_TYPES.some(option => option.value === item?.tipo) ? item.tipo : 'otra',
    nombre:String(item?.nombre || '').trim(),
    weeklyMinutes:Math.max(0, Math.round(Number(item?.weeklyMinutes) || 0))
  })).filter(item => item.nombre);
}

export function courseOptionsUsedByCenter(schoolSettings) {
  const groups = configuredClassGroups(schoolSettings);
  if (!groups.length) return COURSE_OPTIONS;
  const used = new Set(groups.map(group => courseForClassGroup(schoolSettings, group)).filter(Boolean));
  return COURSE_OPTIONS.filter(course => used.has(course.value));
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
