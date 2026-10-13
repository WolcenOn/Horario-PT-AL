// Read-only summary of simultaneous absence simulation. No change to local
// coverage status, teaching assignments or PT/AL timetable is performed here.
import {escapeHtml as esc} from './utils.js';
const caption=date=>date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4);
function statusText(status){
  return ({
    proposed:'Propuesta de cobertura para las sesiones identificadas',
    partial:'Cobertura parcial propuesta',
    uncovered:'Sesiones sin cubrir',
    unknown:'Revisión incompleta',
    'not-assessed':'Sin sesiones evaluadas'
  })[status]||'Pendiente de comprobar';
}

export function renderJointAbsencePanel({
  date='',plan=null,assessment=null,result=null,status=null,state,adapter=null,
  connected=false,adapterReady=false,embedded=false
}){
  const professors=new Map((state?.professionals||[]).map(x=>[x.id,x.nombre||x.id]));
  const records=plan?.details||[];
  const groups=new Map((adapter?.configuration?.groups||[]).map(x=>[x.id,x.label||x.id]));
  const slots=new Map((adapter?.report?.slots||[]).map(x=>[x.id,x.label||x.id]));
  const substituted=new Map(Object.entries(adapter?.report?.mappings?.teachers||{})
    .map(([local,backend])=>[backend,professors.get(local)||local]));
  const coverageDetails=(assessment?.rows||[]).flatMap(row=>[
    ...(row.classDetails||[]),...(row.supportDetails||[])]);
  const sessionAudit=assessment?.sessionAudit;
  const sessions=sessionAudit?.entries||[];
  const sessionStatus=value=>({
    continuous:'Un mismo especialista propuesto',
    fragmented:'Sesión fragmentada',
    uncovered:'Sesión con minutos sin cubrir',
    unknown:'Sin cobertura completa verificable'
  })[value]||'Revisión pendiente';
  const reviewStatus=value=>({
    structural:'Estructura comprobada; pendiente de aprobación',
    needsReview:'Faltan datos para comprobar todas las restricciones',
    conflict:'Conflictos o restricciones comprobadas'
  })[value]||'Sin evaluar';
  const calculate=Boolean(plan?.ready&&connected&&adapterReady);
  return '<section class="card operations-joint" data-joint-absence-panel>'+
    '<div class="card-header"><div><h2>3. Revisar y calcular la cobertura conjunta</h2>'+
    '<small>GestorEscuela las evaluará juntas para no duplicar sustitutos. '+
    'La operación genera un borrador remoto, nunca aplica sustituciones.</small></div></div>'+
    '<div class="card-body">'+
    (embedded?'':'<form data-joint-absence-date class="operations-joint-date">'+
    '<label>Fecha <input type="date" name="jointDate" value="'+esc(date)+'" required></label>'+
    '<button class="button" type="submit">Ver ausencias registradas</button>'+
    '</form>')+
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
          '<td>'+(outcome?
            (outcome.supportProposed+' propuestas, '+outcome.supportUncovered+
              ' sin cubrir, '+outcome.supportUnknown+' sin verificar'):
            (row.supportCount?row.supportCount+' · por comprobar':'0'))+'</td>'+
          '<td>'+(row.manualStatus==='resolved'?'Confirmada manualmente':'Pendiente')+'</td>'+
          '<td>'+(outcome?esc(statusText(outcome.status))+
            ' · '+outcome.proposed+' con sustituto propuesto, '+outcome.uncovered+
            ' sin cubrir'+(outcome.unknown?', '+outcome.unknown+' sin verificar':''):
            'Sin cálculo')+'</td></tr>';
      }).join('')+'</tbody></table></div>':'')+
      (plan.errors.length?'<div class="integration-issues is-error" data-joint-blockers>'+
        '<strong>No se puede calcular aún</strong>'+
        plan.errors.map(x=>'<span>• '+esc(x)+'</span>').join('')+'</div>':'')+
      (plan.supportCount?'<p data-joint-support-warning><strong>Atención a PT/AL:</strong> '+
        'el motor diario actualizado puede proponer sustitutos especialistas. '+
        'Si la versión conectada es anterior, las sesiones omitidas quedan SIN VERIFICAR. '+
        'Incluso con sustituto propuesto hace falta revisar asistencia individual, '+
        'agrupamientos y aplicación real; ninguna ausencia se confirma automáticamente.</p>':'')+
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
      '</strong>: '+assessment.classProposed+' clase(s) con sustituto propuesto, '+
      assessment.classUncovered+' sin cubrir, '+assessment.classUnknown+
      ' sin verificar; PT/AL: '+assessment.supportProposed+' con especialista propuesto, '+
      assessment.supportUncovered+' sin cubrir, '+assessment.supportUnknown+
      ' sin verificar.</p>'+
      (assessment.hasSupportNeeds?'<p>Esta evaluación NO certifica los apoyos PT/AL '+
        'como aplicados, ni comprueba cobertura individual de todos sus participantes.</p>':'')+
      (sessionAudit?.available?'<section data-joint-session-audit>'+
      '<h4>Sesiones PT/AL completas · comprobación local</h4>'+
      '<p>Sesiones afectadas: '+sessionAudit.summary.total+
        ' · mismo especialista en todas las franjas: '+
        sessionAudit.summary.continuous+' · fragmentadas: '+
        sessionAudit.summary.fragmented+' · sin cubrir: '+
        sessionAudit.summary.uncovered+' · indeterminadas: '+
        sessionAudit.summary.unknown+'.</p>'+
      (sessions.length?'<div class="table-wrap"><table data-joint-session-table>'+
      '<thead><tr><th>Servicio y horario</th><th>Continuidad</th>'+
      '<th>Recursos y agrupamiento</th><th>Extracción, trayectos y revisión</th></tr></thead><tbody>'+
      sessions.map(row=>'<tr data-joint-session-status="'+esc(row.status)+'">'+
        '<th scope="row">'+esc(row.kind)+' · '+esc(row.start)+'–'+esc(row.end)+
        ' · '+row.slotCount+' franja(s)</th>'+
        '<td>'+esc(sessionStatus(row.status))+'</td>'+
        '<td>'+esc(reviewStatus(row.reviewStatus))+' · '+
        (row.roomId?'Sala '+esc(row.roomId):'Sin sala registrada')+' · '+
        (row.participantCount===null?'Asistentes desconocidos':
          row.participantCount+' asistente(s)')+
        (row.mixedClassCount>1?' · '+row.mixedClassCount+' clases de origen':'')+'</td>'+
        '<td>'+(row.issues.length?
          '<ul>'+row.issues.map(issue=>'<li>'+esc(issue.message)+'</li>').join('')+'</ul>':
          'Sin conflicto estructural detectado; falta confirmar atención individual.')+
        '</td></tr>').join('')+'</tbody></table></div>':
        '<p>Sin sesiones PT/AL identificadas para auditar.</p>')+
      '<p>'+esc(sessionAudit.note)+'</p></section>':
      '<p data-joint-session-unavailable>No hay metadatos locales suficientes para verificar '+
      'la continuidad de las sesiones originales. Las franjas individuales '+
      'no certifican una sesión completa.</p>')+
      (coverageDetails.length?'<div class="table-wrap"><table data-joint-coverage-details>'+
      '<thead><tr><th>Tipo</th><th>Franja</th><th>Clase / agrupamiento</th><th>Estado propuesto</th><th>Sustituto</th></tr></thead><tbody>'+
      coverageDetails.map(item=>'<tr>'+
        '<td>'+esc(item.kind==='CLASS'?'Materia':item.kind==='PT'?'Apoyo PT':'Apoyo AL')+'</td>'+
        '<td>'+esc(slots.get(item.slotId)||item.slotId)+'</td>'+
        '<td>'+esc(item.groupId?(groups.get(item.groupId)||item.groupId):
          'Apoyo sin grupo único')+'</td>'+
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
