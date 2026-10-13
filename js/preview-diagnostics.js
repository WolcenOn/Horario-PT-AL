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
  supportLocation:{label:'Indicar sala PT/AL',view:'centerPlanning',focusId:'supportRoomId'},
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

// Only these backend diagnostic codes may suggest first-party sections.
// A proven overlap can come from multiple sources; don't guess a correction.
const solverCodeRoutes=Object.freeze({
  LESSON_WINDOW_CAPACITY:'patterns',
  TEACHER_WEEKLY_CAPACITY:'teachers',
  CLASS_WEEKLY_CAPACITY:'centerPlanning',
  FIXED_TEACHER_OVERLAP:null,
  FIXED_CLASS_OVERLAP:null
});

export function correctionForMessage(message) {
  const text=normalize(message);
  // Specific diagnoses before more general class/professional hints.
  if (/^.+\s\/\s.+:\srequiere\s\d+\smin/.test(text))return route('curriculum');
  if (/desplazamientos pt\/al: hay apoyos sin ubicaci[oó]n conocida/.test(text))
    return route('supportLocation');
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

// New backend contract: prefer stable codes and never treat server-provided
// view/focus/URL values or unclassified explanations as navigation instructions.
// Older servers without "diagnostics" still use the legacy message adapter.
export function issuesFromPreviewResult(result) {
  const severity=result?.status==='infeasible'?'error':'warning';
  const reasons=Array.isArray(result?.reasons)?result.reasons:[];
  if(!Array.isArray(result?.diagnostics))return issuesFromMessages(reasons,severity);
  const structured=result.diagnostics.filter(item=>
    item && typeof item.message==='string' && item.message.trim()
  ).map(item=>({
    code:typeof item.code==='string'?item.code:'',
    message:item.message,
    severity,
    action:Object.hasOwn(solverCodeRoutes,item.code)
      ?route(solverCodeRoutes[item.code]):null
  }));
  const seen=new Set(structured.map(item=>item.message));
  // Unclassified backend reasons are still visible, but cannot guess an action.
  return [
    ...structured,
    ...reasons.filter(message=>typeof message==='string'&&!seen.has(message))
      .map(message=>issue(message,severity,null))
  ];
}

// A conservative capacity check of the *anonymous* request, before network IO.
// It deliberately ignores movable ordinary lessons, extraction preferences,
// room choices and fragmented free windows: those remain for CP-SAT to decide.
const clockMinutes=value=>{
  if(typeof value!=='string'||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value))return null;
  const [hour,minute]=value.split(':').map(Number);
  return hour*60+minute;
};

function freeMinutes(payload,kind,id,allowedDays) {
  const start=clockMinutes(payload.start_time);
  const end=clockMinutes(payload.end_time);
  if(!id||start===null||end===null||end<=start||
    !Array.isArray(allowedDays)||!allowedDays.length||
    allowedDays.some(day=>!Number.isInteger(day)||day<0||day>4))return null;
  const blocks=Array.isArray(payload.busy)?payload.busy:[];
  let free=0;
  for(const day of new Set(allowedDays)){
    const occupied=[];
    for(const block of blocks){
      if(block?.[kind]!==id||block.weekday!==day)continue;
      const from=clockMinutes(block.start_time);
      const to=clockMinutes(block.end_time);
      if(from===null||to===null||to<=from)return null;
      const begin=Math.max(start,from);
      const finish=Math.min(end,to);
      if(begin<finish)occupied.push([begin,finish]);
    }
    occupied.sort((a,b)=>a[0]-b[0]);
    let covered=0;
    let boundary=start;
    for(const [begin,finish] of occupied){
      covered+=Math.max(0,finish-Math.max(begin,boundary));
      boundary=Math.max(boundary,finish);
    }
    free+=end-start-covered;
  }
  return free;
}

export function analyzeWeeklyPayloadCapacity(payload) {
  if(!payload||!Array.isArray(payload.busy))return [];
  const issues=[];
  const examine=(need,kind,index,required,token)=>{
    if(!Number.isInteger(required)||required<=0)return;
    const teacherFree=freeMinutes(payload,'teacher_id',need.teacher_id,need.allowed_days);
    const prefix=`Apoyo ${need.service==='AL'?'AL':'PT'} ${kind} n.º ${index+1}`;
    if(teacherFree!==null&&required>teacherFree){
      issues.push({
        ...issue(
          `${prefix}: necesita ${required} min, pero el profesional tiene como máximo ${teacherFree} min libres en los días permitidos. Revisa su disponibilidad y las sesiones fijas.`,
          'error','teachers'
        ),
        code:'SUPPORT_TEACHER_CAPACITY'
      });
    }
    const pupilFree=freeMinutes(payload,'pupil_token',token,need.allowed_days);
    if(pupilFree!==null&&required>pupilFree){
      issues.push({
        ...issue(
          `${prefix}: un participante necesita ${required} min, pero dispone de como máximo ${pupilFree} min fuera de sus bloqueos fijos. Revisa las restricciones y sesiones existentes.`,
          'error',null
        ),
        code:'SUPPORT_PUPIL_CAPACITY'
      });
    }
  };
  for(const [index,need] of (payload.supports||[]).entries()){
    examine(need,'individual',index,need.weekly_minutes,need.pupil_token);
  }
  for(const [index,group] of (payload.group_supports||[]).entries()){
    // A shared session uses the professional only once, however many pupils attend.
    // Pupil checks remain individual and never reveal their request-scoped tokens.
    const largest=Math.max(0,...(group.participants||[]).map(row=>row.weekly_minutes));
    if(largest>0){
      const teacherFree=freeMinutes(payload,'teacher_id',group.teacher_id,group.allowed_days);
      if(teacherFree!==null&&largest>teacherFree){
        issues.push({
          ...issue(
            `Apoyo ${group.service==='AL'?'AL':'PT'} grupal n.º ${index+1}: requiere al menos ${largest} min de profesional, pero solo tiene ${teacherFree} min libres en los días permitidos.`,
            'error','teachers'
          ),
          code:'SUPPORT_TEACHER_CAPACITY'
        });
      }
    }
    for(const person of group.participants||[]){
      const free=freeMinutes(payload,'pupil_token',person.pupil_token,group.allowed_days);
      if(free!==null&&person.weekly_minutes>free){
        issues.push({
          ...issue(
            `Apoyo ${group.service==='AL'?'AL':'PT'} grupal n.º ${index+1}: un participante necesita ${person.weekly_minutes} min, pero dispone de como máximo ${free} min fuera de sus bloqueos fijos. Revisa restricciones y sesiones.`,
            'error',null
          ),
          code:'SUPPORT_PUPIL_CAPACITY'
        });
      }
    }
  }
  return issues.slice(0,20);
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
  const professionals=new Map(people.map(person=>[person.id,person]));
  const activeGroups=(state.groups||[]).filter(group=>
    group.activo!==false&&(group.tipo==='PT'||group.tipo==='AL')
  );
  const students=new Map((state.students||[])
    .filter(student=>student.activo!==false).map(student=>[student.id,student]));
  // Optional service requirements must not block a center with no active demand.
  const groupsWithNeeds=service=>activeGroups.filter(group=>
    group.tipo===service&&(group.studentIds||[]).some(id=>{
      const student=students.get(id);
      return student && Number(
        service==='PT'?student.horasPTObjetivoMin:student.horasALObjetivoMin
      )>0;
    })
  );
  const activeNeeds=['PT','AL'].flatMap(groupsWithNeeds);
  for(const service of ['PT','AL']){
    const serviceGroups=groupsWithNeeds(service);
    if(!serviceGroups.length)continue;
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
    for(const group of serviceGroups){
      const professional=professionals.get(group.professionalId);
      const fixed=group.roomId||professional?.supportRoomId
        ||(!generation.autoAssignSupportRooms?generation.supportRoomId:'');
      if(!fixed)continue;
      const room=roomById.get(fixed);
      if(!room){
        issues.push(issue(
          `Apoyos ${service}: la sala obligatoria «${fixed}» no tiene ficha de equipamiento y aforo; debes inventariarla.`,
          'error','rooms'
        ));
      }else if(!required.every(feature=>(room.features||[]).includes(feature))){
        issues.push(issue(
          `Apoyos ${service}: la sala «${fixed}» carece de alguna característica obligatoria. Revisa su ficha o la asignación del grupo.`,
          'error','rooms'
        ));
      }
    }
  }
  const needsRoomChoice=activeNeeds.some(group=>
    !group.roomId&&!professionals.get(group.professionalId)?.supportRoomId
  );
  if(generation.autoAssignSupportRooms&&activeNeeds.length&&!generation.roomResources.length){
    issues.push(issue(
      'La asignación automática de salas está activa pero no hay salas con aforo configurado.',
      'warning','rooms'
    ));
  }
  if(generation.autoAssignSupportRooms&&needsRoomChoice&&generation.roomResources.length>8){
    issues.push(issue(
      'El motor utiliza como máximo ocho salas candidatas por apoyo, filtradas por equipamiento obligatorio; revisa si hay otras salas adecuadas que deban priorizarse.',
      'warning','rooms'
    ));
  }
  if((generation.travelMinutes>0||generation.travelRules.length>0)
    && !generation.supportRoomId && needsRoomChoice
    && !(generation.autoAssignSupportRooms&&generation.roomResources.length)){
    issues.push(issue(
      'Hay desplazamientos configurados, pero apoyos PT/AL sin ubicación conocida. Indica una sala del centro, grupo o profesional para comprobar los traslados.',
      'warning','supportLocation'
    ));
  }
  return issues.slice(0,40);
}

export function correctionDestination(key) {
  return route(key);
}
