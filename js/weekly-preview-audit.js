// Conservative, display-only post-checks of one solver preview.
// "feasible" certifies only the solver's submitted demands, never the whole
// school's legal curriculum or per-pupil grouped support coverage.
import {configuredClassGroups} from './education.js';
import {escapeHtml} from './utils.js';

const text=(value,max=100)=>typeof value==='string'?value.slice(0,max).trim():'';
const minutes=time=>{
  if(typeof time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))return null;
  const [hour,minute]=time.split(':').map(Number);
  return hour*60+minute;
};
const valid=row=>Number.isInteger(row?.day)&&row.day>=0&&row.day<=4&&
  minutes(row.start)!==null&&minutes(row.end)!==null&&
  minutes(row.end)>minutes(row.start);
const overlaps=(a,b)=>a.day===b.day&&minutes(a.start)<minutes(b.end)&&
  minutes(b.start)<minutes(a.end);
const period=(row)=>'día '+(row.day+1)+' · '+row.start+'–'+row.end;
const sum=items=>items.reduce((n,row)=>n+row.duration,0);
const bounded=n=>Number.isInteger(n)&&n>=0&&n<=3000;
const key=(group,subject)=>JSON.stringify([group,subject]);
function sumBy(rows,getKey){
  const result=new Map();
  for(const row of rows){
    const id=getKey(row);
    if(!id)continue;
    result.set(id,(result.get(id)||0)+row.duration);
  }
  return result;
}
function roomIssues(blocks,resources){
  const issues=[];
  let unknownRooms=0,unknownUnits=0;
  const byRoom=new Map();
  for(const block of blocks.filter(row=>row.room&&valid(row))){
    if(!byRoom.has(block.room))byRoom.set(block.room,[]);
    byRoom.get(block.room).push(block);
  }
  const specs=new Map((resources||[]).filter(x=>text(x?.room_id)).map(x=>[x.room_id,x]));
  for(const [room,rows] of byRoom){
    const spec=specs.get(room);
    if(!spec)unknownRooms++;
    // An explicit schedule of a room is a hard constraint, independent of
    // occupancy counts. Empty windows means unrestricted hours.
    if(spec?.windows?.length){
      for(const row of rows){
        const allowed=spec.windows.some(w=>w.weekday===row.day&&
          minutes(w.start_time)!==null&&minutes(w.end_time)!==null&&
          minutes(w.start_time)<=minutes(row.start)&&
          minutes(w.end_time)>=minutes(row.end));
        if(!allowed)issues.push({
          kind:'roomWindow',level:'error',
          message:'La sala '+room+' está fuera de su horario permitido ('+period(row)+').'
        });
      }
    }
    // Sweep each quarter-hour intersection once. Count a group session
    // as one booking with participant_count attendees, never as N bookings.
    const marks=[...new Set(rows.flatMap(x=>[minutes(x.start),minutes(x.end)]))]
      .sort((a,b)=>a-b);
    let flagged=false,uncertain=false;
    for(let i=1;i<marks.length;i++){
      const start=marks[i-1],end=marks[i];
      if(start>=end)continue;
      const active=rows.filter(x=>minutes(x.start)<end&&minutes(x.end)>start);
      if(!active.length)continue;
      if(!spec){
        if(active.length>1&&!flagged){
          issues.push({kind:'roomOverlap',level:'error',
            message:'La sala '+room+' tiene '+active.length+
              ' sesiones simultáneas sin aforo compartido configurado.'});
          flagged=true;
        }
        continue;
      }
      if(!Number.isInteger(spec.capacity)||spec.capacity<1)continue;
      const known=active.filter(x=>Number.isInteger(x.roomUnits)&&x.roomUnits>0);
      const occupied=known.reduce((n,x)=>n+x.roomUnits,0);
      if(occupied>spec.capacity&&!flagged){
        issues.push({kind:'roomCapacity',level:'error',
          message:'La sala '+room+' supera su aforo: '+occupied+
            ' asistentes comprobables para '+spec.capacity+' plazas.'});
        flagged=true;
      }else if(known.length<active.length&&!uncertain){
        unknownUnits++;
        uncertain=true;
      }
    }
  }
  return {issues,unknownRooms,unknownUnits};
}

export function analyzeWeeklyPreviewAudit(state,payload,result,projection){
  if(result?.preview_only!==true||result?.status!=='feasible'||!payload||!projection)return null;
  const planned=projection.days.flatMap(day=>day.proposed);
  const placedLessons=planned.filter(row=>row.kind==='lesson'&&row.source==='proposed');
  const totals=sumBy(placedLessons,row=>key(row.context,row.label));
  const targets=new Map();
  for(const row of payload.lessons||[]){
    if(!text(row?.group_id)||!text(row?.subject_id)||!bounded(row.weekly_minutes))
      continue;
    const id=key(row.group_id,row.subject_id);
    targets.set(id,{group:text(row.group_id,80),subject:text(row.subject_id,100),
      required:(targets.get(id)?.required||0)+row.weekly_minutes});
  }
  const curriculum=[...targets].map(([id,entry])=>{
    const placed=totals.get(id)||0;
    return {...entry,placed,missing:Math.max(0,entry.required-placed),
      surplus:Math.max(0,placed-entry.required)};
  });
  const unexpected=placedLessons.filter(row=>!targets.has(key(row.context,row.label)));
  const declared=state?.schoolSettings
    ?configuredClassGroups(state.schoolSettings):[];
  const sentClasses=new Set((payload.lessons||[]).map(x=>x.group_id));
  const withoutTargets=declared.filter(id=>!sentClasses.has(id)).slice(0,50);
  const individualResults=sumBy(
    (result.supports||[]).map(row=>{
      const start=minutes(row.start_time),end=minutes(row.end_time);
      return {request_id:row.request_id,duration:start!==null&&end!==null&&end>start
        ?end-start:0};
    }),
    row=>row.request_id
  );
  const individual=(payload.supports||[]).filter(x=>bounded(x.weekly_minutes)&&
    text(x.request_id)).map(row=>{
      const placed=individualResults.get(row.request_id)||0;
      return {service:row.service,required:row.weekly_minutes,placed,
        missing:Math.max(0,row.weekly_minutes-placed),
        surplus:Math.max(0,placed-row.weekly_minutes)};
    });
  const knownIndividual=new Set((payload.supports||[]).map(x=>x.request_id));
  const orphanIndividual=(result.supports||[]).filter(
    x=>!knownIndividual.has(x.request_id)).length;
  const groupedRequests=(payload.group_supports||[]).length;
  const room=roomIssues(planned,payload.rooms);
  const issues=[...room.issues];
  // Only single-owner resources: pupils can leave normal classes for support;
  // overlapping a class and an individual support is not inherently a clash.
  const teachers=new Map();
  const lessons=new Map();
  for(const row of planned.filter(valid)){
    if(row.teacherId){
      const group=teachers.get(row.teacherId)||[];
      group.push(row);teachers.set(row.teacherId,group);
    }
    if(row.kind==='lesson'&&row.context){
      const group=lessons.get(row.context)||[];
      group.push(row);lessons.set(row.context,group);
    }
  }
  for(const [teacher,rows] of teachers){
    if(rows.some((a,i)=>rows.slice(i+1).some(b=>overlaps(a,b))))
      issues.push({kind:'teacherOverlap',level:'error',
        message:'El docente '+teacher+' aparece en sesiones solapadas.'});
  }
  for(const [group,rows] of lessons){
    if(rows.some((a,i)=>rows.slice(i+1).some(b=>overlaps(a,b))))
      issues.push({kind:'classOverlap',level:'error',
        message:'La clase '+group+' tiene materias ordinarias solapadas.'});
  }
  const shortSubjects=curriculum.filter(x=>x.missing||x.surplus);
  const shortSupport=individual.filter(x=>x.missing||x.surplus);
  const unknown=room.unknownRooms||room.unknownUnits||groupedRequests||
    withoutTargets.length||unexpected.length||orphanIndividual||
    (payload.supports||[]).length!==individual.length;
  return {
    summary:{
      requestedSubjects:curriculum.length,
      exactSubjects:curriculum.length-shortSubjects.length,
      requestedIndividual:individual.length,
      exactIndividual:individual.length-shortSupport.length,
      groupRequests:groupedRequests,
      roomsWithoutCapacity:room.unknownRooms,
      roomsWithoutOccupancy:room.unknownUnits,
      classesWithoutRequests:withoutTargets.length,
      orphanIndividual
    },
    curriculum,
    individual:{
      missingMinutes:shortSupport.reduce((n,x)=>n+x.missing,0),
      surplusMinutes:shortSupport.reduce((n,x)=>n+x.surplus,0),
      unverified:shortSupport.length
    },
    withoutTargets,unexpected:unexpected.length,
    issues,
    state:issues.length||shortSubjects.length||shortSupport.length?'review':
      unknown?'partial':'checked'
  };
}

export function renderWeeklyPreviewAudit(audit){
  if(!audit)return '';
  const {summary:s,curriculum,individual,issues,withoutTargets}=audit;
  const gaps=curriculum.filter(row=>row.missing||row.surplus);
  const label=audit.state==='review'?'Se requiere revisión':audit.state==='partial'
    ?'Comprobación parcial':'Sin discrepancias en las demandas comprobadas';
  const rows=gaps.slice(0,12).map(row=>'<tr><th scope="row">'+escapeHtml(row.group)+
    ' · '+escapeHtml(row.subject)+'</th><td>'+row.required+' min</td>'+
    '<td>'+row.placed+' min</td><td>'+row.missing+' min</td>'+
    '<td>'+row.surplus+' min</td></tr>').join('');
  return '<section class="weekly-review-audit" data-weekly-preview-audit>'+
    '<h4>Conflictos y cobertura: comprobación global de la propuesta</h4>'+
    '<p class="weekly-review-audit-state" data-weekly-audit-status>'+label+'</p>'+
    '<p class="weekly-review-audit-note">Este informe utiliza la solicitud completa, '+
    'aunque filtres el calendario. «Factible» no significa que todo el currículo '+
    'del centro ni las necesidades de cada alumno estén cubiertos.</p>'+
    '<div class="weekly-review-audit-metrics">'+
    '<span>Materias exactas: <b>'+s.exactSubjects+'/'+s.requestedSubjects+'</b></span>'+
    '<span>Apoyos individuales exactos: <b>'+s.exactIndividual+'/'+s.requestedIndividual+'</b></span>'+
    '<span>Grupos PT/AL por verificar: <b>'+s.groupRequests+'</b></span>'+
    '<span>Clases sin demanda enviada: <b>'+s.classesWithoutRequests+'</b></span></div>'+
    (gaps.length?'<h5>Diferencias de minutos curriculares (sobre lo solicitado)</h5>'+
      '<div class="weekly-review-table-wrap"><table class="weekly-review-table" data-weekly-audit-curriculum>'+
      '<thead><tr><th>Clase y materia</th><th>Pedido</th><th>Colocado</th>'+
      '<th>Falta</th><th>Exceso</th></tr></thead><tbody>'+rows+
      '</tbody></table></div>'+
      (gaps.length>12?'<p>Y '+(gaps.length-12)+' materia(s) adicionales con diferencia.</p>':''):'')+
    (individual.unverified
      ?'<p data-weekly-audit-individual>Apoyos individuales con diferencias: '+
        individual.unverified+'. Faltan '+individual.missingMinutes+
        ' min y sobran '+individual.surplusMinutes+' min respecto a las demandas enviadas.</p>':'')+
    (withoutTargets.length?'<p data-weekly-audit-scope>Sin materias solicitadas al motor: '+
      withoutTargets.map(escapeHtml).join(', ')+'. No se presupone que esos cursos estén cubiertos.</p>':'')+
    (audit.unexpected?'<p>El motor colocó '+audit.unexpected+
      ' materia(s) no incluidas en la solicitud comprobada.</p>':'')+
    (s.orphanIndividual?'<p>El resultado contiene '+s.orphanIndividual+
      ' apoyo(s) individuales sin demanda reconocible.</p>':'')+
    (s.groupRequests?'<p data-weekly-audit-group-warning>Para '+s.groupRequests+
      ' demanda(s) grupales PT/AL no se puede comprobar la cobertura individual: '+
      'la respuesta no identifica qué minutos recibió cada participante.</p>':'')+
    ((s.roomsWithoutCapacity||s.roomsWithoutOccupancy)
      ?'<p data-weekly-audit-room-unknown>Salas sin aforo configurado: '+
        s.roomsWithoutCapacity+'. Salas con ocupación insuficientemente conocida: '+
        s.roomsWithoutOccupancy+'. Los conflictos no demostrables quedan pendientes.</p>':'')+
    (issues.length?'<ul data-weekly-audit-issues>'+issues.slice(0,15).map(item=>
      '<li>'+escapeHtml(item.message)+'</li>').join('')+'</ul>':'')+
    '<p class="weekly-review-audit-note">No valida normativa autonómica, desplazamientos, '+
    'actividades móviles ni distribución individual de grupos PT/AL. No modifica datos.</p>'+
    '</section>';
}
