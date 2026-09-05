import { overlapInterval, timeToMinutes } from './utils.js';

export const COURSE_OPTIONS = [
  { value:'Infantil 3 años', label:'Infantil · 3 años', stage:'infantil' },
  { value:'Infantil 4 años', label:'Infantil · 4 años', stage:'infantil' },
  { value:'Infantil 5 años', label:'Infantil · 5 años', stage:'infantil' },
  { value:'1º', label:'1º Primaria', stage:'primaria' },
  { value:'2º', label:'2º Primaria', stage:'primaria' },
  { value:'3º', label:'3º Primaria', stage:'primaria' },
  { value:'4º', label:'4º Primaria', stage:'primaria' },
  { value:'5º', label:'5º Primaria', stage:'primaria' },
  { value:'6º', label:'6º Primaria', stage:'primaria' }
];

export const MAX_SCHOOL_LINES = 6;

export const DEFAULT_SCHOOL_SETTINGS = Object.freeze({
  id:'school',
  recesses:{
    infantil:{ inicio:'', fin:'' },
    primaria:{ inicio:'', fin:'' }
  },
  structure:{
    configured:false,
    defaultLines:1,
    courseLines:{}
  }
});

export function normalizeSchoolSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id:'school',
    recesses:{
      infantil:normalizeRecess(source.recesses?.infantil),
      primaria:normalizeRecess(source.recesses?.primaria)
    },
    structure:normalizeSchoolStructure(source.structure)
  };
}

export function normalizeSchoolStructure(value) {
  const source = value && typeof value === 'object' ? value : {};
  const defaultLines = clampLines(source.defaultLines || 1);
  const courseLines = {};
  for (const course of COURSE_OPTIONS) {
    if (source.courseLines?.[course.value] != null) {
      courseLines[course.value] = clampLines(source.courseLines[course.value]);
    }
  }
  return {
    configured:source.configured === true,
    defaultLines,
    courseLines
  };
}

export function schoolStructureConfigured(settings) {
  return normalizeSchoolSettings(settings).structure.configured;
}

export function linesForCourse(settings, course) {
  const structure = normalizeSchoolSettings(settings).structure;
  return structure.courseLines[course] || structure.defaultLines;
}

export function classesForCourse(settings, course) {
  if (!schoolStructureConfigured(settings) || !COURSE_OPTIONS.some(option => option.value === course)) return [];
  const count = linesForCourse(settings, course);
  return Array.from({ length:count }, (_, index) => classGroupName(course, index));
}

export function configuredClassGroups(settings) {
  if (!schoolStructureConfigured(settings)) return [];
  return COURSE_OPTIONS.flatMap(course => classesForCourse(settings, course.value));
}

export function classGroupName(course, index) {
  const letter = String.fromCharCode(65 + Math.max(0, Math.min(MAX_SCHOOL_LINES - 1, Number(index) || 0)));
  return stageForCourse(course) === 'infantil' ? `${course} ${letter}` : `${course}${letter}`;
}

export function courseForClassGroup(settings, grupoClase) {
  const wanted = normalizeText(grupoClase);
  if (!wanted) return null;
  if (schoolStructureConfigured(settings)) {
    for (const course of COURSE_OPTIONS) {
      if (classesForCourse(settings, course.value).some(name => normalizeText(name) === wanted)) return course.value;
    }
  }
  for (const course of COURSE_OPTIONS) {
    const value = normalizeText(course.value);
    if (stageForCourse(course.value) === 'infantil') {
      if (wanted.startsWith(value)) return course.value;
    } else if (wanted.startsWith(value)) {
      return course.value;
    }
  }
  return null;
}

export function stageForCourse(course) {
  const exact = COURSE_OPTIONS.find(option => option.value === course);
  if (exact) return exact.stage;
  const normalized = String(course || '').trim().toLocaleLowerCase('es');
  if (!normalized) return null;
  if (normalized.includes('infantil') || /(?:^|\s)[345]\s*(?:años|anos)/.test(normalized)) return 'infantil';
  if (normalized.includes('primaria') || /^[1-6]\s*[ºoª]?/.test(normalized)) return 'primaria';
  return null;
}

export function recessForStage(settings, stage) {
  if (!['infantil','primaria'].includes(stage)) return null;
  const normalized = normalizeSchoolSettings(settings);
  const recess = normalized.recesses[stage];
  const start = timeToMinutes(recess.inicio);
  const end = timeToMinutes(recess.fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { ...recess, stage };
}

export function recessOverlaps(settings, stage, inicio, fin) {
  const recess = recessForStage(settings, stage);
  if (!recess) return false;
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return Boolean(overlapInterval(start, end, timeToMinutes(recess.inicio), timeToMinutes(recess.fin)));
}

export function validateSchoolSettings(settings) {
  const normalized = normalizeSchoolSettings(settings);
  for (const stage of ['infantil','primaria']) {
    const recess = normalized.recesses[stage];
    const hasStart = Boolean(recess.inicio);
    const hasEnd = Boolean(recess.fin);
    if (hasStart !== hasEnd) throw new Error(`El recreo de ${stageLabel(stage)} necesita hora de inicio y fin.`);
    if (!hasStart) continue;
    const start = timeToMinutes(recess.inicio);
    const end = timeToMinutes(recess.fin);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new Error(`El recreo de ${stageLabel(stage)} debe tener una franja horaria válida.`);
    }
  }
  if (normalized.structure.configured) {
    if (!isValidLineCount(normalized.structure.defaultLines)) throw new Error('El número general de líneas del centro no es válido.');
    for (const course of COURSE_OPTIONS) {
      const count = normalized.structure.courseLines[course.value] || normalized.structure.defaultLines;
      if (!isValidLineCount(count)) throw new Error(`El número de clases de ${course.label} no es válido.`);
    }
  }
  return normalized;
}

export function stageLabel(stage) {
  return stage === 'infantil' ? 'Infantil' : stage === 'primaria' ? 'Primaria' : 'Etapa';
}

function normalizeRecess(value) {
  return {
    inicio: typeof value?.inicio === 'string' ? value.inicio : '',
    fin: typeof value?.fin === 'string' ? value.fin : ''
  };
}

function clampLines(value) {
  const numeric = Math.round(Number(value) || 1);
  return Math.max(1, Math.min(MAX_SCHOOL_LINES, numeric));
}

function isValidLineCount(value) {
  return Number.isInteger(value) && value >= 1 && value <= MAX_SCHOOL_LINES;
}

function normalizeText(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
