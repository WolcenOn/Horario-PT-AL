import { buildCapacityStudy, formatMinutes } from './capacity-analysis.js';
import { escapeHtml } from './utils.js';

export function renderCapacityStudy(root, {
  state,
  backendReady = false,
  optimizerStatus = null,
  optimizerResult = null,
  onOpenProfessionals,
  onOpenCenterPlanning,
  onOptimize,
  onApply
}) {
  const study = buildCapacityStudy(state);
  const coverage = Math.round((study.totals.coverageRatio || 0) * 100);
  root.innerHTML = `<div class="capacity-study">
    <section class="card capacity-hero">
      <div>
        <p class="eyebrow">Fase 1 · antes de construir el horario</p>
        <h2>Estudio preliminar de plantilla</h2>
        <p>Comprueba si la carga curricular puede cubrirse con la plantilla actual, qué materias dependen de pocos docentes, cuánta carga puede asumir realmente cada especialidad y si faltan candidatos naturales para las tutorías.</p>
      </div>
      <span class="capacity-state ${study.ready ? 'is-ok' : 'is-warning'}">${study.ready ? 'Base viable' : 'Revisar configuración'}</span>
    </section>

    <section class="capacity-metrics">
      ${metric('Grupos', study.totals.classes)}
      ${metric('Profesorado activo', study.totals.teachers)}
      ${metric('Docencia necesaria', formatMinutes(study.totals.requiredMinutes))}
      ${metric('Capacidad computable', formatMinutes(study.totals.capacityMinutes))}
      ${metric('Cobertura compatible', `${coverage}%`)}
      ${metric('Sin capacidad', formatMinutes(study.totals.uncoveredMinutes), study.totals.uncoveredMinutes ? 'is-danger' : 'is-ok')}
    </section>

    ${renderIssues(study.issues)}

    <section class="card">
      <div class="card-header"><div><h2>Capacidad por materia</h2><small>Se distingue entre docentes simplemente habilitados y especialistas principales. El margen especialista ayuda a detectar cuándo habrá que usar capacidad generalista o revisar tutorías y cargas.</small></div></div>
      <div class="table-wrap"><table><thead><tr><th>Materia</th><th>Necesidad</th><th>Especialistas</th><th>Capacidad especialista</th><th>Docentes habilitados</th><th>Capacidad total</th><th>Margen total</th><th>Diagnóstico</th></tr></thead><tbody>
        ${study.subjects.map(row => `<tr>
          <td><strong>${escapeHtml(row.subject)}</strong></td>
          <td>${formatMinutes(row.requiredMinutes)}</td>
          <td>${row.specialistTeachers}<small class="capacity-small">${row.specialistTeacherNames.map(escapeHtml).join(', ') || '—'}</small></td>
          <td class="${row.specialistTeachers && row.specialistMarginMinutes < 0 ? 'capacity-negative' : ''}">${row.specialistTeachers ? `${formatMinutes(row.specialistCapacityMinutes)}<small class="capacity-small">${row.specialistMarginMinutes < 0 ? `faltan ${formatMinutes(Math.abs(row.specialistMarginMinutes))}` : `margen +${formatMinutes(row.specialistMarginMinutes)}`}</small>` : '—'}</td>
          <td>${row.eligibleTeachers}<small class="capacity-small">${row.eligibleTeacherNames.map(escapeHtml).join(', ') || '—'}</small></td>
          <td>${formatMinutes(row.eligibleCapacityMinutes)}</td>
          <td class="${row.marginMinutes < 0 ? 'capacity-negative' : ''}">${row.marginMinutes < 0 ? '−' : '+'}${formatMinutes(Math.abs(row.marginMinutes))}</td>
          <td>${statusBadge(row.status, row.dependency)}</td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty-state"><strong>Sin currículo</strong>Configura primero las horas semanales en Plan del centro.</div></td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Capacidad por docente</h2><small>Capacidad semanal menos PT/AL directo y funciones configuradas. Las asignaciones clase–materia ya fijadas también descuentan carga.</small></div><button class="button" data-open-professionals type="button">Configurar profesorado</button></div>
      <div class="table-wrap"><table><thead><tr><th>Docente</th><th>Perfil</th><th>Tutoría</th><th>Capacidad</th><th>PT/AL + funciones</th><th>Docencia fijada</th><th>Libre para reparto</th><th>Especialidad principal</th><th>Materias permitidas</th></tr></thead><tbody>
        ${study.teachers.map(row => `<tr>
          <td><strong>${escapeHtml(row.name)}</strong><small class="capacity-small">${escapeHtml(row.specialty || 'Sin especialidad indicada')}</small></td>
          <td>${roleLabel(row.teacherRole)}</td>
          <td>${escapeHtml(row.tutorGroup || '—')}<small class="capacity-small">${tutorPreferenceLabel(row.tutorPreference)}</small></td>
          <td>${formatMinutes(row.capacityMinutes)}</td>
          <td>${formatMinutes(row.nonOrdinaryMinutes)}</td>
          <td>${formatMinutes(row.fixedOrdinaryMinutes)}</td>
          <td><strong>${formatMinutes(row.freeMinutes)}</strong></td>
          <td>${row.specialtySubjects.length}<small class="capacity-small">${row.specialtySubjects.slice(0,4).map(escapeHtml).join(', ') || '—'}${row.specialtySubjects.length > 4 ? '…' : ''}</small></td>
          <td>${row.allowedSubjects.length}<small class="capacity-small">${row.allowedSubjects.slice(0,4).map(escapeHtml).join(', ')}${row.allowedSubjects.length > 4 ? '…' : ''}</small></td>
        </tr>`).join('') || `<tr><td colspan="9"><div class="empty-state"><strong>Sin docentes activos</strong>Añade la plantilla del centro para comenzar.</div></td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card tutor-study">
      <div class="card-header"><div><h2>Tutorías</h2><small>Primera estimación. Detecta si, por capacidad y perfil, probablemente será necesario recurrir a especialistas.</small></div></div>
      <div class="capacity-metrics capacity-metrics-compact">
        ${metric('Tutorías necesarias', study.tutors.required)}
        ${metric('Ya fijadas', study.tutors.fixed)}
        ${metric('Pendientes', study.tutors.uncoveredClasses.length)}
        ${metric('Candidatos naturales', study.tutors.naturalCandidates.length)}
        ${metric('Especialistas necesarios', study.tutors.specialistTutorsNeeded, study.tutors.specialistTutorsNeeded ? 'is-warning' : 'is-ok')}
      </div>
      ${study.tutors.uncoveredClasses.length ? `<div class="capacity-note"><strong>Grupos sin tutor fijado</strong><span>${study.tutors.uncoveredClasses.map(escapeHtml).join(', ')}</span></div>` : ''}
      ${study.tutors.specialistCandidates.length ? `<div class="capacity-note"><strong>Especialistas candidatos si hicieran falta</strong><span>${study.tutors.specialistCandidates.slice(0,6).map(item => `${escapeHtml(item.name)} · ${formatMinutes(item.freeMinutes)} libres${item.specialtySubjects?.length ? ` · ${item.specialtySubjects.map(escapeHtml).join(', ')}` : ''}`).join(' · ')}</span></div>` : ''}
    </section>

    <section class="card staffing-solver-card">
      <div class="card-header"><div><h2>Propuesta de reparto docente · CP-SAT</h2><small>Decide quién cubre cada grupo/materia y propone tutorías, pero todavía no decide días ni horas. Penaliza especialistas como tutores, fragmentación y movimientos entre grupos.</small></div><span class="badge ${backendReady ? 'badge-success' : 'badge-warning'}">${backendReady ? 'Servidor conectado' : 'GestorEscuela no vinculado'}</span></div>
      <div class="card-body">
        <div class="capacity-note"><strong>Qué conserva y prioriza</strong><span>Las tutorías y asignaciones clase–materia que ya hayas fijado se consideran decisiones bloqueadas. Las materias solo pueden ir a docentes habilitados y, cuando existe una especialidad principal, el solver intenta reservar esa carga para sus especialistas antes de recurrir a otros docentes compatibles.</span></div>
        <div class="button-row">
          <button class="button button-primary" data-optimize-staffing type="button" ${backendReady && study.teachers.length && study.classes.length ? '' : 'disabled'}>${optimizerStatus?.kind === 'pending' ? 'Calculando…' : 'Optimizar reparto docente'}</button>
          <span class="field-hint">El cálculo es reversible y no modifica tus datos hasta que confirmes “Aplicar reparto”.</span>
        </div>
        ${renderOptimizerStatus(optimizerStatus)}
        ${renderOptimizerResult(optimizerResult, study)}
        ${optimizerResult?.complete ? `<div class="button-row staffing-apply-row"><button class="button button-primary" data-apply-staffing type="button">✓ Aplicar reparto como base</button><span class="field-hint">Guarda tutorías y asignaciones grupo–materia en los perfiles docentes. No coloca todavía ninguna sesión en el calendario.</span></div>` : ''}
      </div>
    </section>

    <section class="card capacity-next">
      <div class="card-header"><div><h2>Flujo de trabajo</h2><small>Primero cerramos reparto y tutorías; después construiremos la cuadrícula semanal.</small></div></div>
      <div class="card-body capacity-next-grid">
        <button class="button" data-open-center-planning type="button">1. Revisar currículo</button>
        <button class="button" data-open-professionals type="button">2. Revisar plantilla</button>
        <button class="button button-primary" data-optimize-staffing type="button" ${backendReady && study.teachers.length && study.classes.length ? '' : 'disabled'}>3. Optimizar reparto</button>
      </div>
    </section>
  </div>`;

  root.querySelectorAll('[data-open-professionals]').forEach(button => button.addEventListener('click', onOpenProfessionals));
  root.querySelector('[data-open-center-planning]')?.addEventListener('click', onOpenCenterPlanning);
  root.querySelectorAll('[data-optimize-staffing]').forEach(button => button.addEventListener('click', onOptimize));
  root.querySelector('[data-apply-staffing]')?.addEventListener('click', onApply);
  return study;
}

function renderOptimizerStatus(status) {
  if (!status) return '';
  const className = status.kind === 'ok' ? 'is-ok' : status.kind === 'error' ? 'is-error' : 'is-warning';
  return `<div class="capacity-banner ${className}"><strong>${status.kind === 'pending' ? 'Calculando' : status.kind === 'ok' ? '✓ Propuesta calculada' : status.kind === 'error' ? '⚠ Error del optimizador' : '△ Propuesta parcial'}</strong><span>${escapeHtml(status.message || '')}</span></div>`;
}

function renderOptimizerResult(result, study) {
  if (!result) return '';
  const teacherNames = new Map(study.teachers.map(item => [item.id, item.name]));
  const tutorRows = (result.tutors || []).map(item => `<tr><td>${escapeHtml(item.group_id)}</td><td><strong>${escapeHtml(teacherNames.get(item.teacher_id) || item.teacher_id)}</strong></td></tr>`).join('');
  const assignments = (result.assignments || []).slice().sort((a,b) => a.group_id.localeCompare(b.group_id, 'es', {numeric:true}) || a.subject.localeCompare(b.subject,'es'));
  const assignmentRows = assignments.map(item => `<tr><td>${escapeHtml(item.group_id)}</td><td>${escapeHtml(item.subject)}</td><td>${formatMinutes(item.minutes)}</td><td><strong>${escapeHtml(teacherNames.get(item.teacher_id) || item.teacher_id)}</strong></td></tr>`).join('');
  const loadRows = (result.teacher_loads || []).map(item => `<tr><td>${escapeHtml(teacherNames.get(item.teacher_id) || item.teacher_id)}</td><td>${formatMinutes(item.assigned_minutes)}</td><td>${formatMinutes(item.remaining_minutes)}</td><td>${item.groups_taught}</td><td>${escapeHtml(item.tutor_group || '—')}</td></tr>`).join('');
  return `<div class="staffing-result">
    <div class="capacity-metrics capacity-metrics-compact">
      ${metric('Asignaciones', assignments.length)}
      ${metric('Tutorías propuestas', (result.tutors || []).length)}
      ${metric('Necesidades sin cubrir', (result.uncovered_requirement_ids || []).length, (result.uncovered_requirement_ids || []).length ? 'is-danger' : 'is-ok')}
      ${metric('Tutorías sin cubrir', (result.uncovered_tutor_groups || []).length, (result.uncovered_tutor_groups || []).length ? 'is-danger' : 'is-ok')}
      ${metric('Tiempo solver', `${Number(result.wall_time_seconds || 0).toFixed(2)} s`)}
    </div>
    <details open><summary><strong>Tutorías propuestas</strong></summary><div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Tutor/a</th></tr></thead><tbody>${tutorRows || '<tr><td colspan="2">Sin propuesta</td></tr>'}</tbody></table></div></details>
    <details><summary><strong>Reparto de materias</strong></summary><div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Materia</th><th>Carga</th><th>Docente</th></tr></thead><tbody>${assignmentRows || '<tr><td colspan="4">Sin asignaciones</td></tr>'}</tbody></table></div></details>
    <details><summary><strong>Carga resultante por docente</strong></summary><div class="table-wrap"><table><thead><tr><th>Docente</th><th>Asignado</th><th>Margen restante</th><th>Grupos</th><th>Tutoría</th></tr></thead><tbody>${loadRows || '<tr><td colspan="5">Sin datos</td></tr>'}</tbody></table></div></details>
    ${(result.uncovered_requirement_ids || []).length ? `<div class="capacity-banner is-error"><strong>Necesidades sin cubrir</strong><span>${result.uncovered_requirement_ids.map(escapeHtml).join(', ')}</span></div>` : ''}
    ${(result.uncovered_tutor_groups || []).length ? `<div class="capacity-banner is-warning"><strong>Tutorías sin cubrir</strong><span>${result.uncovered_tutor_groups.map(escapeHtml).join(', ')}</span></div>` : ''}
  </div>`;
}

function metric(label, value, className = '') {
  return `<div class="capacity-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderIssues(issues) {
  if (!issues.length) return `<section class="capacity-banner is-ok"><strong>✓ No se detectan déficits básicos</strong><span>La viabilidad fina dependerá del reparto por grupo, tutorías y restricciones horarias.</span></section>`;
  const errors = issues.filter(item => item.severity === 'error');
  const warnings = issues.filter(item => item.severity !== 'error');
  return `<section class="capacity-banner ${errors.length ? 'is-error' : 'is-warning'}"><strong>${errors.length ? `⚠ ${errors.length} problema(s) que impiden una cobertura completa` : `△ ${warnings.length} aviso(s) para revisar`}</strong><div>${issues.slice(0,10).map(item => `<span>• ${escapeHtml(item.message)}</span>`).join('')}</div></section>`;
}

function statusBadge(status, dependency) {
  if (status === 'deficit') return '<span class="badge badge-warning">Déficit</span>';
  if (status === 'tight') return '<span class="badge badge-warning">Ajustado</span>';
  if (status === 'critical' || dependency) return '<span class="badge badge-neutral">Dependencia crítica</span>';
  return '<span class="badge badge-success">Holgado</span>';
}

function roleLabel(value) {
  return ({ generalista:'Generalista', especialista:'Especialista', mixto:'Mixto' })[value] || '—';
}

function tutorPreferenceLabel(value) {
  return ({ preferente:'Preferente', disponible:'Puede ser tutor/a', evitar:'Evitar tutoría', no:'No tutoría' })[value] || '';
}
