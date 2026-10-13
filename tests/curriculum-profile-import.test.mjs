import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCurriculumProfile, applyCurriculumProfile } from '../js/curriculum-profile-import.js';
import { normalizeCenterPlanningSettings } from '../js/center-planning.js';

const example=()=>({
  territory:'Andalucía',legalReference:'Norma y anexo consultados (ejemplo de formato)',
  profileName:'Carga de ensayo',academicYear:'2026/27',
  sourceUrl:'https://www.juntadeandalucia.es/',
  weeklyHours:{
    '1º':{Matemáticas:4.5,'Lengua Castellana y Literatura':5},
    '2º':{Matemáticas:3.25}
  }
});
const parse=(data,territory='Andalucía')=>parseCurriculumProfile(JSON.stringify(data),territory);

test('convierte los cuartos de hora sin perder minutos y conserva la fuente',()=>{
  const profile=parse(example());
  assert.deepEqual(profile.curriculum,{'1º':{Matemáticas:270,'Lengua Castellana y Literatura':300},'2º':{Matemáticas:195}});
  assert.equal(profile.courseCount,2);
  assert.equal(profile.subjectCount,3);
  assert.equal(profile.sourceUrl,'https://www.juntadeandalucia.es/');
});

test('aplicar el perfil cambia los objetivos y la norma, sin tocar otros ajustes',()=>{
  const current=normalizeCenterPlanningSettings({
    mode:'global',territory:'Andalucía',
    curriculum:{'1º':{Matemáticas:180},'3º':{Inglés:90}},
    generation:{start:'08:00',end:'13:00'}
  });
  const next=normalizeCenterPlanningSettings(applyCurriculumProfile(current,parse(example())));
  assert.deepEqual(next.curriculum,{'1º':{Matemáticas:270,'Lengua Castellana y Literatura':300},'2º':{Matemáticas:195}});
  assert.equal(next.generation.start,'08:00');
  assert.equal(next.legalReference,example().legalReference);
  assert.equal(next.curriculumSource.sourceUrl,example().sourceUrl);
  assert.deepEqual(current.curriculum,{'1º':{Matemáticas:180},'3º':{Inglés:90}});
});

test('sin perfil, elegir solo comunidad y normativa no inventa cifras',()=>{
  const settings=normalizeCenterPlanningSettings({
    territory:'Andalucía',legalReference:'Norma seleccionada'
  });
  assert.deepEqual(settings.curriculum,{});
});

test('rechaza perfiles de otra comunidad',()=>{
  assert.throws(()=>parse(example(),'Galicia'),/no coincide/);
});

test('rechaza perfiles sin norma o con territorio no reconocido',()=>{
  assert.throws(()=>parse({...example(),legalReference:''}),/norma/);
  assert.throws(()=>parse({...example(),territory:'Ninguna'}),/reconocido/);
});

test('rechaza asignaturas o cursos inventados y datos vacíos',()=>{
  assert.throws(()=>parse({...example(),weeklyHours:{'10º':{Matemáticas:2}}}),/Curso no reconocido/);
  assert.throws(()=>parse({...example(),weeklyHours:{'1º':{'Nombre del alumno':2}}}),/materia/);
  assert.throws(()=>parse({...example(),weeklyHours:{}}),/weeklyHours/);
});

test('impide unidades ambiguas, horas negativas y fracciones inferiores a 15 minutos',()=>{
  for(const hours of [240,-1,0,4.1,'4.5',null,30.5]){
    assert.throws(()=>parse({...example(),weeklyHours:{'1º':{Matemáticas:hours}}}),/horas deben/);
  }
});

test('rechaza JSON roto, archivos enormes y enlaces de origen no seguros',()=>{
  assert.throws(()=>parseCurriculumProfile('{'),/JSON válido/);
  assert.throws(()=>parseCurriculumProfile(' '.repeat(60001)),/60 KB/);
  assert.throws(()=>parse({...example(),sourceUrl:'javascript:alert(1)'}),/HTTPS/);
});

test('admite materias y cursos de infantil con nombres de catálogo',()=>{
  const profile=parse({...example(),weeklyHours:{
    'Infantil 3 años':{'Crecimiento en Armonía':2.25}
  }});
  assert.equal(profile.curriculum['Infantil 3 años']['Crecimiento en Armonía'],135);
});


test('conserva procedencia normada y estado personalizado tras normalizar',()=>{
  const versioned={...example(),profileId:'es-example-primaria',
    version:'2026.1',effectiveFrom:'2026-09-01'};
  const saved=normalizeCenterPlanningSettings(applyCurriculumProfile(
    normalizeCenterPlanningSettings({}),parse(versioned)
  ));
  assert.equal(saved.curriculumSource.version,'2026.1');
  assert.equal(saved.curriculumSource.profileId,'es-example-primaria');
  const modified=normalizeCenterPlanningSettings({
    ...saved,curriculum:{'1º':{Matemáticas:240}},
    curriculumSource:{...saved.curriculumSource,modified:true}
  });
  assert.equal(modified.curriculumSource.modified,true);
  assert.equal(modified.curriculumSource.version,'2026.1');
});

test('los perfiles manuales antiguos no necesitan ID ni versión',()=>{
  const saved=normalizeCenterPlanningSettings(applyCurriculumProfile(
    normalizeCenterPlanningSettings({}),parse(example())
  ));
  assert.equal(saved.curriculumSource.kind,'imported');
  assert.equal(saved.curriculumSource.version,'');
});

test('rechaza IDs o versiones incompletos o malformados',()=>{
  assert.throws(()=>parse({...example(),profileId:'test'}),/profileId/);
  assert.throws(()=>parse({...example(),version:'2026.1'}),/profileId/);
  assert.throws(()=>parse({...example(),profileId:'../escape',version:'2026.1'}),/profileId/);
  assert.throws(()=>parse({...example(),profileId:'es-example',version:'latest'}),/profileId/);
});
