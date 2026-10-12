// Request-scoped, anonymous student participation for PT/AL dry-run previews.
// Never send local student IDs, names, diagnostic notes or membership rosters.
import { DAYS } from './constants.js';
import { canExtractForSupport, resolveSupportPolicy } from './support-policy.js';
import { minutesToTime, timeToMinutes } from './utils.js';

const DAY = new Map(DAYS.map((value,index)=>[value.id,index]));
const SERVICES = ['PT','AL'];

function tokenFactory() {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('Para calcular apoyos individuales se necesita una conexión segura con generación criptográfica de identificadores.');
  }
  const tokens = new Map();
  return id => {
    if (!tokens.has(id)) tokens.set(id,globalThis.crypto.randomUUID());
    return tokens.get(id);
  };
}

function validInterval(session) {
  const start = timeToMinutes(session.inicio);
  const end = timeToMinutes(session.fin);
  if (!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start%15||end%15) {
    throw new Error('Hay una sesión PT/AL con horas que no encajan en la rejilla de 15 minutos.');
  }
  return end-start;
}

function chunks(minutes) {
  const durations=[];
  let remaining=minutes;
  while (remaining>0) {
    const duration=remaining>=45?45:remaining;
    durations.push(duration);
    remaining-=duration;
  }
  return durations;
}

function extractionRules(state, lessons, student, service) {
  const allowed={blocked:[],avoided:[],preferred:[]};
  const lessonSubjects=lessons.filter(lesson=>lesson.group_id===student.grupoClase);
  const courseRules=state.automationSettings?.courseRules?.[student.curso]||{};
  for (const lesson of lessonSubjects) {
    const subject=lesson.subject_id;
    const priority=courseRules.subjectPriorities?.[subject]||'medium';
    const override=courseRules.subjectPolicies?.[subject]?.extraction
      ??courseRules.subjectPolicies?.[subject]??null;
    const policy=resolveSupportPolicy(priority,override);
    if (!canExtractForSupport(policy,service))allowed.blocked.push(subject);
    else if (policy.preference==='avoid')allowed.avoided.push(subject);
    else if (policy.preference==='preferred')allowed.preferred.push(subject);
  }
  return {
    blocked_subjects:allowed.blocked,
    avoided_subjects:allowed.avoided,
    preferred_subjects:allowed.preferred
  };
}

export function buildAnonymousSupportPreview(state, lessons) {
  const allStudents=(state.students||[]).filter(student=>student.activo!==false && student.id);
  const students=new Map(allStudents.map(student=>[student.id,student]));
  const groupById=new Map((state.groups||[]).filter(group=>group.activo!==false).map(group=>[group.id,group]));
  const professionals=new Map((state.professionals||[]).filter(prof=>prof.activo!==false).map(prof=>[prof.id,prof]));
  const linkedGroups=new Set(lessons.map(lesson=>lesson.group_id));
  const references=new Map();
  const scheduled=new Map();
  const busy=[];
  const warnings=[];
  const eligibleGroups=new Map();

  // No student token needs to be minted when no active support groups exist.
  const activeGroups=[...groupById.values()].filter(group=>SERVICES.includes(group.tipo));
  const eligibleSessions=(state.sessions||[]).filter(session=>groupById.has(session.groupId));
  if (!activeGroups.length&&!eligibleSessions.length) return { supports:[],groupSupports:[],busy:[],teachers:[],warnings:[] };
  const pseudonym=tokenFactory();

  for (const group of activeGroups) {
    const ids=(group.studentIds||[]).filter(id=>students.has(id));
    const professor=professionals.get(group.professionalId);
    if (!professor||professor.tipo!==group.tipo) {
      warnings.push('Un grupo PT/AL tiene un profesional inexistente, inactivo o de otro servicio.');
      continue;
    }
    for (const id of ids) {
      const key=`${id}\u0000${group.tipo}`;
      if (!eligibleGroups.has(key)) eligibleGroups.set(key,[]);
      eligibleGroups.get(key).push(group);
    }
  }

  for (const session of eligibleSessions) {
    const group=groupById.get(session.groupId);
    if (!group) continue;
    const weekday=DAY.get(session.dia);
    if (weekday==null) continue;
    const duration=validInterval(session);
    const teacherId=session.professionalId||group.professionalId;
    if (!professionals.has(teacherId)) {
      warnings.push('Hay una sesión PT/AL con un profesional no disponible en la configuración.');
      continue;
    }
    busy.push({weekday,start_time:session.inicio,end_time:session.fin,teacher_id:teacherId});
    references.set(teacherId,professionals.get(teacherId));
    const excluded=new Set(session.excludedStudentIds||[]);
    for (const id of group.studentIds||[]) {
      if (excluded.has(id)||!students.has(id)) continue;
      const pupil_token=pseudonym(id);
      busy.push({weekday,start_time:session.inicio,end_time:session.fin,pupil_token});
      if (SERVICES.includes(group.tipo)) {
        const key=`${id}\u0000${group.tipo}`;
        scheduled.set(key,(scheduled.get(key)||0)+duration);
      }
    }
  }

  const supports=[];
  const groupSupports=[];
  const groupedKeys=new Set();
  let omitted=0;

  // Keep each pupil's remaining goal distinct: a shared slot consumes
  // 45 minutes of the professional but only counts for its actual attendees.
  // Fail closed for pupils assigned to multiple support groups or unknown classes.
  for (const group of activeGroups) {
    const enrolled=(group.studentIds||[]).filter(id=>students.has(id));
    if (enrolled.length<2)continue;
    const professor=professionals.get(group.professionalId);
    if (!professor||professor.tipo!==group.tipo)continue;
    const persons=[];
    let safe=true;
    for (const id of enrolled) {
      const student=students.get(id);
      const key=`${id}\u0000${group.tipo}`;
      const assigned=eligibleGroups.get(key)||[];
      if (assigned.length!==1||assigned[0]!==group||!linkedGroups.has(student.grupoClase)) {
        safe=false;break;
      }
      const target=Number(group.tipo==='PT'?student.horasPTObjetivoMin:student.horasALObjetivoMin)||0;
      const remaining=Math.max(0,target-(scheduled.get(key)||0));
      if (!remaining)continue;
      if (remaining%15)throw new Error('Las necesidades PT/AL deben encajar en pasos de 15 minutos.');
      persons.push({id,student,key,remaining});
    }
    if (!safe||!persons.length)continue;
    const duration=[45,30,15].find(value=>
      persons.every(person=>person.remaining%value===0)
      && Math.max(...persons.map(person=>person.remaining))/value<=20
    );
    if (!duration)continue;
    const participants=persons.map(person=>({
      pupil_token:pseudonym(person.id),group_id:person.student.grupoClase,
      weekly_minutes:person.remaining,
      ...extractionRules(state,lessons,person.student,group.tipo)
    }));
    groupSupports.push({
      request_id:`group-support-${groupSupports.length+1}`,
      service:group.tipo,
      teacher_id:professor.id,
      session_minutes:duration,
      participants,
      allowed_days:[0,1,2,3,4],
      max_sessions_per_day:2
    });
    persons.forEach(person=>groupedKeys.add(person.key));
    references.set(professor.id,professor);
    if (duration<45)warnings.push('Un apoyo grupal requiere bloques inferiores a 45 minutos para repartir exactamente los objetivos individuales.');
  }

  for (const student of allStudents) {
    for (const service of SERVICES) {
      const target=Number(service==='PT'?student.horasPTObjetivoMin:student.horasALObjetivoMin)||0;
      if (target<=0) continue;
      const key=`${student.id}\u0000${service}`;
      const already=scheduled.get(key)||0;
      if (target<=already) continue;
      const remaining=target-already;
      if(groupedKeys.has(key))continue;
      const groups=eligibleGroups.get(key)||[];
      if (groups.length!==1||groups[0].studentIds.length!==1||!linkedGroups.has(student.grupoClase)) {
        omitted++;
        continue; // Never invent a mixed-group session or assign extra pupil minutes.
      }
      const professional=professionals.get(groups[0].professionalId);
      if (!professional) {omitted++;continue;}
      if (remaining%15!==0) {
        throw new Error('Los objetivos individuales PT/AL deben encajar en pasos de 15 minutos.');
      }
      const minutes=chunks(remaining);
      if (minutes.length>20) {omitted++;continue;}
      const token=pseudonym(student.id);
      const policy=extractionRules(state,lessons,student,service);
      const request_id=`support-${supports.length+1}`;
      supports.push({
        request_id,service,teacher_id:professional.id,
        pupil_token:token,group_id:student.grupoClase,
        weekly_minutes:remaining,durations:minutes,...policy,
        allowed_days:[0,1,2,3,4],max_sessions_per_day:2
      });
      references.set(professional.id,professional);
    }

    // A pupil's explicit "no salir" windows prohibit *all* their supports.
    if ([...scheduled.keys()].some(key=>key.startsWith(`${student.id}\u0000`))
      || supports.some(support=>support.pupil_token===pseudonym(student.id))
      || groupedKeys.has(`${student.id}\u0000PT`)
      || groupedKeys.has(`${student.id}\u0000AL`)) {
      for (const restriction of student.restricciones||[]) {
        if (restriction.tipo!=='no-salir'||!DAY.has(restriction.dia)) continue;
        const duration=validInterval(restriction);
        if(duration>0)busy.push({
          weekday:DAY.get(restriction.dia),start_time:restriction.inicio,
          end_time:restriction.fin,pupil_token:pseudonym(student.id)
        });
      }
    }
  }
  if(omitted)warnings.push(`${omitted} necesidad(es) PT/AL pendientes no se han incluido: falta un grupo inequívoco, clase configurada o duración compatible.`);
  if(supports.length||groupSupports.length)warnings.push('Los apoyos propuestos todavía requieren revisión antes de aplicarse. No se modelan desplazamientos ni espacios compartidos.');
  return {supports,groupSupports,busy,teachers:[...references.values()],warnings};
}
