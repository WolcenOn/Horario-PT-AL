// Explicit timetable resources. All strings are stable school-local identifiers.
// Missing locations must not become guessed travel routes.
export function supportRoomId(group, professional, defaultRoom='') {
  return String(
    group?.roomId || professional?.supportRoomId || defaultRoom || ''
  ).trim().slice(0,64);
}

export function roomFields(roomId) {
  const room=String(roomId || '').trim();
  return room ? {room_id:room,location_id:`room:${room}`} : {};
}

export function normalizeTravelRules(value) {
  if (!Array.isArray(value)) return [];
  const result=[];
  const seen=new Set();
  for(const rule of value.slice(0,100)) {
    const fromLocationId=String(rule?.fromLocationId||'').trim();
    const toLocationId=String(rule?.toLocationId||'').trim();
    const minutes=Number(rule?.minutes);
    if(!fromLocationId||!toLocationId||fromLocationId===toLocationId
      ||fromLocationId.length>64||toLocationId.length>64
      ||!Number.isInteger(minutes)||minutes<0||minutes>60||minutes%15)continue;
    const key=JSON.stringify([fromLocationId,toLocationId]);
    if(seen.has(key))continue;
    seen.add(key);
    result.push({fromLocationId,toLocationId,minutes});
  }
  return result;
}

export function parseTravelRules(source) {
  const rows=String(source||'').split(/\r?\n/)
    .map(row=>row.trim()).filter(Boolean);
  if(rows.length>100)throw new Error('Se admiten como máximo 100 trayectos.');
  const seen=new Set();
  return rows.map((row,index)=>{
    const values=row.split('|').map(value=>value.trim());
    const [fromLocationId,toLocationId,minutesText]=values;
    const minutes=Number(minutesText);
    if(values.length!==3||!fromLocationId||!toLocationId
      ||fromLocationId===toLocationId
      ||fromLocationId.length>64||toLocationId.length>64
      ||minutesText===''||!Number.isInteger(minutes)
      ||minutes<0||minutes>60||minutes%15) {
      throw new Error(`Trayecto ${index+1}: indica origen | destino | minutos (0, 15, 30, 45 o 60).`);
    }
    const key=JSON.stringify([fromLocationId,toLocationId]);
    if(seen.has(key))throw new Error(`Trayecto ${index+1}: origen y destino duplicados.`);
    seen.add(key);
    return {fromLocationId,toLocationId,minutes};
  });
}


// Non-sensitive environment/equipment tags; no pupil-specific information.
export const ROOM_FEATURES=[
  {value:'acceso_sin_escalones',label:'Acceso sin escalones'},
  {value:'mesa_regulable',label:'Mesa regulable'},
  {value:'aislamiento_acustico',label:'Aislamiento acústico'},
  {value:'material_logopedico',label:'Material logopédico'},
  {value:'pizarra_digital',label:'Pizarra digital'}
];
const ROOM_FEATURE_KEYS=new Set(ROOM_FEATURES.map(feature=>feature.value));

export function normalizeRoomFeatures(value) {
  if(!Array.isArray(value)) return [];
  return [...new Set(value.filter(feature=>ROOM_FEATURE_KEYS.has(feature)))];
}

function parseFeatureList(value, lineno) {
  if(!value)return [];
  const features=value.split(',').map(feature=>feature.trim()).filter(Boolean);
  if(features.length>5 || features.length!==new Set(features).size
    ||features.some(feature=>!ROOM_FEATURE_KEYS.has(feature))) {
    throw new Error(`Sala línea ${lineno}: utiliza solo las características de sala admitidas, sin duplicados.`);
  }
  return features;
}

const WEEKDAYS=['lunes','martes','miercoles','jueves','viernes'];

function validClock(value) {
  return /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value);
}

function normalizeRoomWindow(window) {
  if (!window || !Number.isInteger(window.weekday)
    || window.weekday<0 || window.weekday>4
    || !validClock(window.startTime) || !validClock(window.endTime)
    || window.startTime>=window.endTime) return null;
  return {
    weekday:window.weekday,
    startTime:window.startTime,
    endTime:window.endTime
  };
}

export function normalizeRoomResources(source) {
  if(!Array.isArray(source))return [];
  const rooms=[];
  const seen=new Set();
  for(const input of source.slice(0,50)) {
    const roomId=String(input?.roomId||'').trim();
    const capacity=Number(input?.capacity);
    if(!roomId || roomId.length>64 || seen.has(roomId)
      ||!Number.isInteger(capacity)||capacity<1||capacity>30) continue;
    seen.add(roomId);
    const windows=(Array.isArray(input.windows)?input.windows:[])
      .slice(0,30).map(normalizeRoomWindow).filter(Boolean);
    const features=normalizeRoomFeatures(input.features);
    rooms.push({roomId,capacity,windows,...(features.length?{features}:{})});
  }
  return rooms;
}

export function parseRoomResources(source) {
  const lines=String(source||'').split(/\r?\n/)
    .map(line=>line.trim()).filter(Boolean);
  if(lines.length>250)throw new Error('Se admiten hasta 250 líneas de salas y horarios.');
  const rooms=new Map();
  for (const [index,line] of lines.entries()) {
    const parts=line.split('|').map(p=>p.trim());
    if(![2,3,5,6].includes(parts.length)){
      throw new Error(`Sala línea ${index+1}: usa sala | aforo [| día | inicio | fin] [| características].`);
    }
    const [roomId,capacityText]=parts;
    const [weekdayText,startTime,endTime]=parts.length>=5?parts.slice(2,5):[];
    const features=parseFeatureList(
      parts.length===3?parts[2]:parts.length===6?parts[5]:'', index+1
    );
    const capacity=Number(capacityText);
    if(!roomId || roomId.length>64 || capacityText==='' ||
        !Number.isInteger(capacity)||capacity<1||capacity>30) {
      throw new Error(`Sala línea ${index+1}: indica un ID y aforo entre 1 y 30.`);
    }
    if(!rooms.has(roomId)){
      if(rooms.size>=50)throw new Error('Se admiten hasta 50 salas.');
      rooms.set(roomId,{roomId,capacity,features,windows:[],unrestricted:false});
    }
    const room=rooms.get(roomId);
    if(room.capacity!==capacity || JSON.stringify(room.features)!==JSON.stringify(features)) {
      throw new Error(`Sala línea ${index+1}: el aforo o equipamiento de ${roomId} es inconsistente.`);
    }
    if(parts.length<=3) {
      if(room.windows.length || room.unrestricted) {
        throw new Error(`Sala línea ${index+1}: configuración de ${roomId} duplicada.`);
      }
      room.unrestricted=true;
      continue;
    }
    if(room.unrestricted){
      throw new Error(`Sala línea ${index+1}: ${roomId} mezcla horario libre y restringido.`);
    }
    const weekday=WEEKDAYS.indexOf(weekdayText.toLowerCase());
    if(weekday<0 || !validClock(startTime)||!validClock(endTime)
      ||startTime>=endTime) {
      throw new Error(`Sala línea ${index+1}: día u horas inválidas. Usa lunes-viernes y bloques de 15 minutos.`);
    }
    if(room.windows.length>=30)throw new Error(`Sala ${roomId}: máximo 30 franjas.`);
    room.windows.push({weekday,startTime,endTime});
  }
  const specs=[...rooms.values()].map(({roomId,capacity,windows,features})=>({
    roomId,capacity,...(features.length?{features}:{}),windows:windows.sort(
      (a,b)=>a.weekday-b.weekday||a.startTime.localeCompare(b.startTime)
    )
  }));
  if(specs.reduce((total,room)=>total+room.windows.length,0)>200) {
    throw new Error('Solo se admiten 200 franjas de sala en conjunto.');
  }
  for(const room of specs){
    for(let i=1;i<room.windows.length;i++){
      const prev=room.windows[i-1],next=room.windows[i];
      if(prev.weekday===next.weekday && prev.endTime>next.startTime) {
        throw new Error(`Sala ${room.roomId}: hay franjas horarias solapadas.`);
      }
    }
  }
  return specs;
}

export function formatRoomResources(source) {
  return normalizeRoomResources(source).flatMap(room=>{
    const features=room.features?.length?` | ${room.features.join(',')}`:'';
    return room.windows.length
      ? room.windows.map(window=>
          `${room.roomId} | ${room.capacity} | ${WEEKDAYS[window.weekday]} | ${window.startTime} | ${window.endTime}${features}`
        )
      : [`${room.roomId} | ${room.capacity}${features}`];
  }).join('\n');
}
