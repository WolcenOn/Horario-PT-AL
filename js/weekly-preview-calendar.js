// The weekly solver preview is display-only. It is NOT an application payload.
// Build a privacy-minimized projection without pupil tokens, pupil names,
// real pupil IDs or server-provided HTML. Fixed PT/AL blocks stay fixed.
import { DAYS } from './constants.js';
import { compareWeeklyPreviewBlocks } from './weekly-preview-comparison.js';
import { filterWeeklyPreviewCalendar,weeklyPreviewFilterOptions } from './weekly-preview-filters.js';
import { escapeHtml } from './utils.js';

const DAY_INDEX=new Map(DAYS.map((day,index)=>[day.id,index]));
const CLOCK=/^([01]\d|2[0-3]):[0-5]\d$/;
const TYPES=new Set(['PT','AL']);
const minutes=value=>{
  if(typeof value!=='string'||!CLOCK.test(value))return null;
  const [hour,minute]=value.split(':').map(Number);
  return hour*60+minute;
};
const safeText=(value,max=120)=>typeof value==='string'
  ?value.trim().slice(0,max):'';
const dayOf=value=>Number.isInteger(value)&&value>=0&&value<5
  ?value:DAY_INDEX.get(value);
function block(kind,source,day,start,end,label,context='',room='',teacherId='',classGroups=[]){
  const begin=minutes(start),finish=minutes(end);
  if(day===undefined||begin===null||finish===null||finish<=begin||
    begin%15||finish%15)return null;
  return {kind,source,day,start,end,label:safeText(label),
    context:safeText(context),room:safeText(room,64),
    teacherId:safeText(teacherId,64),
    classGroups:[...new Set(classGroups.map(value=>safeText(value,64)).filter(Boolean))],
    duration:finish-begin};
}
const sorted=blocks=>blocks.sort((a,b)=>a.day-b.day||
  minutes(a.start)-minutes(b.start)||minutes(a.end)-minutes(b.end)||
  a.kind.localeCompare(b.kind));

export function buildWeeklyPreviewCalendar(state,result,payload=null){
  if(result?.preview_only!==true||result?.status!=='feasible')return null;
  const groups=new Map((state?.groups||[]).map(row=>[row.id,row]));
  const professionals=new Map((state?.professionals||[]).map(row=>[row.id,row]));
  const students=new Map((state?.students||[]).map(row=>[row.id,row]));
  const lessonMetadata=new Map((payload?.lessons||[]).map(row=>[
    JSON.stringify([row.group_id,row.subject_id]),row
  ]));
  // Request metadata is read only to associate a response with class and
  // professional. No pupil tokens/IDs enter the projected or rendered data.
  const supportMetadata=new Map([
    ...(payload?.supports||[]),...(payload?.group_supports||[])
  ].filter(row=>typeof row.request_id==='string')
    .map(row=>[row.request_id,row]));
  const teacherOptions=[];
  const teacherIds=new Set();
  const recordTeacher=id=>{
    if(!id||teacherIds.has(id))return;
    teacherIds.add(id);
    teacherOptions.push({id,label:safeText(professionals.get(id)?.nombre,120)||id});
  };
  const requestClasses=request=>request
    ?[...new Set((Array.isArray(request.participants)?request.participants
      .map(item=>item.group_id):[request.group_id]).filter(Boolean))]
    :[];
  const currentLessons=(state?.classSchedules||[]).map(row=>{
    const teacherId=safeText(row.professionalId,64);
    const course=safeText(row.grupoClase,64);
    const item=block('lesson','current',dayOf(row.dia),row.inicio,row.fin,
      row.materia||'Materia ordinaria',course,row.aula||'',
      teacherId,course?[course]:[]);
    if(item)recordTeacher(teacherId);
    return item;
  }).filter(Boolean);
  const fixedSupports=(state?.sessions||[]).map(row=>{
    const group=groups.get(row.groupId);
    const service=String(row.tipo||group?.tipo||'').toUpperCase();
    if(!TYPES.has(service))return null;
    const teacherId=safeText(row.professionalId||group?.professionalId,64);
    const excluded=new Set(row.excludedStudentIds||[]);
    const classes=[...new Set((group?.studentIds||[])
      .filter(id=>!excluded.has(id))
      .map(id=>students.get(id)?.grupoClase).filter(Boolean))];
    const item=block(service,'fixed',dayOf(row.dia),row.inicio,row.fin,
      'Apoyo '+service+' existente','Franja fija',
      row.aula||group?.roomId||'',teacherId,classes);
    if(item)recordTeacher(teacherId);
    return item;
  }).filter(Boolean);
  const proposedLessons=(result.lessons||[]).map(row=>{
    const matching=lessonMetadata.get(JSON.stringify([row.group_id,row.subject_id]));
    const teacherId=safeText(row.teacher_id||matching?.teacher_id,64);
    const course=safeText(row.group_id,64);
    const item=block('lesson','proposed',dayOf(row.weekday),row.start_time,row.end_time,
      row.subject_id||'Materia ordinaria',course,row.room_id||matching?.room_id||'',
      teacherId,course?[course]:[]);
    if(item)recordTeacher(teacherId);
    return item;
  }).filter(Boolean);
  const proposedSupports=(result.supports||[]).map(row=>{
    if(!TYPES.has(row.service))return null;
    const matching=supportMetadata.get(row.request_id);
    const teacherId=safeText(matching?.teacher_id,64);
    const item=block(row.service,'proposed',dayOf(row.weekday),
      row.start_time,row.end_time,'Apoyo '+row.service+' propuesto',
      'Individual · identidad protegida',row.room_id||'',
      teacherId,requestClasses(matching));
    if(item)recordTeacher(teacherId);
    return item;
  }).filter(Boolean);
  const proposedGroups=(result.group_supports||[]).map(row=>{
    if(!TYPES.has(row.service))return null;
    const count=Number.isInteger(row.participant_count)&&
      row.participant_count>=1&&row.participant_count<=8
      ?row.participant_count:null;
    const matching=supportMetadata.get(row.request_id);
    const teacherId=safeText(matching?.teacher_id,64);
    const item=block(row.service,'proposed',dayOf(row.weekday),
      row.start_time,row.end_time,'Apoyo '+row.service+' grupal',
      count===null?'Participantes anonimizados':count+' participante(s)',
      row.room_id||'',teacherId,requestClasses(matching));
    if(item)recordTeacher(teacherId);
    return item;
  }).filter(Boolean);
  const participating=new Set(
    (Array.isArray(payload?.lessons)?payload.lessons:result.lessons||[])
      .map(row=>safeText(row.group_id)).filter(Boolean)
  );
  const preservedLessons=currentLessons.filter(item=>!participating.has(item.context));
  const affectedLessons=currentLessons.filter(item=>participating.has(item.context));
  const comparison=compareWeeklyPreviewBlocks(
    affectedLessons,proposedLessons,fixedSupports,
    [...proposedSupports,...proposedGroups],preservedLessons
  );
  const current=sorted(comparison.current);
  const proposed=sorted(comparison.proposed);
  return {
    days:DAYS.map((day,index)=>({
      id:day.id,label:day.label,
      current:current.filter(item=>item.day===index),
      proposed:proposed.filter(item=>item.day===index)
    })),
    teacherOptions,
    comparison:{
      changes:comparison.changes,
      classes:comparison.classes,
      supports:comparison.supports
    },
    counts:{
      ordinaryCurrent:currentLessons.length,
      ordinaryProposed:proposedLessons.length,
      ordinaryRetained:preservedLessons.length,
      fixedSupports:fixedSupports.length,
      additionalSupports:proposedSupports.length+proposedGroups.length
    }
  };
}

function renderBlock(item){
  const kind=item.kind==='lesson'?'lesson':item.kind==='PT'?'pt':'al';
  const source=item.source==='fixed'?'fija':
    item.source==='retained'?'conservada':
    item.source==='proposed'?'propuesta':'actual';
  const changes={
    same:'Coincide',changed:item.source==='current'?'Antes':'Cambio',
    new:item.kind==='lesson'?'Nueva':'Adicional',
    removed:'Solo actual',fixed:'Fija',outside:'Fuera del cálculo'
  };
  const badge=changes[item.change]||'Revisar';
  return '<article class="weekly-review-block is-'+kind+' is-change-'+item.change+
    '" data-weekly-review-block="'+kind+'" data-weekly-review-source="'+source+
    '" data-weekly-review-change="'+escapeHtml(item.change)+'">'+
    '<div class="weekly-review-block-top"><b>'+escapeHtml(item.start)+'–'+escapeHtml(item.end)+
    '</b><span>'+escapeHtml(item.kind==='lesson'?'Materia':item.kind)+'</span></div>'+
    '<strong>'+escapeHtml(item.label)+'</strong>'+
    (item.context?'<small>'+escapeHtml(item.context)+'</small>':'')+
    (item.room?'<small>Sala: '+escapeHtml(item.room)+'</small>':'')+
    '<small class="weekly-review-change-label">'+escapeHtml(badge)+'</small>'+
    '</article>';
}

function signedMinutes(value){
  return value>0?'+'+value:String(value);
}

function renderComparison(comparison){
  if(!comparison)return '';
  const {changes,classes,supports}=comparison;
  const metrics=[
    ['Coinciden',changes.same],['Cambian',changes.changed],
    ['Nuevas',changes.added],['Solo en horario actual',changes.removed]
  ];
  return '<div class="weekly-review-comparison" data-weekly-review-comparison>'+
    '<h4>Qué cambia en las materias ordinarias</h4>'+
    '<div class="weekly-review-diff-metrics">'+metrics.map(([label,count])=>
      '<span>'+escapeHtml(label)+': <b>'+count+'</b></span>').join('')+'</div>'+
    (changes.ambiguous
      ?'<p class="weekly-review-uncertain">Hay '+changes.ambiguous+
        ' posible(s) reorganización(es) con múltiples franjas del mismo grupo y asignatura. '+
        'Se muestran como altas y bajas porque no hay un identificador estable que permita emparejarlas sin suposiciones.</p>'
      :'')+
    '<h4>Minutos semanales por clase</h4>'+
    '<div class="weekly-review-table-wrap"><table class="weekly-review-table" data-weekly-review-classes>'+
    '<thead><tr><th>Clase</th><th>Actual</th><th>Propuesto</th><th>Diferencia</th></tr></thead><tbody>'+
    (classes.length?classes.map(item=>
      '<tr><th scope="row">'+escapeHtml(item.group)+'</th>'+
      '<td>'+item.currentMinutes+' min</td>'+
      '<td>'+item.proposedMinutes+' min</td>'+
      '<td>'+signedMinutes(item.differenceMinutes)+' min</td></tr>'
    ).join(''):'<tr><td colspan="4">Sin materias para comparar.</td></tr>')+
    '</tbody></table></div>'+
    '<h4>Minutos de sesiones PT/AL</h4>'+
    '<div class="weekly-review-table-wrap"><table class="weekly-review-table" data-weekly-review-supports>'+
    '<thead><tr><th>Servicio</th><th>Fijos</th><th>Adicionales</th><th>Total</th></tr></thead><tbody>'+
    supports.map(item=>
      '<tr><th scope="row">'+escapeHtml(item.service)+'</th>'+
      '<td>'+item.fixedMinutes+' min</td>'+
      '<td>'+item.additionalMinutes+' min</td>'+
      '<td>'+item.totalMinutes+' min</td></tr>'
    ).join('')+'</tbody></table></div>'+
    '<p class="weekly-review-footnote">Los minutos son sumas de duraciones de sesiones visibles; '+ 
    'no certifican por sí solos la cobertura curricular. Los minutos PT/AL cuentan cada sesión '+ 
    'grupal una sola vez, no se multiplican por participantes. Las coincidencias de materias '+ 
    'comprueban clase, asignatura y franja; el docente solo se contrasta cuando ambas fuentes '+ 
    'identifican al mismo profesional.</p></div>';
}

function renderFilteredComparison(filtered){
  const {counts,days,comparison,visible,selection}=filtered;
  const any=Boolean(selection.classGroup||selection.teacherId||selection.room);
  return '<div data-weekly-review-results>'+
    '<p class="weekly-review-filter-status" data-weekly-filter-status role="status" aria-live="polite">'+
    (any?'Vista filtrada: ':'Vista completa: ')+visible.current+
    ' franja(s) actuales y '+visible.proposed+' en la propuesta'+
    (any?'. Las sesiones sin clase, docente o sala conocida no se atribuyen a filtros por esos campos.':'.')+
    '</p>'+
    '<div class="weekly-review-metrics">'+
    '<span>Materias actuales: <b>'+counts.ordinaryCurrent+'</b></span>'+
    '<span>Materias propuestas: <b>'+counts.ordinaryProposed+'</b></span>'+
    '<span>Otras franjas conservadas: <b>'+counts.ordinaryRetained+'</b></span>'+
    '<span>Apoyos fijos: <b>'+counts.fixedSupports+'</b></span>'+
    '<span>Apoyos adicionales: <b>'+counts.additionalSupports+'</b></span></div>'+
    '<div class="weekly-review-legend"><span>Materia ordinaria</span><span>PT</span><span>AL</span><span>Fijo / existente</span></div>'+
    renderComparison(comparison)+
    '<div class="weekly-review-days">'+days.map(day=>
      '<section class="weekly-review-day" data-weekly-review-day="'+escapeHtml(day.id)+'">'+
      '<h4>'+escapeHtml(day.label)+'</h4><div class="weekly-review-columns">'+
      '<div class="weekly-review-column"><h5>Horario actual</h5>'+
      (day.current.length?day.current.map(renderBlock).join(''):'<p class="weekly-review-empty">Sin franjas guardadas</p>')+'</div>'+
      '<div class="weekly-review-column"><h5>Propuesta + apoyos fijos</h5>'+
      (day.proposed.length?day.proposed.map(renderBlock).join(''):'<p class="weekly-review-empty">Sin sesiones propuestas</p>')+'</div>'+
      '</div></section>').join('')+'</div>'+
    '<p class="weekly-review-footnote">La vista no incluye actividades móviles que el motor no haya calculado. Las salas solo aparecen si están identificadas. No equivale a una aprobación ni a un horario aplicado.</p>'+
    '</div>';
}

function renderSelect(field,label,options,selected){
  return '<label>'+escapeHtml(label)+'<select data-weekly-filter="'+field+
    '" aria-label="Filtrar por '+escapeHtml(label.toLowerCase())+'">'+
    '<option value="">Todos</option>'+
    options.map(item=>{
      const value=typeof item==='string'?item:item.id;
      const text=typeof item==='string'?item:item.label;
      return '<option value="'+escapeHtml(value)+'"'+
        (selected===value?' selected':'')+'>'+escapeHtml(text)+'</option>';
    }).join('')+'</select></label>';
}

export function renderWeeklyPreviewCalendar(projection,selection={}){
  if(!projection)return '';
  const chosen={
    classGroup:selection.classGroup||'',teacherId:selection.teacherId||'',
    room:selection.room||''
  };
  const available=weeklyPreviewFilterOptions(projection);
  const filtered=filterWeeklyPreviewCalendar(projection,chosen);
  return '<section class="weekly-review" data-weekly-preview-calendar aria-label="Comparación semanal de solo lectura">'+
    '<header><h3>Semana actual y propuesta del motor</h3>'+
    '<p>Consulta exclusivamente visual. Las materias propuestas sustituyen solo las de las clases incluidas en el cálculo; las de otras clases se conservan. Los apoyos fijos se mantienen y los apoyos propuestos son <strong>adicionales</strong>. No se muestran identidades del alumnado, ni se aplica nada.</p></header>'+
    '<div class="weekly-review-filters" data-weekly-review-filters>'+
    renderSelect('classGroup','Clase',available.classes,chosen.classGroup)+
    renderSelect('teacherId','Docente',available.teachers,chosen.teacherId)+
    renderSelect('room','Sala',available.rooms,chosen.room)+
    '<button type="button" class="button" data-weekly-filter-reset>Limpiar filtros</button>'+
    '</div>'+
    renderFilteredComparison(filtered)+'</section>';
}

export function bindWeeklyPreviewCalendarFilters(container,projection){
  const panel=container?.querySelector('[data-weekly-preview-calendar]');
  if(!panel||!projection)return;
  const selectors=Object.fromEntries(['classGroup','teacherId','room']
    .map(name=>[name,panel.querySelector('[data-weekly-filter="'+name+'"]')]));
  const redraw=()=>{
    const chosen=Object.fromEntries(Object.entries(selectors)
      .map(([name,node])=>[name,node?.value||'']));
    const results=panel.querySelector('[data-weekly-review-results]');
    if(results)results.outerHTML=renderFilteredComparison(
      filterWeeklyPreviewCalendar(projection,chosen)
    );
  };
  Object.values(selectors).forEach(node=>node?.addEventListener('change',redraw));
  panel.querySelector('[data-weekly-filter-reset]')?.addEventListener('click',()=>{
    Object.values(selectors).forEach(node=>{if(node)node.value='';});
    redraw();
  });
}