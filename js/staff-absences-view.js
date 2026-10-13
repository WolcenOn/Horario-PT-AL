// Local calendar: coverage is declared manually, never certified by the solver.
import {buildAbsenceCalendar} from './staff-absences.js';
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
  state,month,filter='all',selectedDay='',onMonth,onFilter,onDay,onSave,onStatus,onDelete
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
    '<section class="card"><div class="card-header"><div><h2>Registrar ausencias simultáneas</h2>'+
    '<small>Selecciona varios docentes. Cada registro se puede revisar independientemente.</small></div></div>'+
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
    '<label>Hora inicio (opcional) <input type="time" name="startTime" step="900"></label>'+
    '<label>Hora fin (opcional) <input type="time" name="endTime" step="900"></label>'+
    '</div><p class="absence-guidance">Deja las horas vacías para jornada completa. No se repite semanalmente.</p>'+
    '<div class="button-row"><button class="button button-primary" type="submit"'+
    (professionals.length?'':' disabled')+'>Guardar ausencias</button></div>'+
    '</form></section>'+
    '<section class="card"><div class="card-header"><div><h2>Vista mensual y estado de cobertura</h2>'+
    '<small>Selecciona un día para ver sus ausencias o filtra las pendientes.</small></div></div>'+
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
    '<div class="absence-list-header"><h3>'+
    (calendar.selectedDay?'Ausencias del '+caption(calendar.selectedDay):'Registros del mes')+'</h3>'+
    (calendar.selectedDay?'<button type="button" class="button" data-absence-clear-day>Ver todo el mes</button>':'')+
    '</div><div class="absence-entries" data-absence-entries>'+
    (entries.length?entries.map(row=>absenceMarkup(row,calendar.days)).join(''):
      '<div class="empty-state">No hay ausencias para esta selección.</div>')+
    '</div></div></section>'+
    '<section class="card"><div class="card-body"><h3>Próximo paso: sustituciones conjuntas</h3>'+
    '<p>Este registro no genera ni aprueba sustituciones. La Operativa diaria actual calcula un docente por petición. Un resultado del solver no marca ausencias como resueltas automáticamente.</p>'+
    '</div></section></div>';

  root.querySelector('#staffAbsenceForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    await onSave({
      professionalIds:data.getAll('professionalIds').map(String),
      fromDate:String(data.get('fromDate')||''),toDate:String(data.get('toDate')||''),
      startTime:String(data.get('startTime')||''),endTime:String(data.get('endTime')||'')
    });
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
