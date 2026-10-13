// Only vetted versioned JSON assets are indexed. Neither listing nor loading
// a regulation changes the school's local curriculum or schedules.
import { TERRITORY_OPTIONS } from './setup-presets.js';
import { parseCurriculumProfile } from './curriculum-profile-import.js';

const BASE_URL=new URL('../curriculum-regulations/',import.meta.url);
const CATALOG_URL=new URL('catalog.json',BASE_URL);
const territories=new Set(TERRITORY_OPTIONS);
const idPattern=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern=/^\d{4}\.\d{1,3}$/;

export function regulationKey(item) {
  return item.profileId+'@'+item.version;
}

function validateEntry(entry) {
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||
    typeof entry.profileId!=='string'||!idPattern.test(entry.profileId)||
    typeof entry.version!=='string'||!versionPattern.test(entry.version)||
    !territories.has(entry.territory)||
    typeof entry.legalReference!=='string'||!entry.legalReference.trim()||
    entry.legalReference.length>300)
    throw new Error('El catálogo contiene una versión normativa incompleta o inválida.');
  if(entry.academicYear!==undefined&&
    (typeof entry.academicYear!=='string'||entry.academicYear.length>30))
    throw new Error('El año académico del perfil no es válido.');
  return {
    profileId:entry.profileId,version:entry.version,territory:entry.territory,
    legalReference:entry.legalReference.trim(),academicYear:entry.academicYear||''
  };
}

async function localJson(url,fetchImpl) {
  const response=await fetchImpl(url);
  if(!response?.ok)throw new Error('No se pudieron leer los perfiles normativos locales.');
  const raw=await response.text();
  if(raw.length>60000)throw new Error('El catálogo o perfil normativo supera el límite de 60 KB.');
  try{return {raw,json:JSON.parse(raw)};}
  catch{throw new Error('El catálogo o perfil normativo contiene JSON no válido.');}
}

export async function listCurriculumRegulations({fetchImpl=fetch}={}) {
  const {json}=await localJson(CATALOG_URL,fetchImpl);
  if(json?.schemaVersion!==1||!Array.isArray(json?.profiles)||
    json.profiles.length>150)
    throw new Error('Versión del catálogo curricular no reconocida.');
  const entries=json.profiles.map(validateEntry);
  const seen=new Set();
  for(const entry of entries){
    const key=regulationKey(entry);
    if(seen.has(key))throw new Error('Hay versiones normativas duplicadas en el catálogo.');
    seen.add(key);
  }
  return entries;
}

export async function loadCurriculumRegulation(entry,{fetchImpl=fetch}={}) {
  const descriptor=validateEntry(entry);
  // Deterministic local file: no remote URLs or arbitrary relative paths.
  const path='profiles/'+descriptor.profileId+'/'+descriptor.version+'.json';
  const {raw}=await localJson(new URL(path,BASE_URL),fetchImpl);
  const profile=parseCurriculumProfile(raw,descriptor.territory);
  if(profile.profileId!==descriptor.profileId||
    profile.version!==descriptor.version||
    profile.territory!==descriptor.territory||
    profile.legalReference!==descriptor.legalReference||
    (descriptor.academicYear&&profile.academicYear!==descriptor.academicYear)||
    !profile.sourceUrl||!profile.effectiveFrom)
    throw new Error('El archivo normativo no coincide con su ficha del catálogo o carece de fuente/fecha.');
  return {raw,profile};
}
