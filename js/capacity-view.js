import { buildCapacityStudy, formatMinutes } from './capacity-analysis.js';
import { escapeHtml } from './utils.js';

export function renderCapacityStudy(root, { state, onOpenProfessionals, onOpenCenterPlanning }) {
  const study = buildCapacityStudy(state);
  const coverage = Math.round((study.totals.coverageRatio || 0) * 100);
  root.innerHTML = `<div class="capacity-study">
    <section class="card capacity-hero">
      <div>
        <p class="eyebrow">Fase 1 · antes de construir el horario</p>
        <h2>Estudio preliminar de plantilla</h2>
        <p>Comprueba si la carga curricular puede cubrirse con la plantilla actual, qué materias dependen de pocos docentes y si faltan candidatos naturales para las tutorías.</p>
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
      <div class="card-header"><div><h2>Capacidad por materia</h2><small>La capacidad potencial considera únicamente docentes habilitados para cada materia. Un mismo margen puede estar compartido entre varias materias; el reparto definitivo lo resolverá CP-SAT.</small></div></div>
      <div class="table-wrap"><table><thead><tr><th>Materia</th><th>Necesidad</th><th>Docentes habilitados</th><th>Capacidad potencial</th><th>Margen</th><th>Diagnóstico</th></tr></thead><tbody>
        ${study.subjects.map(row => `<tr>
          <td><strong>${escapeHtml(row.subject)}</strong></td>
          <td>${formatMinutes(row.requiredMinutes)}</td>
          <td>${row.eligibleTeachers}<small class="capacity-small">${row.eligibleTeacherNames.map(escapeHtml).join(', ') || '—'}</small></td>
          <td>${formatMinutes(row.eligibleCapacityMinutes)}</td>
          <td class="${row.marginMinutes < 0 ? 'capacity-negative' : ''}">${row.marginMinutes < 0 ? '−' : '+'}${formatMinutes(Math.abs(row.marginMinutes))}</td>
          <td>${statusBadge(row.status, row.dependency)}</td>
        </tr>`).join('') || `<tr><td colspan="6"><div class="empty-state"><strong>Sin currículo</strong>Configura primero las horas semanales en Plan del centro.</div></td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Capacidad por docente</h2><small>Capacidad semanal menos PT/AL directo y funciones configuradas. Las asignaciones clase–materia ya fijadas también descuentan carga.</small></div><button class="button" data-open-professionals type="button">Configurar profesorado</button></div>
      <div class="table-wrap"><table><thead><tr><th>Docente</th><th>Perfil</th><th>Tutoría</th><th>Capacidad</th><th>PT/AL + funciones</th><th>Docencia fijada</th><th>Libre para reparto</th><th>Materias permitidas</th></tr></thead><tbody>
        ${study.teachers.map(row => `<tr>
          <td><strong>${escapeHtml(row.name)}</strong><small class="capacity-small">${escapeHtml(row.specialty || 'Sin especialidad indicada')}</small></td>
          <td>${roleLabel(row.teacherRole)}</td>
          <td>${escapeHtml(row.tutorGroup || '—')}<small class="capacity-small">${tutorPreferenceLabel(row.tutorPreference)}</small></td>
          <td>${formatMinutes(row.capacityMinutes)}</td>
          <td>${formatMinutes(row.nonOrdinaryMinutes)}</td>
          <td>${formatMinutes(row.fixedOrdinaryMinutes)}</td>
          <td><strong>${formatMinutes(row.freeMinutes)}</strong></td>
          <td>${row.allowedSubjects.length}<small class="capacity-small">${row.allowedSubjects.slice(0,4).map(escapeHtml).join(', ')}${row.allowedSubjects.length > 4 ? '…' : ''}</small></td>
        </tr>`).join('') || `<tr><td colspan="8"><div class="empty-state"><strong>Sin docentes activos</strong>Añade la plantilla del centro para comenzar.</div></td></tr>`}
      </tbody></table></div>
    </section>

    <section class="card tutor-study">
      <div class="card-header"><div><h2>Tutorías</h2><small>Primera estimación. Todavía no asigna automáticamente una tutoría: detecta si, por capacidad y perfil, probablemente será necesario recurrir a especialistas.</small></div></div>
      <div class="capacity-metrics capacity-metrics-compact">
        ${metric('Tutorías necesarias', study.tutors.required)}
        ${metric('Ya fijadas', study.tutors.fixed)}
        ${metric('Pendientes', study.tutors.uncoveredClasses.length)}
        ${metric('Candidatos naturales', study.tutors.naturalCandidates.length)}
        ${metric('Especialistas necesarios', study.tutors.specialistTutorsNeeded, study.tutors.specialistTutorsNeeded ? 'is-warning' : 'is-ok')}
      </div>
      ${study.tutors.uncoveredClasses.length ? `<div class="capacity-note"><strong>Grupos sin tutor fijado</strong><span>${study.tutors.uncoveredClasses.map(escapeHtml).join(', ')}</span></div>` : ''}
      ${study.tutors.specialistCandidates.length ? `<div class="capacity-note"><strong>Especialistas candidatos si hicieran falta</strong><span>${study.tutors.specialistCandidates.slice(0,6).map(item => `${escapeHtml(item.name)} · ${formatMinutes(item.freeMinutes)} libres`).join(' · ')}</span></div>` : ''}
    </section>

    <section class="card capacity-next">
      <div class="card-header"><div><h2>Siguiente paso</h2><small>Cuando las horas y habilitaciones estén configuradas, esta misma información alimentará el solver de reparto docente.</small></div></div>
      <div class="card-body capacity-next-grid">
        <button class="button" data-open-center-planning type="button">1. Revisar currículo</button>
        <button class="button" data-open-professionals type="button">2. Revisar plantilla</button>
        <button class="button button-primary" type="button" disabled>3. Optimizar reparto docente · próximamente</button>
      </div>
    </section>
  </div>`;

  root.querySelectorAll('[data-open-professionals]').forEach(button => button.addEventListener('click', onOpenProfessionals));
  root.querySelector('[data-open-center-planning]')?.addEventListener('click', onOpenCenterPlanning);
  return study;
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
