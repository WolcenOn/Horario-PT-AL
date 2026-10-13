// Local, actionable timetable diagnostics. This module never sends pupil data.
// Routes and field IDs are a hard-coded allowlist: backend text cannot decide
// what screen or DOM selector will be opened.
import { normalizeCenterPlanningSettings } from './center-planning.js';
import { configuredClassGroups, courseForClassGroup } from './education.js';

const normalize = value=>String(value||'').trim().toLocaleLowerCase('es');
const destinations={
  centerPlanning:{label:'Revisar planificación',focusId:'globalStart'},
  curriculum:{label:'Configurar currículo',view:'centerPlanning',focusId:'curriculum'},
  mode:{label:'Activar centro completo',view:'centerPlanning',focusId:'mode'},
  teachers:{label:'Revisar profesorado',view:'professionals'},
  classes:{label:'Configurar clases',view:'classSchedules'},
  patterns:{label:'Revisar patrones temporales',view:'temporalPatterns'},
  rooms:{label:'Configurar salas',view:'centerPlanning',focusId:'roomResources'},
  travel:{label:'Revisar desplazamientos',view:'centerPlanning',focusId:'travelRules'},
  groups:{label:'Revisar grupos PT/AL',view:'groups'},
  sessions:{label:'Revisar sesiones PT/AL',view:'sessions'},
  activities:{label:'Revisar actividades',view:'centerActivities'},
  extraction:{label:'Revisar restricciones PT/AL',view:'automation'}
};
const route=key=>{
  const item=destinations[key];
  if(!item)return null;
  return {view:item.view||key,focusId:item.focusId||'',label:item.label};
};
const issue=(message,severity,key)=>({message,severity,action:route(key)});

export function correctionForMessage(message) {
  const text=normalize(message);
  // Specific diagnoses before more general class/professional hints.
  if (/sala|room|aforo|equipamiento|accesib|espacio compartido/.test(text))return route('rooms');
  if (/desplazamiento|trayecto|ruta entre|ubicacion|ubicación/.test(text))return route('travel');
  if (/patr[oó]n|duraci[oó]n|d[ií]as permitidos|franja permitida|extracci[oó]n|asignaturas bloqueadas/.test(text))
    return /extracci[oó]n|asignaturas bloqueadas/.test(text)?route('extraction'):route('patterns');
  if (/profesional|docente|profesor|disponibilidad|tutor[ií]a/.test(text))return route('teachers');
  if (/grupo pt|grupo al|grupos pt\/al|grupo de apoyo|agrupaci[oó]n/.test(text))return route('groups');
  if (/sesiones pt|sesiones al|sesiones de apoyo/.test(text))return route('sessions');
  if (/grupo-clase|estructura|clases configuradas/.test(text))return route('classes');
  if (/materia|curr[ií]culo|horas semanales|carga semanal|asignatura|matem[aá]ticas/.test(text))
    return route('curriculum');
  if (/modo centro|modo global|centro completo/.test(text))return route('mode');
  if (/actividades del centro|reuni[oó]n|actividad m[oó]vil/.test(text))return route('activities');
  if (/jornada|hora de inicio|hora de fin|rejilla/.test(text))return route('centerPlanning');
  return null; // No misleading destination for generic or inconclusive errors.
}

export function issuesFromMessages(messages,severity='warning') {
  return (messages||[]).map(message=>issue(message,severity,null)).map(item=>({
    ...item,action:correctionForMessage(item.message)
  }));
}

export function analyzeWeeklyReadiness(state) {
  const settings=normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const generation=settings.generation;
  const issues=[];
  if(settings.mode!=='global'){
    issues.push(issue('Activa «Centro completo» para usar la simulación semanal de GestorEscuela.','error','mode'));
    return issues;
  }
  const classes=configuredClassGroups(state.schoolSettings);
  if(!classes.length){
    issues.push(issue('Falta configurar la estructura de clases del centro.','error','classes'));
    return issues;
  }
  const people=(state.professionals||[]).filter(person=>person.activo!==false);
  let curriculumCount=0;
  for(const className of classes){
    const course=courseForClassGroup(state.schoolSettings,className);
    for(const [subject,minutes] of Object.entries(settings.curriculum?.[course]||{})){
      if(!(minutes>0))continue;
      curriculumCount++;
      const assigned=people.filter(prof=>(prof.teachingAssignments||[]).some(item=>
        normalize(item.grupoClase)===normalize(className)&&
        normalize(item.materia)===normalize(subject)
      ));
      if(assigned.length!==1){
        issues.push(issue(
          `${className} · ${subject}: ${assigned.length===0?'no tiene docente activo asignado':'tiene varios docentes activos asignados'}; debe haber exactamente uno.`,
          'error','teachers'
        ));
      }
    }
  }
  if(!curriculumCount)issues.push(issue(
    'No hay horas semanales de materias configuradas para las clases del centro.',
    'error','curriculum'
  ));
  const roomById=new Map(generation.roomResources.map(room=>[room.roomId,room]));
  for(const service of ['PT','AL']){
    const required=generation.supportRoomRequirements?.[service]||[];
    if(!required.length)continue;
    const eligible=[...roomById.values()].filter(room=>
      required.every(feature=>(room.features||[]).includes(feature))
    );
    if(!eligible.length){
      issues.push(issue(
        `Apoyos ${service}: ninguna sala inventariada tiene todo el equipamiento obligatorio.`,
        'error','rooms'
      ));
    }
  }
  if(generation.autoAssignSupportRooms&&!generation.roomResources.length){
    issues.push(issue(
      'La asignación automática de salas está activa pero no hay salas con aforo configurado.',
      'warning','rooms'
    ));
  }
  return issues.slice(0,40);
}

export function correctionDestination(key) {
  return route(key);
}
