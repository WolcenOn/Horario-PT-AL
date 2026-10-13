// Local-only context for auditing dated substitute proposals.
// Never return pupil IDs, names, membership rosters, diagnoses or notes.
import {DAYS} from './constants.js';
import {canExtractForSupport,resolveSupportPolicy} from './support-policy.js';
import {professionalCanWork} from './professional-availability.js';

const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const tidy=value=>String(value||'').trim();
const key=value=>tidy(value).toLocaleLowerCase('es');
const absent=rows=>!Array.isArray(rows);

function extractionForStudent(state,student,service,dayId,interval,lessons){
  const group=key(student.grupoClase);
  if(!group||!tidy(student.curso))return 'unknown';
  const relevant=lessons.filter(lesson=>
    key(lesson.grupoClase)===group&&lesson.dia===dayId&&
    lesson.inicio<interval.end&&interval.start<lesson.fin);
  if(relevant.length!==1||!tidy(relevant[0].materia))return 'unknown';
  const lesson=relevant[0];
  const rules=state.automationSettings?.courseRules?.[student.curso];
  if(!rules)return 'unknown';
  const subject=tidy(lesson.materia);
  const explicit=rules.subjectPolicies?.[subject];
  const legacy=rules.subjectPriorities?.[subject];
  if(explicit===undefined&&legacy===undefined)return 'unknown';
  const pref=legacy||'medium';
  const policy=explicit&&typeof explicit==='object'?
    resolveSupportPolicy({
      extraction:explicit.extraction,
      preference:explicit.preference||resolveSupportPolicy(pref).preference
    }):resolveSupportPolicy(pref,explicit);
  return canExtractForSupport(policy,service)?'allowed':'blocked';
}

function sessionCheck(state,session,group,students,allSessions,groups,dayId){
  if(!group||absent(group.studentIds))return {
    extractionBlocked:0,extractionUnknown:0,extractionChecked:0,
    participantClashes:0,participantsKnown:false
  };
  const excluded=new Set(session.excludedStudentIds||[]);
  const enrolled=group.studentIds.filter(id=>!excluded.has(id)&&students.has(id));
  const classes=state.classSchedules||[];
  let extractionBlocked=0,extractionUnknown=0,extractionChecked=0,participantClashes=0;
  const period={start:session.inicio,end:session.fin};
  for(const id of enrolled){
    const status=extractionForStudent(state,students.get(id),group.tipo,
      dayId,period,classes);
    if(status==='blocked')extractionBlocked++;
    else if(status==='unknown')extractionUnknown++;
    else extractionChecked++;
    const clashes=allSessions.some(peer=>{
      if(peer.id===session.id||peer.dia!==dayId||
        !overlap({start:peer.inicio,end:peer.fin},period))return false;
      const other=groups.get(peer.groupId);
      return (other?.studentIds||[]).includes(id)&&
        !(peer.excludedStudentIds||[]).includes(id);
    });
    if(clashes)participantClashes++;
  }
  return {extractionBlocked,extractionUnknown,extractionChecked,
    participantClashes,participantsKnown:enrolled.length>0};
}

export function buildJointLocalAuditContext(state,adapter,date){
  const weekday=(new Date(date+'T12:00:00Z').getUTCDay()+6)%7;
  const dayId=DAYS[weekday]?.id||'';
  const students=new Map((state.students||[])
    .filter(row=>row.activo!==false).map(row=>[row.id,row]));
  const groups=new Map((state.groups||[]).map(row=>[row.id,row]));
  const sourceSessions=state.sessions||[];
  const byId=new Map(sourceSessions.map(row=>[row.id,row]));
  const mapping=adapter?.report?.mappings?.teachers||{};
  const sessionChecks={};
  for(const definition of adapter?.report?.supportSessions||[]){
    const source=byId.get(definition.id);
    const group=groups.get(source?.groupId);
    if(!source||source.dia!==dayId)continue;
    sessionChecks[definition.id]=sessionCheck(
      state,source,group,students,sourceSessions,groups,dayId);
  }
  const substituteBookings=[];
  for(const row of adapter?.report?.supportSessions||[]){
    if(row.weekday!==weekday)continue;
    substituteBookings.push({
      teacherId:row.teacherId,start:row.start,end:row.end,
      roomId:row.roomId||'',kind:row.kind
    });
  }
  for(const lesson of state.classSchedules||[]){
    if(lesson.dia!==dayId||!mapping[lesson.professionalId])continue;
    substituteBookings.push({
      teacherId:mapping[lesson.professionalId],
      start:lesson.inicio,end:lesson.fin,
      roomId:tidy(lesson.aula||lesson.roomId),
      kind:'CLASS'
    });
  }
  // A known explicit weekly availability is checked against each atomic slot.
  // Missing availability is unknown rather than an invented permission.
  const teacherAvailability={};
  const slots=adapter?.report?.slots||[];
  for(const professional of state.professionals||[]){
    const teacherId=mapping[professional.id];
    if(!teacherId)continue;
    const intervals=professional.disponibilidad?.[dayId];
    teacherAvailability[teacherId]=Object.fromEntries(slots.map(slot=>[
      slot.id,Array.isArray(intervals)
        ?(professionalCanWork(professional,dayId,slot.start,slot.end)?'available':'blocked')
        :'unknown'
    ]));
  }
  const travelRules=(state.centerPlanningSettings?.generation?.travelRules||[])
    .filter(row=>row&&row.fromLocationId&&row.toLocationId&&
      Number.isInteger(row.minutes)&&row.minutes>=0)
    .map(row=>({fromLocationId:row.fromLocationId,
      toLocationId:row.toLocationId,minutes:row.minutes}));
  return {sessionChecks,substituteBookings,travelRules,teacherAvailability};
}
