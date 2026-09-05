import { COURSE_OPTIONS, configuredClassGroups, schoolStructureConfigured } from './education.js';
import { curriculumCoverage, curriculumForCourse, curriculumSubjectsForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile, PLANNING_MODES, RESPONSIBILITY_TYPES } from './center-planning.js';
import { escapeHtml, formatDuration } from './utils.js';

export function renderCenterPlanning(root, { state, centerPlanningSettings, onSave, onNavigate }) {
  const settings = normalizeCenterPlanningSettings(centerPlanningSettings);
  const structureReady = schoolStructureConfigured(state.schoolSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const coverage = curriculumCoverage(state, settings);
  const curriculumCourses = COURSE_OPTIONS;

  root.innerHTML = `<form id="centerPlanningForm" class="center-planning-view">
    <section class="card center-mode-card">
      <div class="card-header">
        <div><h2>Alcance de la planificación</h2><small>El modo global amplía la aplicación sin desactivar el funcionamiento PT/AL.</small></div>
        <span class="badge ${settings.mode === 'global' ? 'badge-success' : 'badge-neutral'}">${settings.mode === 'global' ? 'Centro completo' : 'Solo PT / AL'}</span>
      </div>
      <div class="card-body center-mode-grid">
        ${PLANNING_MODES.map(option => `<label class="center-mode-option ${settings.mode === option.value ? 'is-selected' : ''}">
          <input type="radio" name="mode" value="${option.value}" ${settings.mode === option.value ? 'checked' : ''}>
          <span><strong>${escapeHtml(option.label)}</strong><small>${option.value === 'ptal' ? 'Mantiene el flujo actual de apoyos PT y AL.' : 'Añade profesorado ordinario, currículo y control de cobertura de materias.'}</small></span>
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

    ${!structureReady ? `<section class="card warning-box center-planning-warning"><strong>Falta la estructura del colegio.</strong><span>Configura primero las líneas y clases para poder medir la cobertura real del currículo.</span><button class="button" type="button" data-go="classSchedules">Configurar clases</button></section>` : ''}

    <section class="card">
      <div class="card-header"><div><h2>Carga semanal por curso y asignatura</h2><small>Introduce horas semanales objetivo. Internamente se guardan como minutos para poder comparar con el horario real.</small></div><span class="badge badge-neutral">${curriculumCourses.length} cursos</span></div>
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
    </section>` : ''}

    <div class="center-planning-actions"><button class="button button-primary" type="submit">Guardar configuración global</button></div>
  </form>`;

  root.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
    root.querySelectorAll('.center-mode-option').forEach(label => label.classList.toggle('is-selected', label.querySelector('input')?.checked));
  }));
  root.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => onNavigate(button.dataset.go)));
  root.querySelector('#centerPlanningForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = normalizeCenterPlanningSettings({
      ...settings,
      mode:data.get('mode'),
      profileName:data.get('profileName'),
      territory:data.get('territory'),
      academicYear:data.get('academicYear'),
      legalReference:data.get('legalReference'),
      curriculum:readCurriculumInputs(form)
    });
    await onSave(next);
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
