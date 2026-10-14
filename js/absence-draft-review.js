// Local, ephemeral review of a remote DRAFT. This cannot apply substitutions,
// confirm an academic day remotely, or mark a staff absence resolved.
import {assessJointAbsenceResult} from './joint-absence-coverage.js';

const key=(a,b)=>JSON.stringify([a,b]);
const supported=new Set(['SELECTED','VALID_ALTERNATIVE']);
const unique=xs=>[...new Set(xs)];
const weekDay=date=>(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
const minutes=value=>{const p=(value||'').split(':').map(Number);return p.length===2?p[0]*60+p[1]:NaN;};
function eligible(teacher,item,plan,mode){
  if(!teacher)return false;
  if(item.kind!=='CLASS'&&!teacher.specialties.includes(item.kind))return false;
  if(item.groupId&&!teacher.canCoverGroups.includes(item.groupId))return false;
  if(plan.request.absences.some(row=>row.teacher_id===teacher.id&&row.slot_ids.includes(item.slotId)))
    return false;
  if(mode==='alternative'&&plan.localAudit?.teacherAvailability?.[teacher.id]?.[item.slotId]!=='available')
    return false;
  const slot=plan.slots?.find(row=>row.id===item.slotId);
  if(mode==='alternative'&&slot){
    const occupied=(plan.localAudit?.substituteBookings||[]).some(row=>
      row.teacherId===teacher.id&&row.start<slot.end&&slot.start<row.end);
    if(occupied)return false;
  }
  return true;
}

export function prepareDraftReview(plan,result,review={}){
  if(!plan||!result)return null;
  const solution=result.payload?.solution||result.solution;
  if(!solution||!Array.isArray(solution.substitutions)||!Array.isArray(solution.uncovered))
    return null;
  const candidates=Array.isArray(solution.candidate_assessments)
    ?solution.candidate_assessments:[];
  const teachers=new Map((plan.teacherCapabilities||[]).map(row=>[row.id,row]));
  const original=new Map(solution.substitutions.map(item=>[item.activity_id,item]));
  const slots=plan.slots||[];
  const all=plan.details.flatMap(record=>[
    ...record.classActivities.map(item=>({...item,kind:'CLASS'})),
    ...(record.supportActivities||[])
  ].map(item=>({...item,teacherId:record.teacherId,absenceId:record.absenceId})));
  const rows=all.map(item=>{
    const current=original.get(item.id);
    const alternatives=candidates.filter(row=>
      row.activity_id===item.id&&row.slot_id===item.slotId&&
      supported.has(row.status)&&!row.displaced_activity_id&&
      Number.isFinite(Number(row.penalty))&&
      eligible(teachers.get(row.teacher_id),item,plan,'alternative'))
      .map(row=>({id:row.teacher_id,penalty:Number(row.penalty),
        status:row.status}));
    const offered=new Map(alternatives.map(row=>[row.id,row]));
    // Preserve an original solver assignment even if its older response did
    // not include candidate_assessments. It is not a NEW manual alternative.
    if(current?.substitute_teacher_id&&
      eligible(teachers.get(current.substitute_teacher_id),item,plan,'original')&&
      !offered.has(current.substitute_teacher_id)){
      offered.set(current.substitute_teacher_id,{
        id:current.substitute_teacher_id,penalty:Number(current.penalty)||0,
        status:'ORIGINAL'
      });
    }
    const options=[...offered.values()].sort((a,b)=>a.penalty-b.penalty||
      a.id.localeCompare(b.id));
    const requested=Object.hasOwn(review.choices||{},item.id)?
      review.choices[item.id]:current?.substitute_teacher_id||'';
    const selected=options.some(row=>row.id===requested)?requested:'';
    const slot=slots.find(row=>row.id===item.slotId);
    return {
      activityId:item.id,slotId:item.slotId,groupId:item.groupId||'',
      kind:item.kind,teacherId:item.teacherId,absenceId:item.absenceId,
      start:slot?.start||'',end:slot?.end||'',
      options,selected,confirmed:Boolean((review.confirmed||[]).includes(item.id)&&selected)
    };
  });
  const occupancy=new Map();
  for(const row of rows){
    if(!row.selected)continue;
    const k=key(row.selected,row.slotId);
    occupancy.set(k,(occupancy.get(k)||0)+1);
  }
  const synthetic={
    payload:{solution:{
      substitutions:rows.filter(row=>row.selected).map(row=>({
        activity_id:row.activityId,slot_id:row.slotId,
        absent_teacher_id:row.teacherId,substitute_teacher_id:row.selected
      })),
      uncovered:rows.filter(row=>!row.selected).map(row=>({
        activity_id:row.activityId,slot_id:row.slotId,
        absent_teacher_id:row.teacherId,reason:'No se ha confirmado sustituto'
      }))
    }}
  };
  const assessed=assessJointAbsenceResult(plan,synthetic);
  const sessionIssues=new Map();
  for(const session of assessed?.sessionAudit?.entries||[]){
    for(const slot of plan.supportSessions?.find(row=>row.id===session.sessionId)?.slots||[]){
      if(session.reviewStatus==='conflict'){
        sessionIssues.set(slot.activityId,'Conflicto detectado en la sesión PT/AL completa.');
      }
    }
  }
  for(const row of rows){
    const collisions=(occupancy.get(key(row.selected,row.slotId))||0)>1;
    const unavailable=plan.localAudit?.teacherAvailability?.[row.selected]?.[row.slotId]==='blocked';
    const conflicted=Boolean(row.selected&&(collisions||unavailable||
      sessionIssues.has(row.activityId)));
    row.issue=!row.selected?'Sin sustituto seleccionado':
      collisions?'El mismo sustituto figura en dos actividades de esta franja.':
      unavailable?'El sustituto no está disponible en esta franja.':
      sessionIssues.get(row.activityId)||'';
    row.confirmable=Boolean(row.selected&&!conflicted);
    if(!row.confirmable)row.confirmed=false;
  }
  const count=rows.filter(row=>row.confirmed).length;
  const allConfirmed=rows.length>0&&count===rows.length;
  const approved=Boolean(review.approved&&allConfirmed);
  return {rows,confirmed:count,total:rows.length,allConfirmed,
    approved,assessment:assessed,
    warning:assessed?.sessionAudit?.entries?.some(row=>row.reviewStatus==='needsReview')||
      assessed?.status==='unknown'};
}
export function selectDraftSubstitute(plan,result,review,activityId,teacherId){
  const before=prepareDraftReview(plan,result,review);
  const entry=before?.rows.find(row=>row.activityId===activityId);
  if(!entry||(teacherId!==''&&!entry.options.some(row=>row.id===teacherId)))
    throw Error('No se puede seleccionar un sustituto sin evaluación válida del motor.');
  return {...review,choices:{...(review?.choices||{}),[activityId]:teacherId},
    confirmed:(review?.confirmed||[]).filter(id=>id!==activityId),approved:false};
}
export function confirmDraftSlot(plan,result,review,activityId){
  const before=prepareDraftReview(plan,result,review);
  const entry=before?.rows.find(row=>row.activityId===activityId);
  if(!entry?.confirmable)throw Error(entry?.issue||'La cobertura no es verificable.');
  return {...review,confirmed:unique([...(review?.confirmed||[]),activityId]),
    approved:false};
}
export function approveDraftForPrint(plan,result,review){
  const before=prepareDraftReview(plan,result,review);
  if(!before?.allConfirmed)throw Error('Confirma primero cada franja con sustituto compatible.');
  if(before.assessment?.anomalies?.length)
    throw Error('La revisión contiene anomalías no verificables.');
  return {...review,approved:true};
}
