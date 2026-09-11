import { COURSE_OPTIONS, MAX_SCHOOL_LINES, normalizeSchoolSettings, schoolStructureConfigured } from './education.js';
import { normalizeCenterPlanningSettings } from './center-planning.js';

export const TERRITORY_OPTIONS = Object.freeze([
  'Andalucía',
  'Aragón',
  'Principado de Asturias',
  'Illes Balears',
  'Canarias',
  'Cantabria',
  'Castilla-La Mancha',
  'Castilla y León',
  'Cataluña',
  'Comunitat Valenciana',
  'Extremadura',
  'Galicia',
  'Comunidad de Madrid',
  'Región de Murcia',
  'Comunidad Foral de Navarra',
  'País Vasco',
  'La Rioja',
  'Ceuta',
  'Melilla'
]);

const TERRITORY_SET = new Set(TERRITORY_OPTIONS);

export function buildQuickStartPreset(state, { territory, defaultLines }) {
  const selectedTerritory = String(territory || '').trim();
  if (!TERRITORY_SET.has(selectedTerritory)) throw new Error('Selecciona una comunidad o territorio válido.');

  const lines = Number(defaultLines);
  if (!Number.isInteger(lines) || lines < 1 || lines > MAX_SCHOOL_LINES) {
    throw new Error(`El número de líneas debe estar entre 1 y ${MAX_SCHOOL_LINES}.`);
  }

  const currentSchool = normalizeSchoolSettings(state?.schoolSettings);
  const currentPlanning = normalizeCenterPlanningSettings(state?.centerPlanningSettings);
  const structureAlreadyConfigured = schoolStructureConfigured(currentSchool);
  const schoolSettings = structureAlreadyConfigured
    ? currentSchool
    : {
        ...currentSchool,
        structure:{
          configured:true,
          defaultLines:lines,
          courseLines:Object.fromEntries(COURSE_OPTIONS.map(course => [course.value, lines]))
        }
      };

  const centerPlanningSettings = {
    ...currentPlanning,
    mode:'global',
    territory:selectedTerritory,
    profileName:currentPlanning.profileName || `Base editable · ${selectedTerritory}`
  };

  return {
    schoolSettings,
    centerPlanningSettings,
    structureChanged:!structureAlreadyConfigured,
    territory:selectedTerritory,
    defaultLines:structureAlreadyConfigured ? currentSchool.structure.defaultLines : lines,
    classCount:COURSE_OPTIONS.reduce((sum, course) => sum + (schoolSettings.structure.courseLines[course.value] || schoolSettings.structure.defaultLines), 0),
    reviewRequired:['jornada','currículo','recreos','referencia normativa']
  };
}
