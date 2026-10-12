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
