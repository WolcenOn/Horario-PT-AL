// Read-only summary of simultaneous absence simulation. No change to local
// coverage status, teaching assignments or PT/AL timetable is performed here.
import {escapeHtml as esc} from './utils.js';
const caption=date=>date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
function statusText(status){
  return ({
    proposed:'Propuesta de cobertura para todas las clases',
    partial:'Cobertura parcial propuesta',
    uncovered:'Clases sin cubrir',
    unknown:'Revisión incompleta',
    'not-assessed':'Sin clases ordinarias evaluadas'
  })[status]||'Pendiente de comprobar';
}

export function renderJointAbsencePanel({
  date='',plan=null,assessment=null,result=null,status=null,state,adapter=null,
  connected=false,adapterReady=false
}){
  const professors=new Map((state?.professionals||[]).map(x=>[x.id,x.nombre||x.id]));
  const records=plan?.details||[];
  const groups=new Map((adapter?.configuration?.groups||[]).map(x=>[x.id,x.label||x.id]));
  const slots=new Map((adapter?.report?.slots||[]).map(x=>[x.id,x.label||x.id]));
  const substituted=new Map(Object.entries(adapter?.report?.mappings?.teachers||{})
    .map(([local,backend])=>[backend,professors.get(local)||local]));
  const classDetails=(assessment?.rows||[]).flatMap(row=>row.classDetails||[]);
  const calculate=Boolean(plan?.ready&&connected&&adapterReady);
  return '<section class="card operations-joint" data-joint-absence-panel>'+
    '<div class="card-header"><div><h2>Ausencias simultáneas del calendario</h2>'+
    '<small>GestorEscuela las evaluará juntas para no duplicar sustitutos. '+
    'La operación genera un borrador remoto, nunca aplica sustituciones.</small></div></div>'+
    '<div class="card-body">'+
    '<form data-joint-absence-date class="operations-joint-date">'+
    '<label>Fecha <input type="date" name="jointDate" value="'+esc(date)+'" required></label>'+
    '<button class="button" type="submit">Ver ausencias registradas</button>'+
    '</form>'+
    (plan?'<p data-joint-absence-count>Ausencias en la fecha: <strong>'+
      records.length+'</strong> · Clases ordinarias identificadas: <strong>'+
      plan.classCount+'</strong> · Franjas PT/AL: <strong>'+plan.supportCount+'</strong></p>'+
      (records.length?'<div class="table-wrap"><table data-joint-absence-table>'+
      '<thead><tr><th>Docente</th><th>Franjas afectadas</th><th>Clases</th>'+
      '<th>Apoyos PT/AL</th><th>Registro</th><th>Resultado del cálculo</th></tr></thead><tbody>'+
      records.map(row=>{
        const outcome=assessment?.rows?.find(item=>item.absenceId===row.absenceId);
        return '<tr data-joint-absence-row="'+esc(row.absenceId)+'"><th scope="row">'+
          esc(professors.get(row.professionalId)||'Docente no registrado')+'</th>'+
          '<td>'+row.slotCount+'</td><td>'+row.classCount+'</td>'+
          '<td>'+(row.supportCount?row.supportCount+' · pendiente de reorganizar':'0')+'</td>'+
          '<td>'+(row.manualStatus==='resolved'?'Confirmada manualmente':'Pendiente')+'</td>'+
          '<td>'+(outcome?esc(statusText(outcome.status))+
            ' · '+outcome.proposed+' con sustituto propuesto, '+outcome.uncovered+
            ' sin cubrir'+(outcome.unknown?', '+outcome.unknown+' sin verificar':''):
            'Sin cálculo')+'</td></tr>';
      }).join('')+'</tbody></table></div>':'')+
      (plan.errors.length?'<div class="integration-issues is-error" data-joint-blockers>'+
        '<strong>No se puede calcular aún</strong>'+
        plan.errors.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>':'')+
      (plan.supportCount?'<p data-joint-support-warning><strong>Apoyos PT/AL pendientes:</strong> '+
        'este solver no devuelve sustituciones verificadas de sesiones de apoyo. '+
        'Aunque todas las clases tengan sustituto, los apoyos necesitan revisión separada.</p>':'')+
      '<p class="integration-note">Al calcular, la configuración académica actual se '+
      'sincroniza con GestorEscuela, y el plan diario remoto queda actualizado con '+
      'la propuesta. Esto no escribe en IndexedDB ni confirma su aplicación. '+
      'Revisa todas las ausencias y las restricciones antes de continuar.</p>'+
      '<div class="button-row"><button class="button button-primary" type="button" '+
      'data-joint-absence-solve'+(calculate?'':' disabled')+'>'+
      'Calcular cobertura conjunta</button></div>':
      '<p>Selecciona una fecha para revisar las ausencias guardadas.</p>')+
    (status?'<div class="integration-status'+(status.kind==='error'?' is-error':
      status.kind==='ok'?' is-ok':'')+'" data-joint-status>'+
      esc(status.message||'')+'</div>':'')+
    (assessment?'<div data-joint-assessment><h3>Evaluación del borrador · '+
      esc(caption(date))+'</h3><p><strong>'+esc(statusText(assessment.status))+
      '</strong>: '+assessment.proposed+' clase(s) con sustituto propuesto, '+
      assessment.uncovered+' sin cubrir, '+assessment.unknown+' sin verificar.</p>'+
      (assessment.hasPendingSupports?'<p>Esta evaluación NO certifica los apoyos PT/AL.</p>':'')+
      (classDetails.length?'<div class="table-wrap"><table data-joint-coverage-details>'+
      '<thead><tr><th>Franja</th><th>Clase</th><th>Estado propuesto</th><th>Sustituto</th></tr></thead><tbody>'+
      classDetails.map(item=>'<tr><td>'+esc(slots.get(item.slotId)||item.slotId)+'</td>'+
        '<td>'+esc(groups.get(item.groupId)||item.groupId)+'</td>'+
        '<td>'+esc(item.status==='proposed'?'Con sustituto propuesto':
          item.status==='uncovered'?'Sin cubrir':'Sin verificar')+'</td>'+
        '<td>'+esc(substituted.get(item.substituteTeacherId)||
          item.substituteTeacherId||'—')+'</td></tr>').join('')+
      '</tbody></table></div>':'')+
      '<p><strong>Propuesta sin aplicar:</strong> ninguna ausencia cambia su estado manual automáticamente. '+
      'La confirmación de cobertura y la aplicación de sustituciones requieren revisión humana.</p>'+
      (assessment.anomalies?.length?'<p>No se pudo verificar la totalidad de la respuesta del motor.</p>':'')+
      '</div>':'')+
    '</div></section>';
}

export function bindJointAbsencePanel(root,{onDate,onSolve}){
  const node=root.querySelector('[data-joint-absence-panel]');
  node?.querySelector('[data-joint-absence-date]')?.addEventListener('submit',event=>{
    event.preventDefault();
    onDate(String(new FormData(event.currentTarget).get('jointDate')||''));
  });
  node?.querySelector('[data-joint-absence-solve]')?.addEventListener('click',()=>{
    onSolve();
  });
}
