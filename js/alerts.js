import { escapeHtml } from './utils.js';

const LABELS={
  'student-overlap':'Solapamiento de alumno',
  'professional-overlap':'Solapamiento de profesional',
  'student-restriction':'Restricción del alumno',
  'professional-availability':'Disponibilidad profesional',
  'service-mismatch':'Incompatibilidad PT/AL',
  'integrity':'Integridad de datos',
  'invalid-time':'Horario no válido',
  'professional-max-hours':'Carga semanal del profesional'
};

export function renderAlerts(root,{conflicts}){
  root.onclick = null;
  const items=conflicts.map(c=>`<article class="alert-item"><div class="alert-icon" aria-hidden="true">⚠️</div><div><h3>${escapeHtml(LABELS[c.type]||'Conflicto')}</h3><p>${escapeHtml(c.message)}</p><div class="status-line" style="margin-top:8px"><span class="badge badge-${c.severity==='grave'?'danger':'warning'}">${c.severity==='grave'?'Grave':'Aviso'}</span></div></div></article>`).join('');
  root.innerHTML=`<section class="card"><div class="card-header"><div><h2>Resumen de conflictos</h2><small>Se recalculan automáticamente tras cada cambio.</small></div><span class="badge ${conflicts.length?'badge-danger':'badge-success'}">${conflicts.length}</span></div><div class="card-body"><div class="alert-list">${items||`<div class="empty-state"><strong>No se han detectado conflictos</strong>Las sesiones actuales no presentan solapamientos ni advertencias de disponibilidad.</div>`}</div></div></section>`;
}
