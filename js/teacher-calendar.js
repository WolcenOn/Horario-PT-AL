import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { buildProfessionalSchedule } from './professional-schedule.js';
import { escapeHtml, formatDuration, minutesToTime, timeToMinutes } from './utils.js';

export function renderTeacherCalendar(root, { state, professionalId, onChangeProfessional, onPrintProfessional, onOpenPrintManager }) {
  const model = buildProfessionalSchedule(state, professionalId);
  if (!model) {
    root.innerHTML = '<section class="card"><div class="empty-state"><strong>Docente no encontrado</strong>Selecciona otro profesional.</div></section>';
    return;
  }

  const professionals = activeProfessionals(state);
  const entries = model.entries.filter(item => Number.isFinite(timeToMinutes(item.inicio)) && Number.isFinite(timeToMinutes(item.fin)));
  const start = Math.floor(Math.min(DEFAULT_CALENDAR_START, ...entries.map(item => timeToMinutes(item.inicio))) / 30) * 30;
  const end = Math.ceil(Math.max(DEFAULT_CALENDAR_END, ...entries.map(item => timeToMinutes(item.fin))) / 30) * 30;
  const height = (end - start) * CALENDAR_PX_PER_MINUTE;
  const labels = [];
  for (let minute = start; minute <= end; minute += 30) {
    labels.push(`<span class="time-label" style="top:${(minute - start) * CALENDAR_PX_PER_MINUTE}px">${minutesToTime(minute)}</span>`);
  }

  const columns = DAYS.map(day => {
    const blocks = (model.byDay[day.id] || []).map(entry => teacherBlock(entry, start)).join('');
    return `<div class="day-column teacher-day-column" data-day="${day.id}" style="height:${height}px" aria-label="${escapeHtml(day.label)}">${blocks}</div>`;
  }).join('');

  root.innerHTML = `<div class="teacher-calendar-view">
    ${renderToolbar(professionals, professionalId)}
    <section class="teacher-calendar-summary card">
      <div><span class="eyebrow">Horario individual</span><h2>${escapeHtml(model.professional.nombre || 'Docente')}</h2><p>${escapeHtml(model.professional.especialidad || model.professional.tipo || 'Profesorado')} · Tutoría: <strong>${escapeHtml(model.professional.tutoriaGrupo || '—')}</strong></p></div>
      <div class="teacher-calendar-metrics">
        ${metric('Docencia', model.metrics.ordinaryMinutes)}
        ${metric('PT/AL/apoyo', model.metrics.supportMinutes)}
        ${metric('Actividades', model.metrics.activityMinutes)}
        ${metric('Carga modelada', model.metrics.modeledMinutes)}
      </div>
    </section>
    <section class="card calendar-card teacher-calendar-card">
      <div class="calendar-head"><div>Hora</div>${DAYS.map(day => `<div>${escapeHtml(day.label)}</div>`).join('')}</div>
      <div class="calendar-scroll"><div class="calendar-body"><div class="time-ruler" style="height:${height}px">${labels.join('')}</div>${columns}</div></div>
      <div class="calendar-legend teacher-calendar-legend">
        <span><i class="teacher-legend-dot class"></i>Docencia ordinaria</span>
        <span><i class="teacher-legend-dot pt"></i>PT</span>
        <span><i class="teacher-legend-dot al"></i>AL</span>
        <span><i class="teacher-legend-dot activity"></i>Actividad</span>
        <span><i class="teacher-legend-dot external"></i>Otro centro / no disponible</span>
        <span>Vista de consulta: para modificar docencia ordinaria utiliza “Horarios de aula”.</span>
      </div>
    </section>
  </div>`;

  root.querySelector('[data-teacher-calendar-select]')?.addEventListener('change', event => {
    onChangeProfessional(String(event.target.value || ''));
  });
  root.querySelector('[data-print-current-teacher]')?.addEventListener('click', () => onPrintProfessional(professionalId));
  root.querySelector('[data-print-teachers]')?.addEventListener('click', onOpenPrintManager);
}

export function renderTeacherCalendarToolbar(root, { state, selectedProfessionalId = '', onChangeProfessional, onOpenPrintManager }) {
  if (!root || root.querySelector('[data-teacher-calendar-toolbar]')) return;
  const professionals = activeProfessionals(state);
  const wrapper = document.createElement('section');
  wrapper.className = 'card teacher-calendar-toolbar';
  wrapper.dataset.teacherCalendarToolbar = 'true';
  wrapper.innerHTML = `<div class="teacher-calendar-toolbar-copy"><strong>Vista del horario</strong><small>Consulta PT/AL conjunto o el horario semanal completo de cualquier docente.</small></div>
    <div class="teacher-calendar-toolbar-actions">
      <label class="teacher-calendar-select-label"><span>Mostrar</span><select data-teacher-calendar-select>${teacherOptions(professionals, selectedProfessionalId)}</select></label>
      <button class="button" type="button" data-print-teachers>🖨 Profesorado…</button>
    </div>`;
  root.prepend(wrapper);
  wrapper.querySelector('[data-teacher-calendar-select]')?.addEventListener('change', event => onChangeProfessional(String(event.target.value || '')));
  wrapper.querySelector('[data-print-teachers]')?.addEventListener('click', onOpenPrintManager);
}

export function activeProfessionals(state) {
  return [...(state.professionals || [])]
    .filter(item => item.activo !== false)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity:'base' }));
}

function renderToolbar(professionals, selectedProfessionalId) {
  return `<section class="card teacher-calendar-toolbar" data-teacher-calendar-toolbar>
    <div class="teacher-calendar-toolbar-copy"><strong>Vista del horario</strong><small>El selector utiliza la misma cuadrícula semanal para todo el profesorado.</small></div>
    <div class="teacher-calendar-toolbar-actions">
      <label class="teacher-calendar-select-label"><span>Mostrar</span><select data-teacher-calendar-select>${teacherOptions(professionals, selectedProfessionalId)}</select></label>
      <button class="button" type="button" data-print-current-teacher>🖨 Este docente</button>
      <button class="button" type="button" data-print-teachers>🖨 Seleccionados / todos</button>
    </div>
  </section>`;
}

function teacherOptions(professionals, selectedProfessionalId) {
  return `<option value="">PT / AL · vista conjunta editable</option>${professionals.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedProfessionalId ? 'selected' : ''}>${escapeHtml(item.nombre || item.id)} · ${escapeHtml(item.tipo || 'Docente')}</option>`).join('')}`;
}

function teacherBlock(entry, calendarStart) {
  const start = timeToMinutes(entry.inicio);
  const end = timeToMinutes(entry.fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const top = (start - calendarStart) * CALENDAR_PX_PER_MINUTE;
  const height = Math.max(28, (end - start) * CALENDAR_PX_PER_MINUTE);
  const kind = allowedKind(entry.kind);
  const label = kindLabel(kind);
  return `<div class="teacher-session-block kind-${kind}" style="top:${top}px;height:${height}px" title="${escapeHtml(`${entry.inicio}–${entry.fin} · ${entry.title || label}`)}">
    <div class="teacher-session-heading"><strong>${escapeHtml(entry.title || label)}</strong><span>${escapeHtml(label)}</span></div>
    <small class="session-time">${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</small>
    ${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ''}
    ${entry.location ? `<small>${escapeHtml(entry.location)}</small>` : ''}
  </div>`;
}

function metric(label, minutes) {
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatDuration(Math.max(0, Number(minutes) || 0)))}</strong></div>`;
}

function allowedKind(value) {
  return ['class','pt','al','support','activity','external'].includes(value) ? value : 'support';
}

function kindLabel(kind) {
  if (kind === 'class') return 'Clase';
  if (kind === 'pt') return 'PT';
  if (kind === 'al') return 'AL';
  if (kind === 'activity') return 'Actividad';
  if (kind === 'external') return 'Otro centro';
  return 'Apoyo';
}
