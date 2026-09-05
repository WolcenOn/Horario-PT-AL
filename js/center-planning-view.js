import { COURSE_OPTIONS, configuredClassGroups, schoolStructureConfigured } from './education.js';
import { curriculumCoverage, curriculumForCourse, curriculumSubjectsForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile, PLANNING_MODES, RESPONSIBILITY_TYPES } from './center-planning.js';
import { buildGlobalReadiness } from './global-scheduler.js';
import { escapeHtml, formatDuration } from './utils.js';

export function renderCenterPlanning(root, { state, centerPlanningSettings, globalProposal, onSave, onNavigate, onGenerateGlobal, onApplyGlobal, onDiscardGlobal }) {
  const settings = normalizeCenterPlanningSettings(centerPlanningSettings);
  const structureReady = schoolStructureConfigured(state.schoolSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const coverage = curriculumCoverage(state, settings);
  const curriculumCourses = COURSE_OPTIONS;
  const readiness = buildGlobalReadiness(state, settings);

  root.innerHTML = `<form id="centerPlanningForm" class="center-planning-view">
    <section class="card center-mode-card">
      <div class="card-header">
        <div><h2>Alcance de la planificación</h2><small>El modo global amplía la aplicación sin desactivar el funcionamiento PT/AL.</small></div>
        <span class="badge ${settings.mode === 'global' ? 'badge-success' : 'badge-neutral'}">${settings.mode === 'global' ? 'Centro completo' : 'Solo PT / AL'}</span>
      </div>
      <div class="card-body center-mode-grid">
        ${PLANNING_MODES.map(option => `<label class="center-mode-option ${settings.mode === option.value ? 'is-selected' : ''}">
          <input type="radio" name="mode" value="${option.value}" ${settings.mode === option.value ? 'checked' : ''}>
          <span><strong>${escapeHtml(option.label)}</strong><small>${option.value === 'ptal' ? 'Mantiene el flujo actual de apoyos PT y AL.' : 'Añade profesorado ordinario, currículo, cobertura y generación del horario completo.'}</small></span>
        </label>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Perfil curricular del centro</h2><small>No contiene cifras legales predeterminadas: introduce o importa el perfil oficial que corresponda a tu normativa.</small></div></div>
      <div class="card-body form-grid">
        <div class="form-field"><label for="profileName">Nombre del perfil</label><input id="profileName" name="profileName" value="${escapeHtml(settings.profileName)}" placeholder="Ej.: Currículo Primaria 2026/27"></div>
        <div class="form-field"><label for="territory">Territorio / administración</label><input id="territory" name="territory" value="${escapeHtml(settings.territory)}" placeholder="Comunidad autónoma / administración"></div>
        <div class="form-field"><label for="academicYear">Curso escolar</label><input id="academicYear" name="academicYear" value="${escapeHtml(settings.academicYear)}" placeholder="2026/27"></div>
        <div class="form-field"><label for="legalReference">Referencia normativa</label><input id="legalReference" name="legalReference" value="${escapeHtml(settings.legalReference)}" placeholder="Orden / decreto / resolución"></div>
      </div>
    </section>

    ${settings.mode === 'global' ? `<section class="card global-generation-settings">
      <div class="card-header"><div><h2>Parámetros de generación global</h2><small>Define la rejilla sobre la que se construirá una propuesta completa de horarios de aula.</small></div></div>
      <div class="card-body form-grid">
        <div class="form-field"><label for="globalStart">Inicio de jornada</label><input id="globalStart" name="globalStart" type="time" value="${escapeHtml(settings.generation.start)}"></div>
        <div class="form-field"><label for="globalEnd">Fin de jornada</label><input id="globalEnd" name="globalEnd" type="time" value="${escapeHtml(settings.generation.end)}"></div>
        <div class="form-field"><label for="lessonMinutes">Duración habitual de tramo</label><select id="lessonMinutes" name="lessonMinutes">${[30,45,60,75,90].map(value => `<option value="${value}" ${settings.generation.lessonMinutes === value ? 'selected' : ''}>${value} minutos</option>`).join('')}</select><span class="field-hint">Si una carga semanal deja un resto menor, el último bloque tendrá esa duración, siempre en múltiplos de 15 minutos.</span></div>
        <div class="form-field"><label for="maxSameSubjectPerDay">Máximo de la misma materia al día</label><select id="maxSameSubjectPerDay" name="maxSameSubjectPerDay">${[1,2,3,4].map(value => `<option value="${value}" ${settings.generation.maxSameSubjectPerDay === value ? 'selected' : ''}>${value}</option>`).join('')}</select><span class="field-hint">El generador intenta repartir las materias a lo largo de la semana.</span></div>
      </div>
    </section>` : ''}

    ${!structureReady ? `<section class="card warning-box center-planning-warning"><strong>Falta la estructura del colegio.</strong><span>Configura primero las líneas y clases para poder medir la cobertura real del currículo.</span><button class="button" type="button" data-go="classSchedules">Configurar clases</button></section>` : ''}

    <section class="card">
      <div class="card-header"><div><h2>Carga semanal por curso y asignatura</h2><small>Introduce horas semanales objetivo. Internamente se guardan como minutos para poder comparar y generar el horario.</small></div><span class="badge badge-neutral">${curriculumCourses.length} cursos</span></div>
      <div class="curriculum-course-list">
        ${curriculumCourses.map(course => renderCourseCurriculum(course, settings)).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Profesorado y funciones</h2><small>Resumen de tutorías, asignaturas y responsabilidades configuradas en cada profesional.</small></div><button class="button" type="button" data-go="professionals">Gestionar profesorado</button></div>
      <div class="teacher-profile-grid">
        ${(state.professionals || []).map(professional => renderTeacherSummary(professional)).join('') || `<div class="empty-state"><strong>No hay profesorado</strong>Utiliza “Gestionar profesorado” para añadirlo.</div>`}
      </div>
    </section>

    ${settings.mode === 'global' ? `<section class="card">
      <div class="card-header"><div><h2>Cobertura curricular</h2><small>Compara el tiempo semanal cargado en los horarios de aula con el objetivo del perfil curricular.</small></div><span class="badge badge-neutral">${classes.length} clases</span></div>
      <div class="curriculum-coverage-grid">
        ${coverage.length ? coverage.map(renderCoverageCard).join('') : `<div class="empty-state"><strong>Sin clases configuradas</strong>Configura la estructura y los horarios de aula para ver la cobertura.</div>`}
      </div>
    </section>

    <section class="card global-proposal-card">
      <div class="card-header">
        <div><h2>Propuesta automática global</h2><small>Construye desde cero los horarios ordinarios usando currículo, profesorado, jornada, recreos, centros externos y las reglas PT/AL.</small></div>
        <span class="badge ${readiness.ready ? 'badge-success' : 'badge-warning'}">${readiness.ready ? 'Preparado' : `${readiness.items.filter(item => !item.ok).length} pendiente(s)`}</span>
      </div>
      <div class="global-readiness-list">${readiness.items.map(renderReadinessItem).join('')}</div>
      <div class="global-generator-note"><strong>Qué hace esta primera versión</strong><span>Genera el horario de las clases con un único docente por materia. Las coordinaciones, planes y programas cuentan para la carga semanal del profesor, pero todavía no se colocan como bloques horarios porque aún no tienen franjas o participantes definidos.</span></div>
      <div class="button-row global-generator-actions">
        <button class="button button-primary" type="button" data-generate-global ${readiness.ready ? '' : 'disabled'}>⚙ Generar propuesta global</button>
        <button class="button" type="button" data-go="professionals">Revisar profesorado</button>
        <button class="button" type="button" data-go="classSchedules">Ver horario actual</button>
      </div>
      ${renderGlobalProposal(globalProposal)}
    </section>` : ''}

    <div class="center-planning-actions"><button class="button button-primary" type="submit">Guardar configuración global</button></div>
  </form>`;

  root.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
    root.querySelectorAll('.center-mode-option').forEach(label => label.classList.toggle('is-selected', label.querySelector('input')?.checked));
  }));
  root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => onNavigate(button.dataset.go)));
  root.querySelector('[data-generate-global]')?.addEventListener('click', async event => {
    if (event.currentTarget.disabled) return;
    await onGenerateGlobal(readSettings(root.querySelector('#centerPlanningForm'), settings));
  });
  root.querySelector('[data-apply-global]')?.addEventListener('click', () => onApplyGlobal());
  root.querySelector('[data-discard-global]')?.addEventListener('click', () => onDiscardGlobal());
  root.querySelector('#centerPlanningForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    await onSave(readSettings(event.currentTarget, settings));
  });
}

function renderCourseCurriculum(course, settings) {
  const subjects = curriculumSubjectsForCourse(course.value);
  const values = curriculumForCourse(settings, course.value);
  return `<details class="curriculum-course-card" ${course.value === '1º' ? 'open' : ''}>
    <summary><strong>${escapeHtml(course.label)}</strong><span>${Object.keys(values).length ? `${Object.keys(values).length} materia(s) configuradas` : 'Sin carga definida'}</span></summary>
    <div class="curriculum-subject-grid">
      ${subjects.map(subject => {
        const minutes = values[subject] || 0;
        const hours = minutes ? trimNumber(minutes / 60) : '';
        return `<label class="curriculum-subject-row"><span>${escapeHtml(subject)}</span><input type="number" min="0" step="0.25" inputmode="decimal" value="${hours}" data-curriculum-course="${escapeHtml(course.value)}" data-curriculum-subject="${escapeHtml(subject)}" aria-label="Horas semanales de ${escapeHtml(subject)} en ${escapeHtml(course.label)}"><small>h/sem.</small></label>`;
      }).join('')}
    </div>
  </details>`;
}

function renderTeacherSummary(professional) {
  const profile = normalizeProfessionalProfile(professional);
  const responsibilities = profile.responsibilities.map(item => {
    const type = RESPONSIBILITY_TYPES.find(option => option.value === item.tipo)?.label || 'Función';
    return `${type}: ${item.nombre}${item.weeklyMinutes ? ` (${formatDuration(item.weeklyMinutes)})` : ''}`;
  });
  const teaching = profile.teachingAssignments.map(item => `${item.grupoClase} · ${item.materia}`);
  const badgeClass = profile.tipo === 'PT' ? 'badge-pt' : profile.tipo === 'AL' ? 'badge-al' : 'badge-neutral';
  return `<article class="teacher-profile-card">
    <header><div><strong>${escapeHtml(profile.nombre || 'Sin nombre')}</strong><small>${escapeHtml(profile.especialidad || (profile.tipo === 'DOCENTE' ? 'Docente' : profile.tipo))}</small></div><span class="badge ${badgeClass}">${escapeHtml(profile.tipo)}</span></header>
    <dl><div><dt>Tutoría</dt><dd>${escapeHtml(profile.tutoriaGrupo || '—')}</dd></div><div><dt>Docencia</dt><dd>${teaching.length ? teaching.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '—'}</dd></div><div><dt>Funciones</dt><dd>${responsibilities.length ? responsibilities.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '—'}</dd></div></dl>
  </article>`;
}

function renderCoverageCard(item) {
  const className = !item.configured ? 'is-unconfigured' : item.complete ? 'is-complete' : 'is-incomplete';
  const status = !item.configured ? 'Sin objetivo' : item.complete ? 'Completo' : 'Revisar';
  const rows = item.rows.filter(row => row.target || row.actual).map(row => `<tr><td>${escapeHtml(row.subject)}</td><td>${formatDuration(row.target)}</td><td>${formatDuration(row.actual)}</td><td>${formatDifference(row.difference)}</td></tr>`).join('');
  return `<article class="curriculum-coverage-card ${className}">
    <header><div><strong>${escapeHtml(item.grupoClase)}</strong><small>${escapeHtml(item.course || '')}</small></div><span class="badge ${item.complete ? 'badge-success' : 'badge-warning'}">${status}</span></header>
    <div class="coverage-totals"><span>Objetivo <b>${formatDuration(item.targetTotal)}</b></span><span>Cargado <b>${formatDuration(item.actualTotal)}</b></span></div>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>Materia</th><th>Objetivo</th><th>Horario</th><th>Diferencia</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No hay datos curriculares para comparar.</p>'}
  </article>`;
}

function renderReadinessItem(item) {
  return `<div class="global-readiness-item ${item.ok ? 'is-ready' : 'is-pending'}"><span class="global-readiness-icon">${item.ok ? '✓' : '!'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small></div></div>`;
}

function renderGlobalProposal(proposal) {
  if (!proposal) return '<div class="global-proposal-empty">Todavía no se ha calculado ninguna propuesta global.</div>';
  if (!proposal.ok) {
    const unresolved = proposal.unresolved || [];
    return `<div class="global-proposal-result is-error"><strong>No se ha encontrado una propuesta completa</strong><span>${unresolved.length ? `${unresolved.length} elemento(s) no han podido colocarse.` : 'Revisa los requisitos pendientes antes de generar.'}</span>${unresolved.length ? `<div class="global-unresolved-list">${unresolved.slice(0,12).map(item => `<span>${escapeHtml(item.task ? `${item.task.grupoClase} · ${item.task.materia} (${item.task.duration} min): ${item.reason}` : item.reason || item.conflict?.message || 'Sin hueco')}</span>`).join('')}${unresolved.length > 12 ? `<span>… y ${unresolved.length - 12} más</span>` : ''}</div>` : ''}<div class="button-row"><button class="button" type="button" data-discard-global>Descartar resultado</button></div></div>`;
  }

  const summary = summarizeGenerated(proposal.classSchedules || []);
  return `<div class="global-proposal-result is-success">
    <div class="global-proposal-stats">
      <span><b>${proposal.stats.classes}</b> clases</span><span><b>${proposal.stats.subjects}</b> clase/asignatura</span><span><b>${proposal.stats.blocks}</b> bloques</span><span><b>${formatDuration(proposal.stats.minutes)}</b> lectivos</span><span><b>${proposal.stats.ptalAligned}</b> bloques coinciden con PT/AL</span>
    </div>
    <div class="global-proposal-warning"><strong>Vista previa</strong><span>Aplicar sustituirá los horarios ordinarios actuales de las clases participantes por esta propuesta. Las sesiones PT/AL no se modifican.</span></div>
    <div class="table-wrap"><table><thead><tr><th>Clase</th><th>Asignatura</th><th>Propuesta semanal</th><th>Docente</th></tr></thead><tbody>${summary.slice(0,80).map(row => `<tr><td><strong>${escapeHtml(row.grupoClase)}</strong></td><td>${escapeHtml(row.materia)}</td><td>${row.slots.map(slot => `<span class="weekly-summary-slot"><b>${escapeHtml(slot.dia.slice(0,3))}</b> ${escapeHtml(slot.inicio)}–${escapeHtml(slot.fin)}</span>`).join(' ')}</td><td>${escapeHtml(row.docente || '—')}</td></tr>`).join('')}</tbody></table></div>
    <div class="button-row global-proposal-buttons"><button class="button button-primary" type="button" data-apply-global>Aplicar propuesta global</button><button class="button" type="button" data-discard-global>Descartar</button></div>
  </div>`;
}

function summarizeGenerated(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.grupoClase}\u0000${entry.materia}`;
    if (!map.has(key)) map.set(key, { grupoClase:entry.grupoClase, materia:entry.materia, docente:entry.docente || '', slots:[] });
    map.get(key).slots.push({ dia:entry.dia, inicio:entry.inicio, fin:entry.fin });
  }
  const dayOrder = new Map(['lunes','martes','miercoles','jueves','viernes'].map((day, index) => [day,index]));
  return [...map.values()].map(item => ({ ...item, slots:item.slots.sort((a,b) => (dayOrder.get(a.dia) ?? 99) - (dayOrder.get(b.dia) ?? 99) || a.inicio.localeCompare(b.inicio)) }))
    .sort((a,b) => a.grupoClase.localeCompare(b.grupoClase, 'es', { numeric:true }) || a.materia.localeCompare(b.materia, 'es'));
}

function readSettings(form, settings) {
  const data = new FormData(form);
  return normalizeCenterPlanningSettings({
    ...settings,
    mode:data.get('mode'),
    profileName:data.get('profileName'),
    territory:data.get('territory'),
    academicYear:data.get('academicYear'),
    legalReference:data.get('legalReference'),
    generation:{
      ...settings.generation,
      start:data.get('globalStart') || settings.generation.start,
      end:data.get('globalEnd') || settings.generation.end,
      lessonMinutes:Number(data.get('lessonMinutes') || settings.generation.lessonMinutes),
      maxSameSubjectPerDay:Number(data.get('maxSameSubjectPerDay') || settings.generation.maxSameSubjectPerDay)
    },
    curriculum:readCurriculumInputs(form)
  });
}

function readCurriculumInputs(form) {
  const curriculum = {};
  form.querySelectorAll('[data-curriculum-course][data-curriculum-subject]').forEach(input => {
    const hours = Number(String(input.value || '').replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0) return;
    const course = input.dataset.curriculumCourse;
    const subject = input.dataset.curriculumSubject;
    curriculum[course] ||= {};
    curriculum[course][subject] = Math.round(hours * 60);
  });
  return curriculum;
}

function formatDifference(minutes) {
  if (!minutes) return '0 min';
  return `${minutes > 0 ? '+' : '−'}${formatDuration(Math.abs(minutes))}`;
}

function trimNumber(value) {
  return Number(value.toFixed(2)).toString();
}
