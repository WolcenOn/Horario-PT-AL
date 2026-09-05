import { DAYS } from './constants.js';
import { COURSE_OPTIONS } from './education.js';
import { SUBJECT_PRIORITIES, buildReadinessReport, courseRuleDraft, normalizeAutomationSettings, subjectsForCourse } from './automation-core.js';
import { escapeHtml } from './utils.js';

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

  root.innerHTML = `
    <section class="card automation-hero ${readiness.ready ? 'is-ready' : 'is-pending'}">
      <div>
        <p class="eyebrow">Asistente de configuración</p>
        <h2>${readiness.ready ? 'Todo listo para calcular una propuesta' : `Faltan ${missingCount} apartado(s) por completar`}</h2>
        <p>La configuración automática reorganiza las sesiones existentes conservando su grupo, profesional, duración y frecuencia. Busca huecos válidos y prioriza las materias que hayas marcado como menos sensibles.</p>
      </div>
      <span class="automation-status ${readiness.ready ? 'ready' : 'pending'}">${readiness.ready ? '✓ Preparado' : `⚠ ${missingCount} pendiente${missingCount === 1 ? '' : 's'}`}</span>
    </section>

    <section class="card">
      <div class="card-header">
        <div><h2>Comprobación previa</h2><small>Los requisitos obligatorios deben estar completos antes de generar una propuesta.</small></div>
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
            <h2>Prioridades y horas permitidas por curso</h2>
            <small>“Prioridad” significa cuánto interesa conservar al alumno dentro del aula ordinaria durante esa materia.</small>
          </div>
          <span class="badge badge-neutral">${readiness.courses.length} cursos</span>
        </div>
        ${readiness.courses.length ? `
          <div class="automation-course-list">
            ${readiness.courses.map(course => renderCourseRule(state, settings, course)).join('')}
          </div>
          <div class="automation-form-actions">
            <span class="muted">Las franjas vacías significan “no programar sesiones ese día”.</span>
            <button class="button button-primary" type="submit">Guardar reglas de cursos</button>
          </div>` : `
          <div class="empty-state"><strong>No hay cursos que configurar</strong>Añade alumnos a grupos PT/AL y completa su curso para crear las reglas automáticas.</div>`}
      </section>
    </form>

    <section class="card automation-generate-card">
      <div>
        <h2>Generación automática</h2>
        <p>El cálculo no modifica el horario directamente. Primero genera una propuesta; podrás revisarla y decidir si aplicarla.</p>
      </div>
      <button id="generateAutomaticBtn" class="button button-primary button-large" type="button" ${readiness.ready ? '' : 'disabled'}>⚙ Generar propuesta automática</button>
    </section>

    ${renderProposal(state, proposal)}
  `;

  root.querySelectorAll('[data-readiness-target]').forEach(button => button.addEventListener('click', () => {
    if (button.dataset.readinessTarget === 'recesses') onEditRecesses();
    else onNavigate(button.dataset.readinessTarget);
  }));

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

  return `<article class="automation-course-card" data-course-rule="${escapeHtml(course)}">
    <div class="automation-course-head">
      <div><h3>${escapeHtml(courseLabel)}</h3><small>${subjects.length} materia(s) detectada(s) en los horarios ordinarios.</small></div>
      <span class="badge ${stored?.confirmed ? 'badge-success' : 'badge-warning'}">${stored?.confirmed ? 'Configurado' : 'Pendiente de guardar'}</span>
    </div>
    <div class="automation-course-grid">
      <div>
        <h4>Horas en las que se puede programar PT/AL</h4>
        <div class="allowed-window-grid">
          <strong>Día</strong><strong>Desde</strong><strong>Hasta</strong>
          ${DAYS.map(day => {
            const window = draft.allowedWindows?.[day.id] || { inicio:'', fin:'' };
            return `<span>${day.label}</span><input type="time" data-window-start="${day.id}" value="${escapeHtml(window.inicio || '')}" aria-label="${day.label} desde"><input type="time" data-window-end="${day.id}" value="${escapeHtml(window.fin || '')}" aria-label="${day.label} hasta">`;
          }).join('')}
        </div>
      </div>
      <div>
        <h4>Prioridad de las asignaturas</h4>
        ${subjects.length ? `<div class="subject-priority-list">
          ${subjects.map(subject => {
            const priority = draft.subjectPriorities?.[subject] || 'medium';
            return `<label class="subject-priority-row"><span>${escapeHtml(subject)}</span><select data-subject-priority="${escapeHtml(subject)}">${SUBJECT_PRIORITIES.map(option => `<option value="${option.value}" ${priority === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></label>`;
          }).join('')}
        </div>` : `<div class="automation-inline-warning">No se han detectado materias para este curso. Completa primero sus horarios de aula.</div>`}
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
      <p>Prueba ampliando las franjas permitidas, rebajando alguna materia de “Bloqueada”, completando disponibilidades o revisando grupos que comparten alumnado/profesional.</p>
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
    courseRules[course] = { confirmed:true, allowedWindows, subjectPriorities };
  }
  return { id:'automation', courseRules };
}

function formatSlot(value) {
  const day = DAYS.find(item => item.id === value.dia)?.label || value.dia;
  return `${escapeHtml(day)} · ${escapeHtml(value.inicio)}–${escapeHtml(value.fin)}`;
}
