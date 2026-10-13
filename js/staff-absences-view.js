// Local calendar: coverage is declared manually, never certified by the solver.
import {buildAbsenceCalendar} from './staff-absences.js';
import {scheduledAbsenceBlocks} from './absence-flow.js';
import {renderJointAbsencePanel,bindJointAbsencePanel} from './joint-absence-view.js';
import {escapeHtml as esc} from './utils.js';

const caption=date=>date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
const label=row=>row.status==='resolved'?'Resuelta · confirmación manual':'Pendiente de cobertura';
const badge=row=>row.status==='resolved'?'is-resolved':'is-pending';
const range=row=>row.fromDate===row.toDate?caption(row.fromDate):
  caption(row.fromDate)+'–'+caption(row.toDate);
const hours=row=>row.startTime?row.startTime+'–'+row.endTime:'Jornada completa';

function dayMarkup(day,selected){
  return '<button type="button" class="absence-day'+
    (day.inMonth?'':' is-outside')+(selected===day.date?' is-selected':'')+
    (day.pending?' has-pending':'')+'"'+
    (day.inMonth?' data-absence-day="'+esc(day.date)+'"':' disabled')+
    ' aria-label="'+esc(caption(day.date))+': '+day.pending+
    ' pendientes y '+day.resolved+' resueltas">'+
    '<span class="absence-day-number">'+Number(day.date.slice(-2))+'</span>'+
    (day.items.length?'<span class="absence-day-count">'+day.pending+
      ' pendiente(s) · '+day.resolved+' resuelta(s)</span>':'')+
    day.items.slice(0,3).map(row=>'<span class="absence-calendar-chip '+badge(row)+'">'+
      esc(row.professionalName)+'</span>').join('')+
    (day.items.length>3?'<small>+'+(day.items.length-3)+' más</small>':'')+'</button>';
}
function absenceMarkup(row,days){
  const affected=days.reduce((total,day)=>total+day.items.filter(x=>x.id===row.id)
    .reduce((n,x)=>n+x.affected,0),0);
  return '<article class="absence-entry" data-absence-entry="'+esc(row.id)+
    '" data-absence-status="'+esc(row.status)+'">'+
    '<div class="absence-entry-info"><strong>'+esc(row.professionalName)+'</strong>'+
    '<span>'+esc(range(row))+' · '+esc(hours(row))+'</span>'+
    '<small>Franjas semanales previstas afectadas en el mes: '+affected+
    '. No equivale a cobertura confirmada.</small>'+
    (row.resolvedAt?'<small>Confirmación local del '+esc(row.resolvedAt.slice(0,10))+'</small>':'')+
    '</div><div class="absence-entry-actions">'+
    '<span class="absence-status '+badge(row)+'">'+label(row)+'</span>'+
    (row.status==='pending'
      ?'<button type="button" class="button" data-absence-resolve="'+esc(row.id)+'">Confirmar cobertura</button>'
      :'<button type="button" class="button" data-absence-reopen="'+esc(row.id)+'">Reabrir</button>')+
    '<button type="button" class="button button-danger" data-absence-delete="'+esc(row.id)+'">Eliminar</button>'+
    '</div></article>';
}

export function renderStaffAbsences(root,{
  state,month,filter='all',selectedDay='',onMonth,onFilter,onDay,onSave,onStatus,onDelete,onJoint=()=>{},joint=null,onCalculate=()=>{}
}){
  const overview=buildAbsenceCalendar(month,state.staffAbsences||[],state);
  const calendar=buildAbsenceCalendar(month,state.staffAbsences||[],state,{filter,selectedDay});
  const professionals=(state.professionals||[]).filter(row=>row.activo!==false)
    .sort((a,b)=>(a.nombre||'').localeCompare(b.nombre||'','es'));
  const entries=calendar.selectedDay
    ?calendar.days.find(day=>day.date===calendar.selectedDay)?.items||[]
    :calendar.entries;
  const initial=calendar.selectedDay||month+'-01';
  root.innerHTML='<div class="staff-absences-view" data-staff-absences-view>'+
    '<section class="card"><div class="card-header"><div><h2>Calendario global de ausencias</h2>'+
    '<small>Varios docentes, fechas concretas y seguimiento; el horario recurrente no cambia.</small>'+
    '</div><span class="badge badge-neutral">Datos locales · IndexedDB</span></div>'+
    '<div class="card-body"><p class="absence-guidance">«Resuelta» significa cobertura confirmada por una persona del centro, no verificada por el motor. No introduzcas motivos ni diagnósticos médicos.</p>'+
    '<div class="absence-summary" data-absence-summary>'+
    '<span>Sin resolver: <strong>'+overview.summary.pending+'</strong></span>'+
    '<span>Resueltas manualmente: <strong>'+overview.summary.resolved+'</strong></span>'+
    '<span>Docentes afectados: <strong>'+overview.summary.professionals+'</strong></span>'+
    '</div></div></section>'+
    '<section class="card"><div class="card-header"><div><h2>1. Elige la fecha en el calendario</h2>'+
    '<small>Selecciona primero un día. Después elige los docentes y las franjas afectadas.</small></div></div>'+
    '<div class="card-body"><div class="absence-calendar-toolbar">'+
    '<button type="button" class="button" data-absence-prev>← Anterior</button>'+
    '<h3 data-absence-month>'+esc(calendar.monthLabel)+'</h3>'+
    '<button type="button" class="button" data-absence-next>Siguiente →</button>'+
    '<label>Estado <select data-absence-filter aria-label="Filtrar ausencias">'+
    '<option value="all"'+(filter==='all'?' selected':'')+'>Todas</option>'+
    '<option value="pending"'+(filter==='pending'?' selected':'')+'>Pendientes</option>'+
    '<option value="resolved"'+(filter==='resolved'?' selected':'')+'>Resueltas manualmente</option>'+
    '</select></label></div>'+
    '<div class="absence-weekdays" aria-hidden="true">'+
    ['L','M','X','J','V','S','D'].map(x=>'<span>'+x+'</span>').join('')+'</div>'+
    '<div class="absence-month-grid" data-absence-calendar>'+
    calendar.days.map(day=>dayMarkup(day,calendar.selectedDay)).join('')+'</div>'+
    '</div></section>'+
    '<section class="card"><div class="card-header"><div><h2>2. Docentes y franjas del horario previsto</h2>'+
    '<small>Puedes seleccionar uno o varios docentes. Al elegir franjas, cada docente muestra su propio horario previsto.</small></div></div>'+
    '<form id="staffAbsenceForm" class="card-body absence-form">'+
    '<fieldset class="absence-staff-fieldset"><legend>Docentes ausentes</legend>'+
    '<div class="absence-staff-list">'+professionals.map(row=>'<label>'+
      '<input type="checkbox" name="professionalIds" value="'+esc(row.id)+'">'+
      '<span>'+esc(row.nombre||row.id)+' · '+esc(row.tipo||'Docente')+'</span></label>'
    ).join('')+'</div>'+
    (professionals.length?'':'<p>Registra primero algún docente.</p>')+'</fieldset>'+
    '<div class="absence-form-dates">'+
    '<label>Desde <input type="date" name="fromDate" value="'+initial+'" required></label>'+
    '<label>Hasta <input type="date" name="toDate" value="'+initial+'" required></label>'+
    '</div><div class="absence-form-dates" data-absence-manual-hours hidden>'+
    '<label>Hora inicio <input type="time" name="startTime" step="900"></label>'+
    '<label>Hora fin <input type="time" name="endTime" step="900"></label>'+
    '</div>'+
    '<fieldset class="absence-staff-fieldset"><legend>Tipo de ausencia</legend>'+
    '<div class="absence-mode-options">'+
    '<label><input type="radio" name="absenceMode" value="full" checked> Jornada completa</label>'+
    '<label><input type="radio" name="absenceMode" value="schedule"> Elegir sesiones del horario previsto</label>'+
    '<label><input type="radio" name="absenceMode" value="manual"> Horario manual</label>'+
    '</div></fieldset>'+
    '<div data-absence-planned-slots hidden></div>'+
    '<p class="absence-guidance">Para elegir sesiones concretas, selecciona una sola fecha. '+
    'En períodos de varios días puedes elegir jornada completa u horas manuales para todos los días.</p>'+
    '<div class="button-row">'+
    '<button class="button button-primary" type="submit" name="saveAction" value="calculate"'+
    (professionals.length?'':' disabled')+'>Guardar y calcular cobertura</button>'+
    '<button class="button" type="submit" name="saveAction" value="save"'+
    (professionals.length?'':' disabled')+'>Guardar ausencias</button></div>'+
    '</form></section>'+
    '<section class="card"><div class="card-body">'+
    '<div class="absence-list-header"><h3>'+
    (calendar.selectedDay?'Ausencias del '+caption(calendar.selectedDay):'Registros del mes')+'</h3>'+
    (calendar.selectedDay?'<button type="button" class="button" data-absence-clear-day>Ver todo el mes</button>':'')+
    '</div><div class="absence-entries" data-absence-entries>'+
    (entries.length?entries.map(row=>absenceMarkup(row,calendar.days)).join(''):
      '<div class="empty-state">No hay ausencias para esta selección.</div>')+
    '</div>'+
    (calendar.selectedDay&&entries.length?
      '<div class="absence-joint-action"><p>Las ausencias de este día se evalúan juntas, '+
      'incluidos los apoyos PT/AL que el motor conectado pueda resolver.</p>'+
      '<button type="button" class="button" data-absence-prepare-joint>'+
      'Ver evaluación conjunta de este día</button></div>':'')+
    '</div></section>'+
    (joint?.plan&&calendar.selectedDay?
      renderJointAbsencePanel({
        date:calendar.selectedDay,plan:joint.plan,assessment:joint.assessment,
        status:joint.status,result:joint.result,state,adapter:joint.adapter,
        connected:joint.connected,adapterReady:joint.adapterReady,
        embedded:true
      }):'')+
    '<section class="card"><div class="card-body"><h3>Cobertura provisional y sin aplicación</h3>'+
    '<p>Al guardar y calcular se pide confirmación antes de sincronizar el centro y crear un borrador remoto. Solo se calcula el primer día seleccionado, aunque se registren varios días. Las propuestas nunca se aplican ni marcan ausencias como resueltas.</p>'+
    '</div></section></div>';

  const form=root.querySelector('#staffAbsenceForm');
  const planned=form?.querySelector('[data-absence-planned-slots]');
  const updateMode=()=>{
    const mode=form.querySelector('[name="absenceMode"]:checked')?.value||'full';
    const from=form.querySelector('[name="fromDate"]').value;
    const to=form.querySelector('[name="toDate"]').value;
    const selected=form.querySelectorAll('[name="professionalIds"]:checked');
    const saved=new Map([...form.querySelectorAll('[data-planned-slot]')]
      .map(node=>[node.dataset.plannedFor+'\u0000'+node.value,node.checked]));
    form.querySelector('[data-absence-manual-hours]').hidden=mode!=='manual';
    planned.hidden=mode!=='schedule';
    if(mode!=='schedule')return;
    if(from!==to){
      planned.innerHTML='<p class="absence-guidance">Para seleccionar sesiones concretas, '+
        'elige el mismo día en «Desde» y «Hasta».</p>';
      return;
    }
    planned.innerHTML=selected.length?[...selected].map(node=>{
      const person=professionals.find(p=>p.id===node.value);
      const blocks=scheduledAbsenceBlocks(state,node.value,from);
      return '<fieldset class="absence-planned-group" data-planned-group="'+esc(node.value)+'">'+
        '<legend>'+esc(person?.nombre||node.value)+'</legend>'+
        (blocks.length?blocks.map(block=>{
          const token=node.value+'\u0000'+block.key;
          const checked=saved.has(token)?saved.get(token):true;
          return '<label><input type="checkbox" data-planned-slot data-planned-for="'+
            esc(node.value)+'" value="'+esc(block.key)+'"'+(checked?' checked':'')+'>'+
            '<span><strong>'+esc(block.start)+'–'+esc(block.end)+'</strong> · '+
            esc(block.label)+'</span></label>';
        }).join(''):'<p class="absence-guidance">No hay sesiones previstas para este '+
          'docente en la fecha elegida. Escoge jornada completa u horas manuales.</p>')+
        '</fieldset>';
    }).join(''):'<p class="absence-guidance">Selecciona primero algún docente.</p>';
  };
  form?.querySelectorAll('[name="professionalIds"],[name="absenceMode"],'+
    '[name="fromDate"],[name="toDate"]').forEach(node=>
    node.addEventListener('change',updateMode));
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const selectedSlots={};
    for(const node of form.querySelectorAll('[data-planned-slot]:checked')){
      (selectedSlots[node.dataset.plannedFor]||=[]).push(node.value);
    }
    await onSave({
      professionalIds:data.getAll('professionalIds').map(String),
      fromDate:String(data.get('fromDate')||''),
      toDate:String(data.get('toDate')||''),
      startTime:String(data.get('startTime')||''),
      endTime:String(data.get('endTime')||''),
      mode:String(data.get('absenceMode')||'full'),
      selectedSlots,
      calculate:event.submitter?.value==='calculate'
    });
  });
  bindJointAbsencePanel(root,{onDate:onDay,onSolve:onCalculate});
  root.querySelector('[data-absence-prepare-joint]')?.addEventListener('click',()=>{
    onJoint(calendar.selectedDay);
    root.querySelector('[data-joint-absence-panel]')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  root.querySelector('[data-absence-prev]')?.addEventListener('click',()=>onMonth(-1));
  root.querySelector('[data-absence-next]')?.addEventListener('click',()=>onMonth(1));
  root.querySelector('[data-absence-filter]')?.addEventListener('change',e=>onFilter(e.target.value));
  root.querySelectorAll('[data-absence-day]').forEach(b=>
    b.addEventListener('click',()=>onDay(b.dataset.absenceDay)));
  root.querySelector('[data-absence-clear-day]')?.addEventListener('click',()=>onDay(''));
  root.querySelectorAll('[data-absence-resolve]').forEach(b=>
    b.addEventListener('click',()=>onStatus(b.dataset.absenceResolve,'resolved')));
  root.querySelectorAll('[data-absence-reopen]').forEach(b=>
    b.addEventListener('click',()=>onStatus(b.dataset.absenceReopen,'pending')));
  root.querySelectorAll('[data-absence-delete]').forEach(b=>
    b.addEventListener('click',()=>onDelete(b.dataset.absenceDelete)));
}
