import { backendConfigured } from './backend-service.js';
import { escapeHtml } from './utils.js';

export function renderOperationsView(root, { state, settings, adapter, status, result, onSolve }) {
  const configured = backendConfigured(settings);
  const ready = configured && adapter.report.ready;
  const activeProfessionals = (state.professionals || []).filter(item => item.activo !== false);
  const defaultDate = localDateISO(new Date());

  root.innerHTML = `<div class="operations-view">
    <section class="card integration-hero">
      <div>
        <p class="eyebrow">Operativa diaria</p>
        <h2>Ausencias y sustituciones</h2>
        <p>Selecciona un docente y las franjas de ausencia. Al calcular, se sincroniza primero la configuración académica actual y GestorEscuela resuelve la cobertura global del día.</p>
      </div>
      <span class="integration-mode ${configured ? 'is-hybrid' : 'is-offline'}">${configured ? 'Backend conectado' : 'Requiere conexión'}</span>
    </section>

    ${!configured ? `<section class="card"><div class="empty-state"><strong>Falta configurar GestorEscuela</strong>Activa la conexión, URL, School ID y Actor ID desde el menú “GestorEscuela”.</div></section>` : ''}
    ${adapter.report.errors.length ? `<section class="card"><div class="integration-issues is-error"><strong>El horario todavía no se puede enviar al solver</strong>${adapter.report.errors.slice(0,10).map(item => `<span>• ${escapeHtml(item)}</span>`).join('')}</div></section>` : ''}

    <section class="card">
      <div class="card-header"><div><h2>Registrar ausencia</h2><small>Primera versión: un docente por cálculo. Después ampliaremos a varias ausencias simultáneas.</small></div></div>
      <form id="absenceSolveForm" class="card-body operations-form">
        <div class="form-grid">
          <div class="form-field"><label for="absenceDate">Fecha</label><input id="absenceDate" name="date" type="date" value="${defaultDate}" required></div>
          <div class="form-field integration-wide"><label for="absenceProfessional">Docente ausente</label><select id="absenceProfessional" name="professionalId" required><option value="">Selecciona…</option>${activeProfessionals.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.nombre || item.id)} · ${escapeHtml(item.tipo || 'Docente')}</option>`).join('')}</select></div>
        </div>
        <fieldset class="operations-slots"><legend>Franjas afectadas</legend><div class="operations-slot-grid">${adapter.report.slots.map(slot => `<label><input type="checkbox" name="slotId" value="${escapeHtml(slot.id)}"><span><strong>${escapeHtml(slot.label)}</strong><small>${escapeHtml(slot.id)}</small></span></label>`).join('') || '<span class="muted">No hay franjas disponibles.</span>'}</div></fieldset>
        <div class="integration-note"><strong>Antes de resolver</strong><span>La configuración remota del centro se actualizará con la fotografía local actual. IndexedDB seguirá siendo la fuente local y no se modifica con el resultado.</span></div>
        <div class="button-row"><button class="button button-primary" type="submit" ${ready ? '' : 'disabled'}>⚡ Calcular sustituciones</button></div>
        ${renderStatus(status)}
      </form>
    </section>

    ${result ? renderResult(result, state, adapter) : `<section class="card"><div class="empty-state"><strong>Sin cálculo todavía</strong>El resultado del solver aparecerá aquí con cobertura, sustituto y alternativas.</div></section>`}
  </div>`;

  root.querySelector('#absenceSolveForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const slotIds = data.getAll('slotId').map(String);
    if (!slotIds.length) {
      alert('Selecciona al menos una franja de ausencia.');
      return;
    }
    await onSolve({
      date:String(data.get('date') || ''),
      professionalId:String(data.get('professionalId') || ''),
      slotIds
    });
  });
}

function renderStatus(status) {
  if (!status) return '<div class="integration-status">Preparado para calcular cuando configures una ausencia.</div>';
  if (status.kind === 'pending') return `<div class="integration-status"><strong>Calculando…</strong><span>${escapeHtml(status.message || '')}</span></div>`;
  if (status.kind === 'ok') return `<div class="integration-status is-ok"><strong>✓ Cálculo completado</strong><span>${escapeHtml(status.message || '')}</span></div>`;
  return `<div class="integration-status is-error"><strong>⚠ No se pudo completar</strong><span>${escapeHtml(status.message || '')}</span></div>`;
}

function renderResult(result, state, adapter) {
  const solution = result?.payload?.solution || result?.solution || {};
  const substitutions = solution.substitutions || [];
  const uncovered = solution.uncovered || [];
  const assessments = solution.candidate_assessments || [];
  const coverage = Math.round((Number(solution.coverage_ratio) || 0) * 100);
  const names = teacherNames(state, adapter);
  const groupNames = new Map((adapter.configuration.groups || []).map(group => [group.id, group.label]));
  const slotNames = new Map((adapter.report.slots || []).map(slot => [slot.id, slot.label]));

  return `<section class="card operations-result">
    <div class="card-header"><div><h2>Propuesta del solver</h2><small>Plan ${escapeHtml(String(result.id || ''))} · versión ${Number(result.version) || '—'} · estado ${escapeHtml(result.status || '—')}</small></div></div>
    <div class="card-body">
      <div class="integration-metrics operations-result-metrics">
        ${metric('Cobertura', `${coverage}%`)}
        ${metric('Puntuación', solution.score ?? '—')}
        ${metric('Sustituciones', substitutions.length)}
        ${metric('Sin cubrir', uncovered.length)}
      </div>
      <div class="table-wrap"><table><thead><tr><th>Franja</th><th>Grupo</th><th>Ausente</th><th>Sustituto</th><th>Coste</th></tr></thead><tbody>${substitutions.map(item => `<tr><td>${escapeHtml(slotNames.get(item.slot_id) || item.slot_id)}</td><td>${escapeHtml(groupNames.get(item.group_id) || item.group_id)}</td><td>${escapeHtml(names.get(item.absent_teacher_id) || item.absent_teacher_id)}</td><td><strong>${escapeHtml(names.get(item.substitute_teacher_id) || item.substitute_teacher_id)}</strong></td><td>${Number(item.penalty) || 0}</td></tr>`).join('') || '<tr><td colspan="5">No se requieren sustituciones en las franjas seleccionadas.</td></tr>'}</tbody></table></div>
      ${uncovered.length ? `<div class="integration-issues is-error"><strong>Clases sin cubrir</strong>${uncovered.map(item => `<span>• ${escapeHtml(slotNames.get(item.slot_id) || item.slot_id)} · ${escapeHtml(groupNames.get(item.group_id) || item.group_id)}: ${escapeHtml(item.reason || 'Sin cobertura compatible')}</span>`).join('')}</div>` : ''}
      ${assessments.length ? `<details class="integration-details"><summary>Ver valoración de ${assessments.length} candidato(s)</summary><div class="table-wrap"><table><thead><tr><th>Docente</th><th>Franja</th><th>Estado</th><th>Penalización</th><th>Motivo</th></tr></thead><tbody>${assessments.slice(0,60).map(item => `<tr><td>${escapeHtml(names.get(item.teacher_id) || item.teacher_id)}</td><td>${escapeHtml(slotNames.get(item.slot_id) || item.slot_id)}</td><td>${escapeHtml(item.status || '')}</td><td>${item.penalty ?? '—'}</td><td>${escapeHtml(item.detail || item.rejection_reason || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
    </div>
  </section>`;
}

function teacherNames(state, adapter) {
  const map = new Map();
  const backendIds = adapter.report.mappings.teachers || {};
  for (const professional of state.professionals || []) {
    const backendId = backendIds[professional.id];
    if (backendId) map.set(backendId, professional.nombre || professional.id);
  }
  return map;
}

function metric(label, value) {
  return `<div class="integration-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function localDateISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
