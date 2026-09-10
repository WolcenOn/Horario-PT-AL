import { buildCombinedScheduleProjection } from './combined-schedule.js';
import { describeSupportPolicy } from './support-policy.js';
import { escapeHtml } from './utils.js';

export function renderCombinedSchedule(root, { state }) {
  const projection = buildCombinedScheduleProjection(state);

  root.innerHTML = `<div class="combined-schedule-view">
    <section class="card combined-schedule-hero">
      <div>
        <p class="eyebrow">Vista combinada</p>
        <h2>Horario académico + capas PT y AL</h2>
        <p>El horario ordinario sigue siendo la base. Una sesión PT o AL puede ocupar la misma franja para parte del alumnado cuando la materia de origen permite esa extracción.</p>
      </div>
      <div class="combined-layer-legend" aria-label="Capas del horario">
        <span><b>Aula</b> base académica</span>
        <span class="is-pt"><b>PT</b> apoyo</span>
        <span class="is-al"><b>AL</b> apoyo</span>
      </div>
    </section>

    <section class="combined-schedule-summary" aria-label="Resumen de compatibilidad">
      ${metric('Franjas ordinarias', projection.ordinaryBlocks)}
      ${metric('Sesiones PT/AL', projection.supportItems.length)}
      ${metric('Compatibles', projection.counts.ok, 'is-ok')}
      ${metric('A revisar', projection.counts.warning, projection.counts.warning ? 'is-warning' : '')}
      ${metric('Bloqueadas', projection.counts.blocked, projection.counts.blocked ? 'is-blocked' : '')}
    </section>

    <section class="card combined-explanation">
      <strong>Cómo leer esta vista</strong>
      <span>Una coincidencia Aula + PT/AL no es un conflicto por sí sola. Se marca como bloqueo cuando la materia no permite ese tipo de extracción, cuando el mismo alumno aparece en dos apoyos simultáneos o cuando un profesional queda duplicado.</span>
    </section>

    <div class="combined-days">
      ${projection.days.map(day => renderDay(day)).join('')}
    </div>
  </div>`;
}

function renderDay(day) {
  return `<section class="card combined-day" data-combined-day="${escapeHtml(day.id)}">
    <div class="card-header">
      <div><h2>${escapeHtml(day.label)}</h2><small>${day.items.length ? `${day.items.length} sesión(es) de apoyo cruzadas con el horario ordinario` : 'Sin sesiones PT/AL'}</small></div>
    </div>
    <div class="combined-session-list">
      ${day.items.length ? day.items.map(renderSupportItem).join('') : '<div class="empty-state"><strong>Sin apoyos este día</strong>El horario ordinario puede existir aunque no haya una capa PT/AL que mostrar.</div>'}
    </div>
  </section>`;
}

function renderSupportItem(item) {
  const statusLabel = item.status === 'blocked' ? 'Bloqueo' : item.status === 'warning' ? 'Revisar' : 'Compatible';
  return `<article class="combined-session is-${item.status}" data-combined-session="${escapeHtml(item.id || '')}">
    <header>
      <div class="combined-session-time"><strong>${escapeHtml(item.inicio || '—')}–${escapeHtml(item.fin || '—')}</strong><span class="combined-support-badge is-${item.supportType.toLowerCase()}">${escapeHtml(item.supportType)}</span></div>
      <span class="combined-status is-${item.status}">${statusLabel}</span>
    </header>
    <div class="combined-session-meta">
      <span><b>Grupo:</b> ${escapeHtml(item.group?.nombre || item.group?.id || '—')}</span>
      <span><b>Profesional:</b> ${escapeHtml(item.professionalName || 'Sin nombre')}</span>
    </div>
    ${renderOverlapWarnings(item)}
    <div class="combined-student-list">
      ${item.studentChecks.length ? item.studentChecks.map(check => renderStudentCheck(check, item.supportType)).join('') : '<div class="combined-student-row is-warning"><strong>Sin alumnado activo</strong><span>Revisa la composición del grupo de apoyo.</span></div>'}
    </div>
  </article>`;
}

function renderStudentCheck(check, supportType) {
  const studentName = `${check.student?.nombre || ''} ${check.student?.apellidos || ''}`.trim() || check.student?.id || 'Alumno';
  const sources = check.sources.length
    ? check.sources.map(source => `<span class="combined-source is-${source.status}"><b>${escapeHtml(source.entry.materia || 'Materia')}</b><small>${escapeHtml(describeSupportPolicy(source.policy))}</small></span>`).join('')
    : '<span class="combined-source is-warning"><b>Sin materia de origen</b><small>No hay franja ordinaria coincidente.</small></span>';
  return `<div class="combined-student-row is-${check.status}">
    <div><strong>${escapeHtml(studentName)}</strong><small>${escapeHtml(check.student?.grupoClase || 'Sin clase')} · ${escapeHtml(supportType)}</small></div>
    <div class="combined-source-list">${sources}</div>
    <span class="combined-student-message">${escapeHtml(check.message)}</span>
  </div>`;
}

function renderOverlapWarnings(item) {
  if (!item.overlaps.length) return '';
  const studentMap = new Map(item.studentChecks.map(check => [check.student.id, `${check.student.nombre || ''} ${check.student.apellidos || ''}`.trim() || check.student.id]));
  const messages = [];
  for (const overlap of item.overlaps) {
    if (overlap.sameProfessional) messages.push('El profesional coincide con otra sesión de apoyo.');
    if (overlap.sharedStudents.length) {
      const names = overlap.sharedStudents.map(id => studentMap.get(id) || id).join(', ');
      messages.push(`Alumnado simultáneamente en dos apoyos: ${names}.`);
    }
  }
  return `<div class="combined-overlap-warning">${[...new Set(messages)].map(message => `<span>⚠ ${escapeHtml(message)}</span>`).join('')}</div>`;
}

function metric(label, value, extraClass = '') {
  return `<div class="combined-metric ${extraClass}"><span>${escapeHtml(label)}</span><strong>${Number(value) || 0}</strong></div>`;
}
