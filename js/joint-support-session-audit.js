// Session-level, non-persistent audit of PT/AL substitute proposals.
// Never conflate a solver's atomic slot assignments with a complete support
// session or with verified attendance by an identifiable pupil.

const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const isSlot=item=>item&&typeof item.slotId==='string'&&item.slotId&&
  typeof item.activityId==='string'&&item.activityId;
const issue=(kind,message,hard=false)=>({kind,message,hard});
function withinRoomWindows(room,session){
  const windows=(room.windows||[]).filter(row=>row.weekday===session.weekday)
    .sort((a,b)=>a.startTime.localeCompare(b.startTime));
  let until=session.start;
  for(const window of windows){
    if(window.endTime<=until)continue;
    if(window.startTime>until)break;
    until=window.endTime;
    if(until>=session.end)return true;
  }
  return false;
}

function assessOne(session,allSessions,coverage,roomSpecs,bookings){
  const issues=[];
  const slots=Array.isArray(session.slots)?session.slots:[];
  const expected=slots.map(slot=>coverage.get(slot.activityId));
  let status='unknown';
  let substituteId='';
  if(!slots.length||slots.some(slot=>!isSlot(slot))){
    issues.push(issue('slotMapping','No se puede reconstruir toda la sesión original.'));
  }else if(slots[0].start!==session.start||
    slots[slots.length-1].end!==session.end||
    slots.some((slot,i)=>i>0&&slots[i-1].end!==slot.start)){
    issues.push(issue('slotContinuity','Las franjas no forman la sesión original sin huecos.',true));
  }else if(expected.some(row=>!row)){
    issues.push(issue('missingSlot','La respuesta no permite verificar todas las franjas de la sesión.'));
  }else if(expected.some(row=>row.status==='unknown')){
    issues.push(issue('unknownSlot','Una o más franjas no tienen respuesta verificable.'));
  }else if(expected.some(row=>row.status==='uncovered')){
    status='uncovered';
    issues.push(issue('uncovered','Parte de la sesión permanece sin sustituto.',true));
  }else{
    const substitutes=[...new Set(expected.map(row=>row.substituteTeacherId||''))];
    if(substitutes.length===1&&substitutes[0]){
      status='continuous';
      substituteId=substitutes[0];
    }else{
      status='fragmented';
      issues.push(issue('continuity','La sesión quedaría dividida entre distintos docentes o sin responsable único.',true));
    }
  }

  const participants=session.participantCount;
  if(!Number.isInteger(participants)||participants<1){
    issues.push(issue('participantsUnknown','No hay número verificable de participantes.'));
  }
  const roomId=session.roomId||'';
  const room=roomSpecs.get(roomId);
  if(!roomId)issues.push(issue('roomUnknown','No consta una sala asignada a la sesión.'));
  else if(!room)issues.push(issue('roomUnconfigured','La sala no tiene aforo ni equipamiento verificables.'));
  else{
    if(!Number.isInteger(room.capacity)||room.capacity<1)
      issues.push(issue('capacityUnknown','El aforo de la sala no está definido.'));
    else if(Number.isInteger(participants)&&participants>room.capacity)
      issues.push(issue('capacity','El número de participantes supera el aforo declarado.',true));
    if(room.windows?.length&&!withinRoomWindows(room,session))
      issues.push(issue('roomWindow','La sesión no cabe completamente en las horas permitidas de la sala.',true));
    const required=session.requiredFeatures||[];
    if(required.some(feature=>!(room.features||[]).includes(feature)))
      issues.push(issue('roomFeatures','La sala no tiene todas las características requeridas para el apoyo.',true));
    const collisions=allSessions.filter(peer=>
      peer.id!==session.id&&peer.weekday===session.weekday&&
      peer.roomId===roomId&&overlap(
        {start:session.start,end:session.end},
        {start:peer.start,end:peer.end}
      ));
    if(collisions.length)
      issues.push(issue('roomOverlap','Otra sesión PT/AL registrada ocupa la misma sala y horario.',true));
  }

  if(substituteId&&slots.some(slot=>(bookings.get(JSON.stringify(
    [substituteId,slot.slotId]))||0)>1))
    issues.push(issue('substituteOverlap','El sustituto figura en más de una actividad durante la misma franja.',true));

  // A slot-level answer cannot establish individual extraction legality,
  // travel feasibility, or actual attendance. Never claim applied coverage.
  const hard=issues.some(row=>row.hard);
  const unchecked=issues.some(row=>!row.hard);
  const reviewStatus=hard?'conflict':status==='continuous'&&!unchecked?
    'structural':'needsReview';
  return {
    sessionId:session.id,kind:session.kind,start:session.start,end:session.end,
    roomId,participantCount:Number.isInteger(participants)?participants:null,
    mixedClassCount:session.mixedClassCount??null,
    slotCount:slots.length,status,reviewStatus,substituteId,issues
  };
}

export function auditJointSupportSessions(plan,rows){
  const definitions=plan?.supportSessions;
  if(!Array.isArray(definitions))return {
    available:false,entries:[],summary:{total:0,continuous:0,fragmented:0,
      uncovered:0,unknown:0,conflicts:0,structural:0,needsReview:0}
  };
  const coverage=new Map((rows||[]).flatMap(row=>row.supportDetails||[])
    .map(item=>[item.id,item]));
  const roomSpecs=new Map((plan.roomResources||[]).map(room=>[room.roomId,room]));
  const relevant=definitions.filter(session=>session.slots.some(slot=>
    coverage.has(slot.activityId)));
  const bookings=new Map();
  for(const row of rows||[]){
    for(const item of [...(row.classDetails||[]),...(row.supportDetails||[])]){
      if(item.status!=='proposed'||!item.substituteTeacherId)continue;
      const key=JSON.stringify([item.substituteTeacherId,item.slotId]);
      bookings.set(key,(bookings.get(key)||0)+1);
    }
  }
  const entries=relevant.map(session=>assessOne(
    session,definitions,coverage,roomSpecs,bookings));
  const count=(key,value)=>entries.filter(row=>row[key]===value).length;
  return {
    available:true,entries,
    summary:{
      total:entries.length,
      continuous:count('status','continuous'),
      fragmented:count('status','fragmented'),
      uncovered:count('status','uncovered'),
      unknown:count('status','unknown'),
      conflicts:count('reviewStatus','conflict'),
      structural:count('reviewStatus','structural'),
      needsReview:count('reviewStatus','needsReview')
    },
    note:'Auditoría estructural local y provisional; no certifica la atención individual, la extracción ni los desplazamientos.'
  };
}
