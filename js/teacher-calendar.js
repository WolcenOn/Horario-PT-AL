import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { buildProfessionalSchedule } from './professional-schedule.js';
import { escapeHtml, formatDuration, minutesToTime, timeToMinutes } from './utils.js';

export function renderTeacherCalendar(root, options) {
  const {
    state,
    onOpenPrintManager
  } = options;
  const professionalIds = normalizeTeacherSelection(options.professionalIds || [options.professionalId]);
  const models = professionalIds.map(id => buildProfessionalSchedule(state, id)).filter(Boolean);
  if (!models.length) {
    root.innerHTML = '<section class="card"><div class="empty-state"><strong>Docente no encontrado</strong>Selecciona otro profesional.</div></section>';
    return;
  }

  const professionals = activeProfessionals(state);
  const entries = models.flatMap(model => model.entries)
    .filter(item => Number.isFinite(timeToMinutes(item.inicio)) && Number.isFinite(timeToMinutes(item.fin)));
  const start = Math.floor(Math.min(DEFAULT_CALENDAR_START, ...entries.map(item => timeToMinutes(item.inicio))) / 30) * 30;
  const end = Math.ceil(Math.max(DEFAULT_CALENDAR_END, ...entries.map(item => timeToMinutes(item.fin))) / 30) * 30;
  const height = (end - start) * CALENDAR_PX_PER_MINUTE;
  const labels = [];
  for (let minute = start; minute <= end; minute += 30) {
    labels.push(`<span class="time-label" style="top:${(minute - start) * CALENDAR_PX_PER_MINUTE}px">${minutesToTime(minute)}</span>`);
  }

  const columns = DAYS.map(day => {
    const guides = laneGuides(models.length, height);
    const blocks = models.map((model, laneIndex) => (model.byDay[day.id] || [])
      .map(entry => teacherBlock(entry, start, {
        laneIndex,
        laneCount:models.length,
        professional:model.professional
      }))
      .join('')).join('');
    return `<div class="day-column teacher-day-column ${models.length > 1 ? 'is-comparison' : ''}" data-day="${day.id}" style="height:${height}px" aria-label="${escapeHtml(day.label)}">${guides}${blocks}</div>`;
  }).join('');

  root.innerHTML = `<div class="teacher-calendar-view" data-professional-ids="${escapeHtml(professionalIds.join('|'))}">
    ${renderToolbar(professionals, professionalIds)}
    ${renderSummary(models)}
    <section class="card calendar-card teacher-calendar-card">
      ${models.length > 1 ? renderComparisonKey(models) : ''}
      <div class="calendar-head"><div>Hora</div>${DAYS.map(day => `<div>${escapeHtml(day.label)}</div>`).join('')}</div>
      <div class="calendar-scroll"><div class="calendar-body"><div class="time-ruler" style="height:${height}px">${labels.join('')}</div>${columns}</div></div>
      <div class="calendar-legend teacher-calendar-legend">
        <span><i class="teacher-legend-dot class"></i>Docencia ordinaria</span>
        <span><i class="teacher-legend-dot pt"></i>PT</span>
        <span><i class="teacher-legend-dot al"></i>AL</span>
        <span><i class="teacher-legend-dot activity"></i>Actividad</span>
        <span><i class="teacher-legend-dot external"></i>Otro centro / no disponible</span>
        <span>${models.length > 1 ? 'Comparación: cada docente ocupa un carril vertical propio dentro de cada día.' : 'Vista de consulta: para modificar docencia ordinaria utiliza “Horarios de aula”.'}</span>
      </div>
    </section>
  </div>`;

  bindToolbar(root, professionalIds, {
    onChangeProfessionals:options.onChangeProfessionals || (ids => options.onChangeProfessional?.(ids[0] || '')),
    onPrintProfessionals:options.onPrintProfessionals || (ids => options.onPrintProfessional?.(ids[0])),
    onOpenPrintManager
  });
}

export function renderTeacherCalendarToolbar(root, options) {
  if (!root || root.querySelector('[data-teacher-calendar-toolbar]')) return;
  const professionals = activeProfessionals(options.state);
  const selected = normalizeTeacherSelection(options.selectedProfessionalIds || [options.selectedProfessionalId]);
  const wrapper = document.createElement('section');
  wrapper.className = 'card teacher-calendar-toolbar';
  wrapper.dataset.teacherCalendarToolbar = 'true';
  wrapper.innerHTML = toolbarContents(professionals, selected, false);
  root.prepend(wrapper);
  bindToolbar(wrapper, selected, {
    onChangeProfessionals:options.onChangeProfessionals || (ids => options.onChangeProfessional?.(ids[0] || '')),
    onPrintProfessionals:options.onPrintProfessionals || (ids => options.onPrintProfessional?.(ids[0])),
    onOpenPrintManager:options.onOpenPrintManager
  });
}

export function activeProfessionals(state) {
  return [...(state.professionals || [])]
    .filter(item => item.activo !== false)
    .sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity:'base' }));
}

export function normalizeTeacherSelection(values) {
  const result = [];
  for (const value of values || []) {
    const id = String(value || '').trim();
    if (!id || result.includes(id)) continue;
    result.push(id);
    if (result.length === 2) break;
  }
  return result;
}

function renderToolbar(professionals, selected) {
  return `<section class="card teacher-calendar-toolbar" data-teacher-calendar-toolbar>${toolbarContents(professionals, selected, true)}</section>`;
}

function toolbarContents(professionals, selected, includeCurrentPrint) {
  const primary = selected[0] || '';
  const secondary = selected[1] || '';
  return `<div class="teacher-calendar-toolbar-copy"><strong>Vista del horario</strong><small>Selecciona un docente y, si quieres comparar, añade un segundo. Sus bloques se muestran lado a lado, nunca por transparencia.</small></div>
    <div class="teacher-calendar-toolbar-actions">
      <label class="teacher-calendar-select-label"><span>Docente 1</span><select data-teacher-calendar-select>${primaryOptions(professionals, primary)}</select></label>
      <label class="teacher-calendar-select-label teacher-calendar-compare-label"><span>Comparar con</span><select data-teacher-calendar-compare ${primary ? '' : 'disabled'}>${comparisonOptions(professionals, primary, secondary)}</select></label>
      ${includeCurrentPrint ? '<button class="button" type="button" data-print-current-teacher>🖨 Mostrados</button>' : ''}
      <button class="button" type="button" data-print-teachers>🖨 Profesorado…</button>
    </div>`;
}

function bindToolbar(root, selected, { onChangeProfessionals, onPrintProfessionals, onOpenPrintManager }) {
  const primary = root.querySelector('[data-teacher-calendar-select]');
  const secondary = root.querySelector('[data-teacher-calendar-compare]');
  const emit = () => {
    const first = String(primary?.value || '');
    if (!first) {
      onChangeProfessionals?.([]);
      return;
    }
    const second = String(secondary?.value || '');
    onChangeProfessionals?.(normalizeTeacherSelection([first, second]));
  };
  primary?.addEventListener('change', emit);
  secondary?.addEventListener('change', emit);
  root.querySelector('[data-print-current-teacher]')?.addEventListener('click', () => onPrintProfessionals?.(selected));
  root.querySelector('[data-print-teachers]')?.addEventListener('click', onOpenPrintManager);
}

function primaryOptions(professionals, selectedId) {
  return `<option value="">PT / AL · vista conjunta editable</option>${professionals.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.nombre || item.id)} · ${escapeHtml(item.tipo || 'Docente')}</option>`).join('')}`;
}

function comparisonOptions(professionals, primaryId, selectedId) {
  return `<option value="">Sin comparación</option>${professionals.filter(item => item.id !== primaryId).map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? 'selected' : ''}>${escapeHtml(item.nombre || item.id)} · ${escapeHtml(item.tipo || 'Docente')}</option>`).join('')}`;
}

function renderSummary(models) {
  if (models.length === 1) {
    const model = models[0];
    return `<section class="teacher-calendar-summary card">
      <div><span class="eyebrow">Horario individual</span><h2>${escapeHtml(model.professional.nombre || 'Docente')}</h2><p>${escapeHtml(model.professional.especialidad || model.professional.tipo || 'Profesorado')} · Tutoría: <strong>${escapeHtml(model.professional.tutoriaGrupo || '—')}</strong></p></div>
      <div class="teacher-calendar-metrics">
        ${metric('Docencia', model.metrics.ordinaryMinutes)}
        ${metric('PT/AL/apoyo', model.metrics.supportMinutes)}
        ${metric('Actividades', model.metrics.activityMinutes)}
        ${metric('Carga modelada', model.metrics.modeledMinutes)}
      </div>
    </section>`;
  }

  return `<section class="card teacher-comparison-summary"><div class="card-header"><div><span class="eyebrow">Comparación semanal</span><h2>${models.length} docentes lado a lado</h2><small>La geometría horizontal es estable durante toda la semana: izquierda = Docente 1, derecha = Docente 2.</small></div></div><div class="teacher-comparison-summary-grid">${models.map((model, index) => `<article><span class="teacher-lane-badge">${index + 1}</span><div><strong>${escapeHtml(model.professional.nombre || 'Docente')}</strong><small>${escapeHtml(model.professional.especialidad || model.professional.tipo || 'Profesorado')}</small></div><b>${escapeHtml(formatDuration(model.metrics.modeledMinutes))}</b></article>`).join('')}</div></section>`;
}

function renderComparisonKey(models) {
  return `<div class="teacher-comparison-key" aria-label="Orden de docentes comparados">${models.map((model, index) => `<span><i>${index + 1}</i><strong>${escapeHtml(model.professional.nombre || `Docente ${index + 1}`)}</strong></span>`).join('')}</div>`;
}

function laneGuides(count, height) {
  if (count <= 1) return '';
  return Array.from({ length:count - 1 }, (_, index) => {
    const left = ((index + 1) / count) * 100;
    return `<span class="teacher-lane-divider" aria-hidden="true" style="left:${left}%;height:${height}px"></span>`;
  }).join('');
}

function teacherBlock(entry, calendarStart, { laneIndex, laneCount, professional }) {
  const start = timeToMinutes(entry.inicio);
  const end = timeToMinutes(entry.fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const top = (start - calendarStart) * CALENDAR_PX_PER_MINUTE;
  const height = Math.max(28, (end - start) * CALENDAR_PX_PER_MINUTE);
  const kind = allowedKind(entry.kind);
  const label = kindLabel(kind);
  const laneWidth = 100 / Math.max(1, laneCount);
  const left = laneIndex * laneWidth;
  const horizontalStyle = laneCount > 1
    ? `left:calc(${left}% + 3px);width:calc(${laneWidth}% - 6px);right:auto;`
    : 'left:4px;right:4px;';
  return `<div class="teacher-session-block kind-${kind}" data-professional-id="${escapeHtml(professional.id)}" style="top:${top}px;height:${height}px;${horizontalStyle}" title="${escapeHtml(`${professional.nombre || ''} · ${entry.inicio}–${entry.fin} · ${entry.title || label}`)}">
    <div class="teacher-session-heading"><strong>${escapeHtml(entry.title || label)}</strong><span>${escapeHtml(label)}</span></div>
    ${laneCount > 1 ? `<small class="teacher-session-professional">${escapeHtml(professional.nombre || 'Docente')}</small>` : ''}
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
