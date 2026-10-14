// Conservative joint daily absence request and read-only reconciliation.
// Both CLASS and PT/AL are needs in the integration solver. Older remote
// backends can ignore PT/AL: any omitted support stays UNKNOWN, not covered.
import {dateNumber,absencesOnDate,normalizeStaffAbsence} from './staff-absences.js';
import {timeToMinutes} from './utils.js';
import {auditJointSupportSessions} from './joint-support-session-audit.js';
import {buildJointLocalAuditContext} from './joint-absence-local-context.js';

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
      supportActivities:supportActivities.map(row=>({
        id:row.id,slotId:row.slot_id,groupId:row.group_id||'',
        kind:row.activity_type
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
  const allSupportActivities=new Set(details.flatMap(row=>
    row.supportActivities.map(x=>x.id)));
  if(source.length&&!allClassActivities.size&&!allSupportActivities.size)
    errors.push('No hay clases ni apoyos PT/AL identificados para sustituir en este día.');
  const missingSlots=details.filter(x=>x.slotCount===0).length;
  if(missingSlots)errors.push(missingSlots+' ausencia(s) no tienen franjas reconocibles en el cálculo.');
  const request={
    absences:[...requestsByTeacher].map(([teacher_id,slotIds])=>({
      teacher_id,slot_ids:[...slotIds].sort()
    })).sort((a,b)=>a.teacher_id.localeCompare(b.teacher_id)),
    locked_substitutions:[]
  };
  const teacherCapabilities=(adapter?.configuration?.teachers||[]).map(row=>({
    id:row.id,
    specialties:[...(row.specialties||[])],
    canCoverGroups:[...(row.can_cover_groups||[])]
  }));
  const supportSessions=Array.isArray(adapter?.report?.supportSessions)
    ? adapter.report.supportSessions : null;
  const roomResources=Array.isArray(state.centerPlanningSettings?.generation?.roomResources)
    ? state.centerPlanningSettings.generation.roomResources : [];
  const localAudit=buildJointLocalAuditContext(state,adapter,date);
  return {date,details,request,teacherCapabilities,supportSessions,
    slots:slots.map(slot=>({id:slot.id,start:slot.start,end:slot.end,label:slot.label})),
    roomResources,localAudit,errors:[...new Set(errors)],
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
    [...record.classActivities.map(x=>({...x,kind:'CLASS'})),
      ...(record.supportActivities||[])]
      .map(activity=>[activity.id,{
        ...activity,absenceId:record.absenceId,teacherId:record.teacherId
      }])
  ));
  const capabilities=new Map((plan.teacherCapabilities||[])
    .map(row=>[row.id,row]));
  const unavailable=new Set(plan.request.absences.flatMap(item=>
    item.slot_ids.map(slot=>JSON.stringify([item.teacher_id,slot]))));
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
      if(kind==='proposed'&&wanted.kind!=='CLASS'){
        const substitute=capabilities.get(item.substitute_teacher_id);
        const eligible=Boolean(substitute&&
          substitute.specialties.includes(wanted.kind)&&
          (!wanted.groupId||substitute.canCoverGroups.includes(wanted.groupId))&&
          !unavailable.has(JSON.stringify([item.substitute_teacher_id,item.slot_id])));
        if(!eligible){
          anomalies.push('La cobertura PT/AL no puede verificarse por especialidad, grupo o disponibilidad.');
          continue;
        }
      }
      const current=observed.get(item.activity_id)||[];
      current.push({status:kind,substituteTeacherId:kind==='proposed'?item.substitute_teacher_id:''});
      observed.set(item.activity_id,current);
    }
  }
  const annotate=item=>{
    const findings=observed.get(item.id)||[];
    const only=findings.length===1?findings[0]:null;
    return {...item,status:only?.status||'unknown',
      substituteTeacherId:only?.substituteTeacherId||''};
  };
  const total=(items,key)=>items.reduce((n,x)=>n+x[key],0);
  const rows=plan.details.map(record=>{
    const classDetails=record.classActivities.map(item=>annotate({...item,kind:'CLASS'}));
    const supportDetails=(record.supportActivities||[]).map(annotate);
    const all=[...classDetails,...supportDetails];
    const count=(items,status)=>items.filter(x=>x.status===status).length;
    const proposed=count(all,'proposed');
    const uncovered=count(all,'uncovered');
    const unknown=count(all,'unknown');
    const supportProposed=count(supportDetails,'proposed');
    const supportUncovered=count(supportDetails,'uncovered');
    const supportUnknown=count(supportDetails,'unknown');
    return {
      absenceId:record.absenceId,professionalId:record.professionalId,
      total:all.length,proposed,uncovered,unknown,classDetails,supportDetails,
      classProposed:count(classDetails,'proposed'),
      classUncovered:count(classDetails,'uncovered'),
      classUnknown:count(classDetails,'unknown'),
      supportProposed,supportUncovered,supportUnknown,
      supportPending:supportUncovered+supportUnknown,
      status:unknown?'unknown':!all.length?'not-assessed':
        uncovered?proposed?'partial':'uncovered':'proposed'
    };
  });
  const proposed=total(rows,'proposed');
  const uncovered=total(rows,'uncovered');
  const unknown=total(rows,'unknown');
  const supportProposed=total(rows,'supportProposed');
  const supportUncovered=total(rows,'supportUncovered');
  const supportUnknown=total(rows,'supportUnknown');
  const classProposed=total(rows,'classProposed');
  const classUncovered=total(rows,'classUncovered');
  const classUnknown=total(rows,'classUnknown');
  const sessionAudit=auditJointSupportSessions(plan,rows);
  const unverifiedSessions=sessionAudit.available&&sessionAudit.entries.some(row=>
    row.status!=='continuous'||row.reviewStatus!=='structural');
  return {
    rows,proposed,uncovered,unknown,anomalies,sessionAudit,
    supportProposed,supportUncovered,supportUnknown,
    classProposed,classUncovered,classUnknown,
    status:anomalies.length||unknown||unverifiedSessions?'unknown':
      uncovered?'partial':'proposed',
    message:'Cobertura propuesta, nunca aplicada ni confirmada.',
    hasSupportNeeds:plan.supportCount>0,
    hasPendingSupports:supportUncovered+supportUnknown>0||unverifiedSessions
  };
}
