// Local, date-scoped, non-medical staff absence registry.
// A manually confirmed coverage is not a solver-certified substitution.
import {DAYS} from './constants.js';
import {uid} from './utils.js';

const DAY_MS=86400000;
const DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK=/^([01]\d|2[0-3]):(00|15|30|45)$/;
const WEEKDAYS=DAYS.map(day=>day.id);
const MAX_DAYS=366;

export function dateNumber(value){
  const match=typeof value==='string'&&DATE.exec(value);
  if(!match)return null;
  const [,year,month,day]=match.map(Number);
  if(year<2000||year>2100||month<1||month>12||day<1||day>31)return null;
  const number=Date.UTC(year,month-1,day);
  const check=new Date(number);
  return check.getUTCFullYear()===year&&check.getUTCMonth()===month-1&&
    check.getUTCDate()===day?number:null;
}
export function isoDate(number){
  return new Date(number).toISOString().slice(0,10);
}
export function monthKey(value){
  if(!/^\d{4}-\d{2}$/.test(value||''))return null;
  return dateNumber(value+'-01')===null?null:value;
}
export function monthShift(month,delta){
  if(!monthKey(month)||!Number.isInteger(delta)||Math.abs(delta)>12)throw Error('Mes no válido.');
  const [year,part]=month.split('-').map(Number);
  const d=new Date(Date.UTC(year,part-1+delta,1));
  return d.toISOString().slice(0,7);
}
const clockMinutes=value=>{
  if(!CLOCK.test(value||''))return null;
  const [hour,minute]=value.split(':').map(Number);
  return hour*60+minute;
};

export function normalizeStaffAbsence(source,{professionals=null}={}){
  if(!source||typeof source!=='object'||Array.isArray(source))throw Error('Ausencia no válida.');
  const id=typeof source.id==='string'?source.id.trim():'';
  const professionalId=typeof source.professionalId==='string'?source.professionalId.trim():'';
  const fromDate=source.fromDate,toDate=source.toDate;
  const begin=dateNumber(fromDate),end=dateNumber(toDate);
  if(!id||id.length>110||!professionalId||professionalId.length>110)throw Error('Identifica la ausencia y el docente.');
  if(professionals&&!professionals.some(item=>item.id===professionalId))
    throw Error('El docente seleccionado no está registrado.');
  if(begin===null||end===null||end<begin||(end-begin)/DAY_MS>=MAX_DAYS)
    throw Error('Selecciona fechas válidas, en orden y dentro de un período de 366 días.');
  const start=source.startTime||'',finish=source.endTime||'';
  if(Boolean(start)!==Boolean(finish))throw Error('Indica las dos horas o deja ambas vacías para jornada completa.');
  if(start&&(clockMinutes(start)===null||clockMinutes(finish)===null||
    clockMinutes(finish)<=clockMinutes(start)))
    throw Error('La franja parcial debe ser válida y seguir la rejilla de 15 minutos.');
  const status=source.status==='resolved'?'resolved':'pending';
  const resolvedAt=status==='resolved'&&typeof source.resolvedAt==='string'&&
    !Number.isNaN(Date.parse(source.resolvedAt))?source.resolvedAt:'';
  if(status==='resolved'&&!resolvedAt)throw Error('Falta la confirmación fechada de la cobertura.');
  return {id,professionalId,fromDate,toDate,startTime:start,endTime:finish,
    status,resolvedAt};
}

function datesOverlap(a,b){
  return a.fromDate<=b.toDate&&b.fromDate<=a.toDate;
}
function timeOverlap(a,b){
  if(!a.startTime||!b.startTime)return true;
  return a.startTime<b.endTime&&b.startTime<a.endTime;
}
export function validateAbsenceCollection(records,{professionals=null}={}){
  if(!Array.isArray(records)||records.length>2000)throw Error('La colección de ausencias no es válida.');
  const seen=new Set();
  const normalized=records.map(row=>{
    const absence=normalizeStaffAbsence(row,{professionals});
    if(seen.has(absence.id))throw Error('Hay ausencias con identificador duplicado.');
    seen.add(absence.id);
    return absence;
  });
  for(let i=0;i<normalized.length;i++){
    for(let j=0;j<i;j++){
      if(normalized[i].professionalId===normalized[j].professionalId&&
        datesOverlap(normalized[i],normalized[j])&&
        timeOverlap(normalized[i],normalized[j]))
        throw Error('La misma persona tiene ausencias solapadas. Edita el registro existente.');
    }
  }
  return normalized;
}

export function createStaffAbsences(input,existing,professionals,{generateId=()=>uid('absence')}={}){
  if(!Array.isArray(input?.professionalIds)||!input.professionalIds.length)
    throw Error('Selecciona uno o varios docentes.');
  const ids=[...new Set(input.professionalIds)];
  if(ids.length!==input.professionalIds.length)throw Error('Hay docentes repetidos.');
  const next=ids.map(professionalId=>normalizeStaffAbsence({
    id:generateId(),professionalId,fromDate:input.fromDate,toDate:input.toDate,
    startTime:input.startTime||'',endTime:input.endTime||'',
    status:'pending',resolvedAt:''
  },{professionals}));
  validateAbsenceCollection([...(existing||[]),...next]);
  return next;
}

export function changeAbsenceCoverage(absence,status,now=new Date()){
  if(!['pending','resolved'].includes(status))throw Error('Estado de cobertura no reconocido.');
  const current=normalizeStaffAbsence(absence);
  if(!(now instanceof Date)||Number.isNaN(now.valueOf()))throw Error('Fecha de confirmación no válida.');
  return {...current,status,resolvedAt:status==='resolved'?now.toISOString():''};
}

export function absencesOnDate(records,date){
  if(dateNumber(date)===null)return [];
  return (records||[]).filter(row=>row.fromDate<=date&&date<=row.toDate);
}

export function affectedSessionsForAbsence(state,absence,date){
  if(dateNumber(date)===null||date<absence.fromDate||date>absence.toDate)return [];
  const weekday=WEEKDAYS[(new Date(dateNumber(date)).getUTCDay()+6)%7];
  if(!weekday)return [];
  const groups=new Map((state.groups||[]).map(row=>[row.id,row]));
  const from=absence.startTime||'00:00',to=absence.endTime||'23:59';
  const within=row=>row.dia===weekday&&row.inicio<to&&from<row.fin;
  const lessons=(state.classSchedules||[])
    .filter(row=>row.professionalId===absence.professionalId&&within(row))
    .map(row=>({kind:'lesson',label:String(row.grupoClase||'Clase').slice(0,70),
      start:row.inicio,end:row.fin}));
  const supports=(state.sessions||[])
    .filter(row=>(row.professionalId||groups.get(row.groupId)?.professionalId)===
      absence.professionalId&&within(row))
    .map(row=>({kind:'support',label:'PT/AL',start:row.inicio,end:row.fin}));
  return [...lessons,...supports];
}

export function buildAbsenceCalendar(month,records,state,{filter='all',selectedDay=''}={}){
  if(!monthKey(month))throw Error('Mes no válido.');
  const [y,m]=month.split('-').map(Number);
  const first=Date.UTC(y,m-1,1),last=Date.UTC(y,m,0);
  const offset=(new Date(first).getUTCDay()+6)%7;
  const start=first-offset*DAY_MS;
  const end=last+(6-(new Date(last).getUTCDay()+6)%7)*DAY_MS;
  const eligible=(records||[]).filter(row=>
    filter==='all'||row.status===filter);
  const professionals=new Map((state.professionals||[]).map(p=>[p.id,p]));
  const days=[];
  for(let day=start;day<=end;day+=DAY_MS){
    const date=isoDate(day);
    const items=absencesOnDate(eligible,date).map(row=>({
      ...row,professionalName:professionals.get(row.professionalId)?.nombre||
        'Docente no registrado',
      affected:affectedSessionsForAbsence(state,row,date).length
    })).sort((a,b)=>a.professionalName.localeCompare(b.professionalName,'es'));
    days.push({date,inMonth:day>=first&&day<=last,items,
      pending:items.filter(row=>row.status==='pending').length,
      resolved:items.filter(row=>row.status==='resolved').length});
  }
  const allInMonth=(records||[]).filter(row=>row.fromDate<=isoDate(last)&&
    row.toDate>=isoDate(first));
  const inMonth=eligible.filter(row=>row.fromDate<=isoDate(last)&&
    row.toDate>=isoDate(first));
  return {
    month,monthLabel:new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',
      timeZone:'UTC'}).format(new Date(first)),
    days,
    selectedDay:dateNumber(selectedDay)!==null&&selectedDay.startsWith(month)
      ?selectedDay:'',
    entries:inMonth.slice().sort((a,b)=>a.fromDate.localeCompare(b.fromDate)||
      a.professionalId.localeCompare(b.professionalId)).map(row=>({
      ...row,professionalName:professionals.get(row.professionalId)?.nombre||
        'Docente no registrado'
    })),
    summary:{
      pending:allInMonth.filter(row=>row.status==='pending').length,
      resolved:allInMonth.filter(row=>row.status==='resolved').length,
      professionals:new Set(allInMonth.map(row=>row.professionalId)).size
    }
  };
}
