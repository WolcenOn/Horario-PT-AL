import {DAYS} from './constants.js';
import {escapeHtml as esc} from './utils.js';
// Print-only immutable projection of the reviewed draft. No pupil references.
export function renderReviewedDayPrint({date,state,adapter,plan,review}){
  if(!review?.approved||!review.rows?.length)throw Error('Confirma el borrador antes de imprimir.');
  const day=DAYS[(new Date(date+'T12:00:00Z').getUTCDay()+6)%7]?.id;
  const people=new Map((state.professionals||[]).map(row=>[row.id,row.nombre||row.id]));
  const aliases=adapter.report?.mappings?.teachers||{};
  const names=new Map(Object.entries(aliases).map(([id,bid])=>[bid,people.get(id)||id]));
  const slots=plan.slots||adapter.report?.slots||[];
  const byId=new Map(slots.map(row=>[row.id,row]));
  const rows=[];
  const confirmed=new Map(review.rows.map(row=>[row.activityId,row]));
  const teacherFor=row=>aliases[row.professionalId]||'';
  const groupIds=new Map((adapter.configuration?.groups||[])
    .map(row=>[String(row.label||'').trim().toLocaleLowerCase('es'),row.id]));
  function addSegment({start,end,label,owner,assignment,sourceId=''}){
    rows.push({start,end,label,owner,substitute:assignment?.selected?
      names.get(assignment.selected)||assignment.selected:'',
      changed:Boolean(assignment?.confirmed),sourceId});
  }
  for(const item of state.classSchedules||[]){
    if(item.dia!==day)continue;
    const teacher=teacherFor(item);
    const group=groupIds.get(String(item.grupoClase||'').trim().toLocaleLowerCase('es'))||'';
    const matching=review.rows.filter(row=>row.kind==='CLASS'&&row.teacherId===teacher&&
      row.groupId===group);
    const relevant=matching.map(row=>({row,slot:byId.get(row.slotId)}))
      .filter(x=>x.slot&&x.slot.start>=item.inicio&&x.slot.end<=item.fin);
    const label=String(item.grupoClase||'Clase')+' · '+String(item.materia||'Materia');
    if(relevant.length){
      for(const {row,slot} of relevant)addSegment({
        start:slot.start,end:slot.end,label,owner:people.get(item.professionalId)||'Docente',
        assignment:confirmed.get(row.activityId),sourceId:row.activityId
      });
      // Preserve unaffected intervals of a partially absent lesson.
      const bounds=[item.inicio,...relevant.flatMap(x=>[x.slot.start,x.slot.end]),item.fin]
        .filter(Boolean).sort();
      for(let i=0;i<bounds.length-1;i++){
        if(bounds[i]===bounds[i+1])continue;
        if(relevant.some(x=>x.slot.start<=bounds[i]&&bounds[i+1]<=x.slot.end))continue;
        addSegment({start:bounds[i],end:bounds[i+1],label,
          owner:people.get(item.professionalId)||'Docente'});
      }
    }else addSegment({start:item.inicio,end:item.fin,label,
      owner:people.get(item.professionalId)||'Docente'});
  }
  const groups=new Map((state.groups||[]).map(row=>[row.id,row]));
  const original=new Map((plan.supportSessions||[]).map(row=>[row.id,row]));
  for(const item of state.sessions||[]){
    if(item.dia!==day)continue;
    const group=groups.get(item.groupId);
    if(!group)continue;
    const support=original.get(item.id);
    const label='Apoyo '+(group.tipo==='AL'?'AL':'PT');
    const owner=people.get(item.professionalId||group.professionalId)||'Especialista';
    if(!support?.slots?.length){
      addSegment({start:item.inicio,end:item.fin,label,owner});continue;
    }
    for(const piece of support.slots){
      const slot=byId.get(piece.slotId);
      if(!slot)continue;
      addSegment({start:slot.start,end:slot.end,label,owner,
        assignment:confirmed.get(piece.activityId),sourceId:piece.activityId});
    }
  }
  // Do not silently drop an assignment that was confirmed but has no source
  // timetable block (a malformed local schedule).
  const shown=new Set(rows.map(row=>row.sourceId).filter(Boolean));
  for(const item of review.rows){
    if(shown.has(item.activityId))continue;
    addSegment({start:item.start,end:item.end,
      label:item.kind==='CLASS'?'Clase (sin ficha de horario)':'Apoyo '+item.kind,
      owner:names.get(item.teacherId)||item.teacherId,
      assignment:item,sourceId:item.activityId});
  }
  rows.sort((a,b)=>a.start.localeCompare(b.start)||a.label.localeCompare(b.label,'es'));
  return '<section id="absence-print-sheet" aria-label="Horario revisado del día">'+
    '<h1>Horario diario de sustituciones · '+esc(date.split('-').reverse().join('/'))+'</h1>'+
    '<p>Revisión manual del borrador para coordinación. No confirma su aplicación '+
    'en el horario oficial ni cambia el registro de ausencias.</p>'+
    '<table><thead><tr><th>Franja</th><th>Actividad / grupo</th>'+
    '<th>Docente previsto</th><th>Sustituto</th></tr></thead><tbody>'+
    rows.map(row=>'<tr class="'+(row.changed?'absence-print-replacement':'')+'">'+
      '<td>'+esc(row.start)+'–'+esc(row.end)+'</td>'+
      '<td>'+esc(row.label)+'</td>'+
      '<td>'+esc(row.owner)+'</td>'+
      '<td>'+(row.changed?'<strong>'+esc(row.substitute)+'</strong>':'—')+'</td>'+
      '</tr>').join('')+
    '</tbody></table><p class="absence-print-key">Las franjas sustituidas tienen un '+
    'borde grueso y el nombre del sustituto en negrita.</p></section>';
}
