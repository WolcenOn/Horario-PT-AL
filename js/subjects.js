import { stageForCourse } from './education.js';

export const SUBJECT_CATALOG = [
  { name:'Crecimiento en Armonía', stages:['infantil'] },
  { name:'Descubrimiento y Exploración del Entorno', stages:['infantil'] },
  { name:'Comunicación y Representación de la Realidad', stages:['infantil'] },
  { name:'Psicomotricidad', stages:['infantil'] },
  { name:'Lengua Castellana y Literatura', stages:['primaria'] },
  { name:'Matemáticas', stages:['primaria'] },
  { name:'Conocimiento del Medio Natural, Social y Cultural', stages:['primaria'] },
  { name:'Ciencias de la Naturaleza', stages:['primaria'] },
  { name:'Ciencias Sociales', stages:['primaria'] },
  { name:'Inglés', stages:['infantil','primaria'] },
  { name:'Segunda Lengua Extranjera', stages:['primaria'] },
  { name:'Lengua Cooficial y Literatura', stages:['primaria'] },
  { name:'Educación Física', stages:['primaria'] },
  { name:'Educación Artística', stages:['primaria'] },
  { name:'Música', stages:['primaria'] },
  { name:'Plástica', stages:['primaria'] },
  { name:'Educación en Valores Cívicos y Éticos', stages:['primaria'] },
  { name:'Religión', stages:['infantil','primaria'] },
  { name:'Atención Educativa', stages:['infantil','primaria'] },
  { name:'Tutoría', stages:['infantil','primaria'] }
];

export const FIXED_SUBJECT_NAMES = SUBJECT_CATALOG.map(item => item.name);

export function subjectsForStage(stage) {
  return SUBJECT_CATALOG
    .filter(item => !stage || item.stages.includes(stage))
    .map(item => item.name);
}

export function subjectsForClassGroup(state, grupoClase) {
  const normalized = normalize(grupoClase);
  const stages = [...new Set((state.students || [])
    .filter(student => normalize(student.grupoClase) === normalized)
    .map(student => stageForCourse(student.curso))
    .filter(Boolean))];

  const catalog = stages.length
    ? SUBJECT_CATALOG.filter(item => stages.some(stage => item.stages.includes(stage))).map(item => item.name)
    : FIXED_SUBJECT_NAMES;

  const legacy = (state.classSchedules || [])
    .filter(entry => normalize(entry.grupoClase) === normalized)
    .map(entry => entry.materia?.trim())
    .filter(subject => subject && !catalog.includes(subject));

  return [...new Set([...catalog, ...legacy])];
}

export function isFixedSubject(subject) {
  return FIXED_SUBJECT_NAMES.includes(subject);
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
