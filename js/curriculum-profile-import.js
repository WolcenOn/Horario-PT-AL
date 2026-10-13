// Explicit, offline import of a locally verified curricular timetable.
// Territory and legal reference alone are metadata; no legislative figures
// are guessed from them. All hours are converted to exact 15-minute units.
import { COURSE_OPTIONS, stageForCourse } from './education.js';
import { subjectsForStage } from './subjects.js';
import { TERRITORY_OPTIONS } from './setup-presets.js';

const validCourses=new Set(COURSE_OPTIONS.map(course=>course.value));
const validTerritories=new Set(TERRITORY_OPTIONS);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

export function parseCurriculumProfile(raw,selectedTerritory='') {
  if(typeof raw!=='string'||!raw.trim()||raw.length>60000)
    throw new Error('Pega un perfil curricular JSON válido de hasta 60 KB.');
  let data;
  try { data=JSON.parse(raw); }
  catch { throw new Error('El perfil no es JSON válido; revisa su formato.'); }
  if(!isRecord(data))throw new Error('El perfil debe ser un objeto JSON.');
  const territory=String(data.territory||'').trim();
  const reference=String(data.legalReference||'').trim();
  if(!validTerritories.has(territory))
    throw new Error('El perfil debe indicar una comunidad o territorio reconocido.');
  if(selectedTerritory&&territory!==selectedTerritory.trim())
    throw new Error('La comunidad del perfil no coincide con la seleccionada. Revisa ambos datos antes de aplicar.');
  if(!reference||reference.length>300)
    throw new Error('Indica la norma y el anexo horarios concretos en legalReference.');
  if(!isRecord(data.weeklyHours)||Object.keys(data.weeklyHours).length===0)
    throw new Error('Añade weeklyHours con cursos, materias y horas semanales.');
  const profileName=String(data.profileName||'').trim();
  if(profileName.length>120)throw new Error('El nombre del perfil es demasiado largo.');
  const academicYear=String(data.academicYear||'').trim();
  if(academicYear.length>30)throw new Error('El curso académico es demasiado largo.');
  const sourceUrl=String(data.sourceUrl||'').trim();
  if(sourceUrl&&(sourceUrl.length>500||!/^https:\/\//i.test(sourceUrl)))
    throw new Error('El enlace de origen debe ser una dirección HTTPS.');
  // Optional provenance: old hand-written JSON without versions remains valid.
  const profileId=data.profileId===undefined?'':String(data.profileId).trim();
  const version=data.version===undefined?'':String(data.version).trim();
  if(Boolean(profileId)!==Boolean(version)||
    (profileId&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profileId))||
    (version&&!/^\d{4}\.\d{1,3}$/.test(version)))
    throw new Error('Indica un profileId y una version (AAAA.N) válidos.');
  const effectiveFrom=data.effectiveFrom===undefined?'':String(data.effectiveFrom).trim();
  if(effectiveFrom&&(!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||
    Number.isNaN(new Date(effectiveFrom+'T00:00:00Z').valueOf())||
    new Date(effectiveFrom+'T00:00:00Z').toISOString().slice(0,10)!==effectiveFrom))
    throw new Error('effectiveFrom debe ser una fecha válida AAAA-MM-DD.');
  const curriculum={};
  let totalSubjects=0;
  for(const [course,subjects] of Object.entries(data.weeklyHours)){
    if(!validCourses.has(course)||!isRecord(subjects)||!Object.keys(subjects).length)
      throw new Error(`Curso no reconocido o sin materias: ${course}.`);
    const allowed=new Set(subjectsForStage(stageForCourse(course)));
    curriculum[course]={};
    for(const [subject,hours] of Object.entries(subjects)){
      if(!allowed.has(subject))
        throw new Error(`La materia «${subject}» no está reconocida para ${course}. Usa los nombres del catálogo.`);
      if(typeof hours!=='number'||!Number.isFinite(hours)||hours<=0||hours>30||
        !Number.isInteger(hours*4))
        throw new Error(`${course} · ${subject}: las horas deben ser positivas y múltiplos de 0,25 h.`);
      curriculum[course][subject]=hours*60;
      totalSubjects++;
    }
  }
  if(totalSubjects===0)throw new Error('El perfil no contiene cargas horarias.');
  return {
    territory,legalReference:reference,profileName:profileName||`Perfil importado · ${territory}`,
    academicYear,sourceUrl,profileId,version,effectiveFrom,curriculum,courseCount:Object.keys(curriculum).length,
    subjectCount:totalSubjects
  };
}

export function applyCurriculumProfile(settings,profile) {
  if(!profile||!isRecord(profile.curriculum)||!profile.territory||!profile.legalReference)
    throw new Error('El perfil curricular no está validado.');
  return {
    ...settings,
    mode:'global',
    territory:profile.territory,
    legalReference:profile.legalReference,
    profileName:profile.profileName,
    academicYear:profile.academicYear||settings.academicYear||'',
    curriculum:profile.curriculum,
    curriculumSource:{
      kind:'imported',territory:profile.territory,legalReference:profile.legalReference,
      sourceUrl:profile.sourceUrl||'',
      profileId:profile.profileId||'',
      version:profile.version||'',
      effectiveFrom:profile.effectiveFrom||'',
      modified:false
    }
  };
}

// Compare normalized positive-minute entries, not property insertion order.
// Browsers render subjects in catalog order, which need not match JSON order.
export function sameCurriculumValues(a,b) {
  const entries=value=>Object.entries(value||{}).flatMap(([course,subjects])=>
    Object.entries(subjects||{}).filter(([,minutes])=>minutes>0)
      .map(([subject,minutes])=>[course,subject,minutes])
  ).sort((x,y)=>x[0].localeCompare(y[0])||x[1].localeCompare(y[1]));
  const left=entries(a),right=entries(b);
  return left.length===right.length&&left.every((item,index)=>
    item.every((part,field)=>part===right[index][field])
  );
}
