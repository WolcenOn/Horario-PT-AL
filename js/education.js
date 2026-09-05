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

export const DEFAULT_SCHOOL_SETTINGS = Object.freeze({
  id:'school',
  recesses:{
    infantil:{ inicio:'', fin:'' },
    primaria:{ inicio:'', fin:'' }
  }
});

export function normalizeSchoolSettings(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    id:'school',
    recesses:{
      infantil:normalizeRecess(source.recesses?.infantil),
      primaria:normalizeRecess(source.recesses?.primaria)
    }
  };
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
