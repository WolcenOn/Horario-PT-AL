// Calendar-first absence selection, independent of the remote solver.
import {DAYS} from './constants.js';
import {dateNumber,normalizeStaffAbsence,validateAbsenceCollection} from './staff-absences.js';
import {uid} from './utils.js';

const weekdayFor=date=>DAYS[(new Date(dateNumber(date)).getUTCDay()+6)%7]?.id||'';
export function scheduledAbsenceBlocks(state,professionalId,date){
  if(dateNumber(date)===null)return [];
  const weekday=weekdayFor(date);
  if(!weekday)return [];
  const professionals=state.professionals||[];
  const person=professionals.find(item=>item.id===professionalId);
  const matchingName=(name)=>name&&person?.nombre&&
    name.trim().toLocaleLowerCase('es')===person.nombre.trim().toLocaleLowerCase('es')&&
    professionals.filter(item=>item.nombre?.trim().toLocaleLowerCase('es')===
      person.nombre.trim().toLocaleLowerCase('es')).length===1;
  const groups=new Map((state.groups||[]).map(group=>[group.id,group]));
  const ordinary=(state.classSchedules||[]).flatMap((row,index)=>
    row.dia===weekday&&
    (row.professionalId===professionalId||
      (!row.professionalId&&matchingName(row.docente)))?
    [{key:'class:'+String(row.id??index),
      start:row.inicio,end:row.fin,
      label:String(row.grupoClase||'Clase')+' · '+String(row.materia||'Materia')}]:[]);
  const support=(state.sessions||[]).flatMap((row,index)=>{
    const group=groups.get(row.groupId);
    if(row.dia!==weekday||!group||
      (row.professionalId||group.professionalId)!==professionalId)return [];
    return [{key:'support:'+String(row.id??index),start:row.inicio,end:row.fin,
      label:'Apoyo '+(group.tipo==='AL'?'AL':'PT')}];
  });
  return [...ordinary,...support].filter(row=>
    typeof row.start==='string'&&typeof row.end==='string'&&row.start<row.end)
    .sort((a,b)=>a.start.localeCompare(b.start)||a.end.localeCompare(b.end)||
      a.key.localeCompare(b.key));
}
function combine(intervals){
  const sorted=intervals.slice().sort((a,b)=>a.start.localeCompare(b.start));
  const output=[];
  for(const interval of sorted){
    const current=output[output.length-1];
    if(current&&interval.start<=current.end)
      current.end=current.end>interval.end?current.end:interval.end;
    else output.push({start:interval.start,end:interval.end});
  }
  return output;
}
export function createSelectedStaffAbsences(input,state,{
  generateId=()=>uid('absence')
}={}){
  const {professionalIds,fromDate,toDate,mode='full',startTime='',endTime='',
    selectedSlots={}}=input||{};
  if(dateNumber(fromDate)===null||dateNumber(toDate)===null||toDate<fromDate)
    throw Error('Selecciona una fecha o un período válido.');
  if(!Array.isArray(professionalIds)||!professionalIds.length)
    throw Error('Selecciona al menos un docente.');
  if(new Set(professionalIds).size!==professionalIds.length)
    throw Error('Hay docentes repetidos.');
  if(!['full','schedule','manual'].includes(mode))throw Error('Tipo de ausencia no válido.');
  if(mode==='schedule'&&fromDate!==toDate)
    throw Error('Las franjas del horario previsto se seleccionan para un solo día. Para varios días, elige jornada completa u horas manuales.');
  const known=new Set((state.professionals||[]).map(item=>item.id));
  const entries=[];
  for(const professionalId of professionalIds){
    if(!known.has(professionalId))throw Error('Docente no registrado.');
    let windows=[{startTime:'',endTime:''}];
    if(mode==='manual')windows=[{startTime,endTime}];
    if(mode==='schedule'){
      const available=scheduledAbsenceBlocks(state,professionalId,fromDate);
      const picked=selectedSlots[professionalId];
      if(!Array.isArray(picked)||!picked.length)throw Error(
        'Selecciona las sesiones de '+String((state.professionals||[])
          .find(p=>p.id===professionalId)?.nombre||professionalId)+' o elige jornada completa.'
      );
      if(new Set(picked).size!==picked.length)throw Error('Hay sesiones repetidas.');
      const lookup=new Map(available.map(row=>[row.key,row]));
      const intervals=picked.map(key=>{
        const row=lookup.get(key);
        if(!row)throw Error('El horario previsto ha cambiado. Vuelve a seleccionar las franjas.');
        return row;
      });
      windows=combine(intervals).map(row=>({
        startTime:row.start,endTime:row.end
      }));
    }
    for(const window of windows){
      entries.push(normalizeStaffAbsence({
        id:generateId(),professionalId,fromDate,toDate,...window,
        status:'pending',resolvedAt:''
      },{professionals:state.professionals}));
    }
  }
  validateAbsenceCollection([...(state.staffAbsences||[]),...entries],{
    professionals:state.professionals
  });
  return entries;
}
