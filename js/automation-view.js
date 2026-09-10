import { DAYS } from './constants.js';
import { COURSE_OPTIONS } from './education.js';
import { SUBJECT_PRIORITIES, buildReadinessReport, courseRuleDraft, normalizeAutomationSettings, subjectsForCourse } from './automation-core.js';
import { escapeHtml } from './utils.js';

const EXTRACTION_OPTIONS = [
  { value:'ptal', label:'PT y AL' },
  { value:'pt', label:'Solo PT' },
  { value:'al', label:'Solo AL' },
  { value:'blocked', label:'No extraíble' }
];
const PREFERENCE_OPTIONS = SUBJECT_PRIORITIES.filter(option => option.value !== 'blocked');

export function renderAutomationManager(root, {
  state,
  automationSettings,
  proposal,
  onSaveSettings,
  onGenerate,
  onApplyProposal,
  onDiscardProposal,
  onNavigate,
  onEditRecesses
}) {
  const settings = normalizeAutomationSettings(automationSettings);
  const readiness = buildReadinessReport(state, settings);
  const missingCount = readiness.items.filter(item => !item.ok).length;
  const globalMode = state.centerPlanningSettings?.mode === 'global';
  const centerWindow = generationWindow(state);

  root.innerHTML = `
    <section class="card automation-hero ${readiness.ready ? 'is-ready' : 'is-pending'}">
      <div>
        <p class="eyebrow">Ajuste automático PT/AL</p>
        <h2>${readiness.ready ? 'Todo listo para recolocar los apoyos' : `Faltan ${missingCount} apartado(s) para ajustar PT/AL`}</h2>
        <p>Este asistente recoloca sesiones PT/AL que ya tienen definida su frecuencia y duración. Si partes de un horario vacío y quieres construir primero las materias y actividades de todo el centro, utiliza la propuesta automática global de “Plan del centro”.</p>
      </div>
      <span class="automation-status ${readiness.ready ? 'ready' : 'pending'}">${readiness.ready ? '✓ Preparado' : `⚠ ${missingCount} pendiente${missingCount === 1 ? '' : 's'}`}</span>
    </section>

    ${globalMode ? `<section class="card" style="padding:16px 18px;margin-bottom:14px">
      <div class="card-header" style="padding:0 0 10px"><div><h2>¿Partes de un horario vacío?</h2><small>No necesitas crear los horarios ordinarios a mano.</small></div></div>
      <p class="muted" style="margin:0 0 12px">El generador global puede construir las asignaturas desde el currículo, las asignaciones del profesorado, la jornada, los recreos y los patrones temporales. Después puedes volver aquí para afinar la colocación PT/AL.</p>
      <button class="button button-primary" type="button" data-open-global-generator>🏛️ Ir a Plan del centro · Generación global</button>
    </section>` : ''}

    <section class="card">
      <div class="card-header">
        <div><h2>Comprobación previa del ajuste PT/AL</h2><small>Estos requisitos pertenecen al recolocador de apoyos, no al generador global del horario ordinario.</small></div>
      </div>
      <div class="automation-checklist">
        ${readiness.items.map(item => `
          <div class="automation-check ${item.ok ? 'is-ok' : 'is-missing'}">
            <span class="automation-check-icon" aria-hidden="true">${item.ok ? '✓' : '!'}</span>
            <div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail)}</small></div>
            ${!item.ok && item.target !== 'automation' ? `<button class="button button-small" type="button" data-readiness-target="${escapeHtml(item.target)}">Configurar</button>` : ''}
          </div>`).join('')}
      </div>
    </section>

    <form id="automationRulesForm" class="automation-rules-form">
      <section class="card">
        <div class="card-header">
          <div>
            <h2>Extracción, preferencias y horas permitidas</h2>
            <small>“Extracción” es una regla dura: decide si el alumnado puede salir de esa materia a PT y/o AL. “Preferencia” solo ordena los huecos permitidos.</small>
          </div>
          <span class="badge badge-neutral">${readiness.courses.length} cursos</span>
        </div>
        ${readiness.courses.length ? `
          <div class="automation-course-list">
            ${readiness.courses.map(course => renderCourseRule(state, settings, course)).join('')}
          </div>
          <div class="automation-form-actions">
            <span class="muted">Las franjas vacías significan “no programar sesiones ese día”. Una preferencia nunca bloquea por sí sola una franja; para prohibir una extracción usa “No extraíble”.</span>
            <button class="button" type="button" data-use-center-hours-all data-center-start="${escapeHtml(centerWindow.inicio)}" data-center-end="${escapeHtml(centerWindow.fin)}">↳ Usar ${escapeHtml(centerWindow.inicio)}–${escapeHtml(centerWindow.fin)} en todos los cursos</button>
            <button class="button button-primary" type="submit">Guardar reglas de cursos</button>
          </div>` : `
          <div class="empty-state"><strong>No hay cursos que configurar</strong>Añade alumnos a grupos PT/AL y completa su curso para crear las reglas automáticas.</div>`}
      </section>
    </form>

    <section class="card automation-generate-card">
      <div>
        <h2>Recolocar sesiones PT/AL</h2>
        <p>El cálculo no modifica el horario directamente. Primero genera una propuesta; podrás revisarla y decidir si aplicarla.</p>
      </div>
      <button id="generateAutomaticBtn" class="button button-primary button-large" type="button" ${readiness.ready ? '' : 'disabled'}>⚙ Recalcular apoyos PT/AL</button>
    </section>

    ${renderProposal(state, proposal)}
  `;

  root.querySelector('[data-open-global-generator]')?.addEventListener('click', () => onNavigate('centerPlanning'));

  root.querySelectorAll('[data-readiness-target]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.readinessTarget === 'recesses') onEditRecesses();
    else onNavigate(button.dataset.readinessTarget);
  }));

  root.querySelectorAll('[data-copy-course-window]').forEach(button => button.addEventListener('click', () => {
    const section = button.closest('[data-course-rule]');
    if (!section) return;
    const inicio = section.querySelector('[data-course-copy-start]')?.value || '';
    const fin = section.querySelector('[data-course-copy-end]')?.value || '';
    if (applyWindowToSection(section, inicio, fin)) {
      button.textContent = '✓ Copiado a lunes–viernes';
      setTimeout(() => { if (button.isConnected) button.textContent = 'Aplicar a lunes–viernes'; }, 1400);
    }
  }));

  root.querySelector('[data-use-center-hours-all]')?.addEventListener('click', event => {
    const inicio = event.currentTarget.dataset.centerStart || '';
    const fin = event.currentTarget.dataset.centerEnd || '';
    let applied = 0;
    root.querySelectorAll('[data-course-rule]').forEach(section => {
      if (applyWindowToSection(section, inicio, fin, { silent:true })) {
        const copyStart = section.querySelector('[data-course-copy-start]');
        const copyEnd = section.querySelector('[data-course-copy-end]');
        if (copyStart) copyStart.value = inicio;
        if (copyEnd) copyEnd.value = fin;
        applied += 1;
      }
    });
    if (applied) {
      event.currentTarget.textContent = `✓ Jornada copiada a ${applied} curso(s)`;
      setTimeout(() => {
        if (event.currentTarget.isConnected) event.currentTarget.textContent = `↳ Usar ${inicio}–${fin} en todos los cursos`;
      }, 1600);
    }
  });

  root.querySelector('#automationRulesForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const next = readRulesFromForm(root, settings);
    if (!next) return;
    await onSaveSettings(next);
  });

  root.querySelector('#generateAutomaticBtn')?.addEventListener('click', onGenerate);
  root.querySelector('#applyAutomaticProposalBtn')?.addEventListener('click', onApplyProposal);
  root.querySelector('#discardAutomaticProposalBtn')?.addEventListener('click', onDiscardProposal);
}

function renderCourseRule(state, settings, course) {
  const stored = settings.courseRules[course];
  const draft = courseRuleDraft(state, settings, course);
  const subjects = subjectsForCourse(state, course);
  const courseLabel = COURSE_OPTIONS.find(option => option.value === course)?.label || course;
  const fromOrdinarySchedule = (state.classSchedules || []).some(entry => {
    const students = (state.students || []).filter(student => student.curso === course && student.grupoClase);
    const groups = new Set(students.map(student => String(student.grupoClase || '').trim().toLocaleLowerCase('es')));
    return groups.has(String(entry.grupoClase || '').trim().toLocaleLowerCase('es'));
  });
  const sourceLabel = fromOrdinarySchedule ? 'horario ordinario y currículo' : 'currículo del centro';
  const centerWindow = generationWindow(state);
  const firstWindow = DAYS.map(day => draft.allowedWindows?.[day.id]).find(window => window?.inicio && window?.fin) || centerWindow;

  return `<article class="automation-course-card" data-course-rule="${escapeHtml(course)}">
    <div class="automation-course-head">
      <div><h3>${escapeHtml(courseLabel)}</h3><small>${subjects.length} materia(s) detectada(s) desde ${escapeHtml(sourceLabel)}.</small></div>
      <span class="badge ${stored?.confirmed ? 'badge-success' : 'badge-warning'}">${stored?.confirmed ? 'Configurado' : 'Pendiente de guardar'}</span>
    </div>
    <div class="automation-course-grid">
      <div>
        <h4>Horas en las que se puede programar PT/AL</h4>
        <div class="button-row" style="justify-content:flex-start;align-items:end;margin:0 0 10px;gap:8px">
          <label style="display:grid;gap:3px;font-size:.75rem;font-weight:700">Desde<input type="time" data-course-copy-start value="${escapeHtml(firstWindow.inicio || centerWindow.inicio)}" aria-label="Hora inicial para copiar en ${escapeHtml(courseLabel)}"></label>
          <label style="display:grid;gap:3px;font-size:.75rem;font-weight:700">Hasta<input type="time" data-course-copy-end value="${escapeHtml(firstWindow.fin || centerWindow.fin)}" aria-label="Hora final para copiar en ${escapeHtml(courseLabel)}"></label>
          <button class="button button-small" type="button" data-copy-course-window>Aplicar a lunes–viernes</button>
        </div>
        <small class="field-hint" style="display:block;margin-bottom:8px">Copia primero la franja habitual y modifica debajo únicamente el día que sea diferente.</small>
        <div class="allowed-window-grid">
          <strong>Día</strong><strong>Desde</strong><strong>Hasta</strong>
          ${DAYS.map(day => {
            const window = draft.allowedWindows?.[day.id] || { inicio:'', fin:'' };
            return `<span>${day.label}</span><input type="time" data-window-start="${day.id}" value="${escapeHtml(window.inicio || '')}" aria-label="${day.label} desde"><input type="time" data-window-end="${day.id}" value="${escapeHtml(window.fin || '')}" aria-label="${day.label} hasta">`;
          }).join('')}
        </div>
      </div>
      <div>
        <h4>Reglas por asignatura</h4>
        <small class="field-hint automation-policy-hint">Define primero si se puede salir de la materia y, solo después, qué preferencia tiene entre los huecos permitidos.</small>
        ${subjects.length ? `<div class="subject-priority-list">
          <div class="subject-policy-head" aria-hidden="true"><span>Materia</span><span>Extracción</span><span>Preferencia</span></div>
          ${subjects.map(subject => {
            const storedPriority = draft.subjectPriorities?.[subject] || 'medium';
            const priority = storedPriority === 'blocked' ? 'high' : storedPriority;
            const explicitExtraction = draft.subjectPolicies?.[subject]?.extraction || draft.subjectPolicies?.[subject];
            const extraction = explicitExtraction || (storedPriority === 'blocked' ? 'blocked' : 'ptal');
            return `<div class="subject-priority-row subject-policy-row">
              <span>${escapeHtml(subject)}</span>
              <label><small>Extracción</small><select data-subject-extraction="${escapeHtml(subject)}" aria-label="Extracción permitida en ${escapeHtml(subject)}">${EXTRACTION_OPTIONS.map(option => `<option value="${option.value}" ${extraction === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>
              <label><small>Preferencia</small><select data-subject-priority="${escapeHtml(subject)}" aria-label="Preferencia de ${escapeHtml(subject)}">${PREFERENCE_OPTIONS.map(option => `<option value="${option.value}" ${priority === option.value ? 'selected' : ''}>${escapeHtml(option.label.replace(' · buena franja para PT/AL','').replace(' · aceptable','').replace(' · mejor evitar',''))}</option>`).join('')}</select></label>
            </div>`;
          }).join('')}
        </div>` : `<div class="automation-inline-warning">No se han detectado materias. Configura la carga curricular del curso en Plan del centro.</div>`}
      </div>
    </div>
  </article>`;
}

function renderProposal(state, proposal) {
  if (!proposal) return '';
  const groupMap = new Map(state.groups.map(group => [group.id, group]));

  if (!proposal.ok) {
    const unresolved = proposal.unresolved || [];
    return `<section class="card automation-proposal is-error">
      <div class="card-header"><div><h2>No se ha encontrado una solución completa</h2><small>El horario actual no se ha modificado.</small></div><span class="badge badge-danger">${unresolved.length} sin resolver</span></div>
      <p>Prueba ampliando las franjas permitidas, revisando materias marcadas como “No extraíble”, completando disponibilidades o comprobando grupos que comparten alumnado/profesional.</p>
      ${unresolved.length ? `<ul class="automation-unresolved-list">${unresolved.slice(0,10).map(item => {
        if (item.conflict) return `<li>${escapeHtml(item.conflict.message)}</li>`;
        const group = groupMap.get(item.groupId);
        return `<li><strong>${escapeHtml(group?.nombre || item.groupId || item.sessionId)}</strong>: no queda un hueco compatible entre sus ${item.candidateCount ?? 0} candidato(s) posibles.</li>`;
      }).join('')}</ul>` : ''}
      <div class="automation-form-actions"><button id="discardAutomaticProposalBtn" class="button" type="button">Cerrar resultado</button></div>
    </section>`;
  }

  const warningCount = (proposal.conflicts || []).filter(conflict => conflict.severity !== 'grave').length;
  return `<section class="card automation-proposal is-success">
    <div class="card-header">
      <div><h2>Propuesta preparada</h2><small>No se aplicará hasta que pulses “Aplicar propuesta”.</small></div>
      <span class="badge badge-success">${proposal.moved.length} cambio(s)</span>
    </div>
    <div class="automation-proposal-stats">
      <div><span>Sesiones totales</span><strong>${proposal.sessions.length}</strong></div>
      <div><span>Sesiones recolocadas</span><strong>${proposal.moved.length}</strong></div>
      <div><span>Avisos resultantes</span><strong>${warningCount}</strong></div>
    </div>
    ${proposal.moved.length ? `<div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Antes</th><th>Propuesta</th></tr></thead><tbody>${proposal.moved.map(move => {
      const group = groupMap.get(move.groupId);
      return `<tr><td><strong>${escapeHtml(group?.nombre || move.groupId)}</strong></td><td>${formatSlot(move.from)}</td><td>${formatSlot(move.to)}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="pending-all-complete">✓ El horario actual ya es la mejor propuesta encontrada con estas reglas.</div>`}
    <div class="automation-form-actions">
      <button id="discardAutomaticProposalBtn" class="button" type="button">Descartar</button>
      <button id="applyAutomaticProposalBtn" class="button button-primary" type="button">Aplicar propuesta</button>
    </div>
  </section>`;
}

function readRulesFromForm(root, previousSettings) {
  const next = normalizeAutomationSettings(previousSettings);
  const courseRules = { ...next.courseRules };
  for (const section of root.querySelectorAll('[data-course-rule]')) {
    const course = section.dataset.courseRule;
    const allowedWindows = {};
    for (const day of DAYS) {
      const inicio = section.querySelector(`[data-window-start="${day.id}"]`)?.value || '';
      const fin = section.querySelector(`[data-window-end="${day.id}"]`)?.value || '';
      if (Boolean(inicio) !== Boolean(fin)) {
        window.alert(`${day.label} (${course}): indica tanto la hora de inicio como la de fin, o deja ambas vacías.`);
        return null;
      }
      if (inicio && fin <= inicio) {
        window.alert(`${day.label} (${course}): la hora final debe ser posterior a la inicial.`);
        return null;
      }
      allowedWindows[day.id] = { inicio, fin };
    }
    const subjectPriorities = {};
    section.querySelectorAll('[data-subject-priority]').forEach(select => {
      subjectPriorities[select.dataset.subjectPriority] = select.value;
    });
    const subjectPolicies = {};
    section.querySelectorAll('[data-subject-extraction]').forEach(select => {
      subjectPolicies[select.dataset.subjectExtraction] = { extraction:select.value };
    });
    courseRules[course] = { confirmed:true, allowedWindows, subjectPriorities, subjectPolicies };
  }
  return { id:'automation', courseRules };
}

function applyWindowToSection(section, inicio, fin, { silent = false } = {}) {
  if (!inicio || !fin || fin <= inicio) {
    if (!silent) window.alert('Indica una hora inicial y final válidas antes de copiar la franja.');
    return false;
  }
  for (const day of DAYS) {
    const startInput = section.querySelector(`[data-window-start="${day.id}"]`);
    const endInput = section.querySelector(`[data-window-end="${day.id}"]`);
    if (startInput) startInput.value = inicio;
    if (endInput) endInput.value = fin;
  }
  return true;
}

function generationWindow(state) {
  const generation = state.centerPlanningSettings?.generation || {};
  const inicio = /^\d{2}:\d{2}$/.test(String(generation.start || '')) ? generation.start : '09:00';
  const fin = /^\d{2}:\d{2}$/.test(String(generation.end || '')) ? generation.end : '14:00';
  return { inicio, fin };
}

function formatSlot(value) {
  const day = DAYS.find(item => item.id === value.dia)?.label || value.dia;
  return `${escapeHtml(day)} · ${escapeHtml(value.inicio)}–${escapeHtml(value.fin)}`;
}
