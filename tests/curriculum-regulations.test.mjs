import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  listCurriculumRegulations,loadCurriculumRegulation,regulationKey
} from '../js/curriculum-regulations.js';
import {parseCurriculumProfile,applyCurriculumProfile} from '../js/curriculum-profile-import.js';
import {normalizeCenterPlanningSettings} from '../js/center-planning.js';

const entry={
  profileId:'es-example-primaria',version:'2026.1',territory:'Andalucía',
  legalReference:'Norma de prueba, anexo ficticio',academicYear:'2026/27'
};
const pack={...entry,profileName:'Ejemplo no oficial',effectiveFrom:'2026-09-01',
  sourceUrl:'https://example.org/norma',
  weeklyHours:{'1º':{Matemáticas:4.5}}
};
const fakeFetch=(index,profile=pack)=>async url=>{
  const path=String(url);
  if(path.endsWith('/catalog.json'))return {ok:true,text:async()=>JSON.stringify(index)};
  if(path.endsWith('/profiles/es-example-primaria/2026.1.json'))
    return {ok:true,text:async()=>JSON.stringify(profile)};
  return {ok:false};
};
const catalog={schemaVersion:1,profiles:[entry]};

test('el catálogo real está vacío hasta verificar anexos horarios oficiales',async()=>{
  const raw=await readFile(new URL('../curriculum-regulations/catalog.json',import.meta.url),'utf8');
  assert.deepEqual(JSON.parse(raw),{schemaVersion:1,profiles:[]});
});

test('lista una revisión, la carga sin aplicarla y conserva procedencia',async()=>{
  const fetchImpl=fakeFetch(catalog);
  const list=await listCurriculumRegulations({fetchImpl});
  assert.equal(regulationKey(list[0]),'es-example-primaria@2026.1');
  const loaded=await loadCurriculumRegulation(list[0],{fetchImpl});
  assert.equal(loaded.profile.curriculum['1º'].Matemáticas,270);
  assert.equal(loaded.profile.version,'2026.1');
  assert.equal(loaded.profile.effectiveFrom,'2026-09-01');
  const saved=normalizeCenterPlanningSettings({curriculum:{'1º':{Matemáticas:180}}});
  assert.equal(saved.curriculum['1º'].Matemáticas,180);
});

test('aplicar revisión crea copia y no modifica el currículo anterior',()=>{
  const old=normalizeCenterPlanningSettings({curriculum:{'1º':{Matemáticas:180}}});
  const profile=parseCurriculumProfile(JSON.stringify(pack),'Andalucía');
  const next=normalizeCenterPlanningSettings(applyCurriculumProfile(old,profile));
  assert.equal(next.curriculum['1º'].Matemáticas,270);
  assert.equal(next.curriculumSource.profileId,entry.profileId);
  assert.equal(next.curriculumSource.version,'2026.1');
  assert.equal(next.curriculumSource.modified,false);
  assert.equal(old.curriculum['1º'].Matemáticas,180);
});

test('un cambio legislativo posterior no modifica un perfil ya aplicado',()=>{
  const original=normalizeCenterPlanningSettings(applyCurriculumProfile(
    normalizeCenterPlanningSettings({}),parseCurriculumProfile(JSON.stringify(pack))
  ));
  const subsequent=parseCurriculumProfile(JSON.stringify({
    ...pack,version:'2027.1',weeklyHours:{'1º':{Matemáticas:5}}
  }));
  assert.equal(subsequent.curriculum['1º'].Matemáticas,300);
  assert.equal(original.curriculum['1º'].Matemáticas,270);
  assert.equal(original.curriculumSource.version,'2026.1');
});

test('rechaza versiones duplicadas y IDs que podrían escapar del directorio',async()=>{
  await assert.rejects(
    listCurriculumRegulations({fetchImpl:fakeFetch({...catalog,profiles:[entry,entry]})}),
    /duplicadas/
  );
  await assert.rejects(
    listCurriculumRegulations({fetchImpl:fakeFetch({...catalog,profiles:[
      {...entry,profileId:'../other'}
    ]})}),/inválida/
  );
  await assert.rejects(
    listCurriculumRegulations({fetchImpl:fakeFetch({schemaVersion:999,profiles:[]})}),
    /Versión del catálogo/
  );
});

test('impide cargar archivos cuya versión o fuente no coincidan',async()=>{
  await assert.rejects(
    loadCurriculumRegulation(entry,{fetchImpl:fakeFetch(catalog,{...pack,version:'2027.1'})}),
    /no coincide/
  );
  await assert.rejects(
    loadCurriculumRegulation(entry,{fetchImpl:fakeFetch(catalog,{...pack,sourceUrl:''})}),
    /no coincide/
  );
});

test('solo solicita rutas locales calculadas con ID y revisión validados',async()=>{
  const urls=[];
  const fetchImpl=async url=>{
    urls.push(String(url));
    return fakeFetch(catalog)(url);
  };
  const list=await listCurriculumRegulations({fetchImpl});
  await loadCurriculumRegulation(list[0],{fetchImpl});
  assert.ok(urls[0].endsWith('/curriculum-regulations/catalog.json'));
  assert.ok(urls[1].endsWith('/curriculum-regulations/profiles/es-example-primaria/2026.1.json'));
});
