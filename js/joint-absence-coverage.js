// Conservative joint daily absence request and read-only reconciliation.
// The current GestorEscuela daily optimizer replaces CLASS activities only;
// PT/AL is explicitly outside the solver's substitution coverage.
import {dateNumber,absencesOnDate,normalizeStaffAbsence} from './staff-absences.js';
import {timeToMinutes} from './utils.js';

const types=new Set(['CLASS','PT','AL']);
const overlaps=(slot,absence)=>{
  const start=timeToMinutes(slot.start),end=timeToMinutes(slot.end);
  const from=absence.startTime?timeToMinutes(absence.startTime):0;
  const to=absence.endTime?timeToMinutes(absence.endTime):1440;
  return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&start<to&&from<end;
};
const validWeekday=date=>(new Date(dateNumber(date)).getUTCDay()+6)%7;

export function buildJointAbsenceRequest(state,adapter,date){
  if(dateNumber(date)===null)throw Error('Elige una fecha de ausencia válida.');
  const day=validWeekday(date);
  const source=absencesOnDate(state.staffAbsences||[],date);
  const mappings=adapter?.report?.mappings?.teachers||{};
  const slots=adapter?.report?.slots||[];
  const activities=(adapter?.configuration?.activities||[])
    .filter(row=>row.weekday===day&&types.has(row.activity_type));
  const details=[],errors=[];
  const requestsByTeacher=new Map();
  for(const raw of source){
    const absence=normalizeStaffAbsence(raw);
    const teacherId=mappings[absence.professionalId];
    if(!teacherId)errors.push('No se puede identificar en el motor a uno de los docentes ausentes.');
    const selected=slots.filter(slot=>overlaps(slot,absence));
    if(teacherId&&selected.length){
      const prior=requestsByTeacher.get(teacherId)||new Set();
      selected.forEach(slot=>prior.add(slot.id));
      requestsByTeacher.set(teacherId,prior);
    }
    const affected=teacherId?activities.filter(row=>row.teacher_id===teacherId&&
      selected.some(slot=>slot.id===row.slot_id)):[];
    const classActivities=affected.filter(row=>row.activity_type==='CLASS'&&row.group_id);
    const supportActivities=affected.filter(row=>row.activity_type==='PT'||row.activity_type==='AL');
    details.push({
      absenceId:absence.id,professionalId:absence.professionalId,
      teacherId:teacherId||'',manualStatus:absence.status,
      fromTime:absence.startTime||'',toTime:absence.endTime||'',
      slotCount:selected.length,
      classActivities:classActivities.map(row=>({
        id:row.id,slotId:row.slot_id,groupId:row.group_id
      })),
      supportCount:supportActivities.length,
      classCount:classActivities.length,
      recordedCount:affected.length
    });
  }
  const allClassActivities=new Set(details.flatMap(row=>row.classActivities.map(x=>x.id)));
  if(!source.length)errors.push('No hay ausencias registradas para ese día.');
  if(day>=5)errors.push('El cálculo de sustituciones del motor solo cubre días lectivos de lunes a viernes.');
  if(source.length&&!requestsByTeacher.size)
    errors.push('No hay franjas disponibles que puedan enviarse al motor.');
  if(source.length&&!allClassActivities.size)
    errors.push('No hay clases ordinarias identificadas para sustitución; los apoyos PT/AL no se calculan como cobertura en este solver.');
  const missingSlots=details.filter(x=>x.slotCount===0).length;
  if(missingSlots)errors.push(missingSlots+' ausencia(s) no tienen franjas reconocibles en el cálculo.');
  const request={
    absences:[...requestsByTeacher].map(([teacher_id,slotIds])=>({
      teacher_id,slot_ids:[...slotIds].sort()
    })).sort((a,b)=>a.teacher_id.localeCompare(b.teacher_id)),
    locked_substitutions:[]
  };
  return {date,details,request,errors:[...new Set(errors)],
    count:source.length,
    classCount:allClassActivities.size,
    supportCount:details.reduce((n,row)=>n+row.supportCount,0),
    ready:errors.length===0};
}

export function assessJointAbsenceResult(plan,result){
  if(!plan||!result)return null;
  const solution=result.payload?.solution||result.solution;
  if(!solution||!Array.isArray(solution.substitutions)||!Array.isArray(solution.uncovered))
    return {status:'unknown',message:'El motor no devolvió una solución verificable.',rows:[]};
  const expected=new Map(plan.details.flatMap(record=>
    record.classActivities.map(activity=>[activity.id,{
      ...activity,absenceId:record.absenceId,teacherId:record.teacherId
    }])
  ));
  const observed=new Map(),anomalies=[];
  for(const [kind,records] of [
    ['proposed',solution.substitutions],['uncovered',solution.uncovered]
  ]){
    for(const item of records){
      const wanted=expected.get(item.activity_id);
      if(!wanted||wanted.slotId!==item.slot_id||wanted.teacherId!==item.absent_teacher_id||
        (kind==='proposed'&&!item.substitute_teacher_id)){
        anomalies.push('Resultado con actividad o docente no reconocidos.');
        continue;
      }
      const current=observed.get(item.activity_id)||[];
      current.push({status:kind,substituteTeacherId:kind==='proposed'?item.substitute_teacher_id:''});
      observed.set(item.activity_id,current);
    }
  }
  const rows=plan.details.map(record=>{
    const classDetails=record.classActivities.map(item=>{
      const findings=observed.get(item.id)||[];
      const only=findings.length===1?findings[0]:null;
      return {...item,status:only?.status||'unknown',
        substituteTeacherId:only?.substituteTeacherId||''};
    });
    const classStatuses=classDetails.map(x=>x.status);
    const proposed=classStatuses.filter(x=>x==='proposed').length;
    const uncovered=classStatuses.filter(x=>x==='uncovered').length;
    const unknown=classStatuses.filter(x=>x==='unknown').length;
    return {
      absenceId:record.absenceId,professionalId:record.professionalId,
      total:classStatuses.length,proposed,uncovered,unknown,classDetails,
      supportPending:record.supportCount,
      status:unknown?'unknown':!classStatuses.length?'not-assessed':
        uncovered?proposed?'partial':'uncovered':'proposed'
    };
  });
  const proposed=rows.reduce((n,x)=>n+x.proposed,0);
  const uncovered=rows.reduce((n,x)=>n+x.uncovered,0);
  const unknown=rows.reduce((n,x)=>n+x.unknown,0);
  return {
    rows,proposed,uncovered,unknown,anomalies,
    status:anomalies.length||unknown?'unknown':uncovered?'partial':'proposed',
    message:'Cobertura propuesta, nunca aplicada ni confirmada.',
    hasPendingSupports:plan.supportCount>0
  };
}
