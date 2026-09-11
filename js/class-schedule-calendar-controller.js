import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { configuredClassGroups, courseForClassGroup, recessForStage, stageForCourse } from './education.js';
import { buildClassWeekOverview } from './class-week-overview.js';
import { loadState } from './repository.js';
import { escapeHtml, minutesToTime, timeToMinutes } from './utils.js';

const root = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const MODE_KEY = 'horario-class-schedule-view';
const GROUP_KEY = 'horario-class-schedule-group';
let mode = localStorage.getItem(MODE_KEY) === 'calendar' ? 'calendar' : 'list';
let enhancing = false;

const observer = new MutationObserver(() => {
  if (enhancing || pageTitle?.textContent !== 'Horarios de aula') return;
  enhancing = true;
  queueMicrotask(async () => {
    try {
      await enhanceClassSchedules();
    } finally {
      enhancing = false;
    }
  });
});
observer.observe(root, { childList:true, subtree:true });

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view-class-week]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const group = String(button.dataset.viewClassWeek || '').trim();
  if (group) localStorage.setItem(GROUP_KEY, group);
  mode = 'calendar';
  localStorage.setItem(MODE_KEY, mode);
  void loadState().then(renderCalendarView);
}, true);

document.addEventListener('click', event => {
  const nav = event.target.closest?.('[data-view="classSchedules"]');
  if (!nav) return;
  setTimeout(() => void enhanceClassSchedules(), 0);
}, true);

setTimeout(() => void enhanceClassSchedules(), 0);

async function enhanceClassSchedules() {
  if (pageTitle?.textContent !== 'Horarios de aula') return;
  if (mode === 'calendar') {
    if (root.querySelector('.class-schedule-calendar-view')) return;
    const state = await loadState();
    renderCalendarView(state);
    return;
  }
  injectListSwitcher();
}

function injectListSwitcher() {
  if (root.querySelector('[data-class-schedule-view-switcher]')) return;
  const switcher = document.createElement('section');
  switcher.className = 'card class-schedule-view-switcher';
  switcher.dataset.classScheduleViewSwitcher = 'true';
  switcher.innerHTML = `<div>
      <strong>Vista de horarios de aula</strong>
      <small>Alterna entre el listado editable por asignatura y una cuadrícula semanal por clase.</small>
    </div>
    <div class="segmented-control" role="group" aria-label="Vista de horarios de aula">
      <button class="is-active" type="button" data-class-schedule-mode="list">Listado</button>
      <button type="button" data-class-schedule-mode="calendar">Vista semanal</button>
    </div>`;
  root.prepend(switcher);
  switcher.querySelector('[data-class-schedule-mode="calendar"]')?.addEventListener('click', async () => {
    mode = 'calendar';
    localStorage.setItem(MODE_KEY, mode);
    const state = await loadState();
    renderCalendarView(state);
  });
}

function renderCalendarView(state) {
  const groups = classGroupsForState(state);
  let selectedGroup = localStorage.getItem(GROUP_KEY) || groups[0] || '';
  if (!groups.includes(selectedGroup)) selectedGroup = groups[0] || '';
  if (selectedGroup) localStorage.setItem(GROUP_KEY, selectedGroup);

  const entries = (state.classSchedules || [])
    .filter(item => item.grupoClase === selectedGroup)
    .filter(item => Number.isFinite(timeToMinutes(item.inicio)) && Number.isFinite(timeToMinutes(item.fin)));
  const recess = recessForClass(state, selectedGroup);
  const bounds = calendarBounds(entries, recess);
  const height = (bounds.end - bounds.start) * CALENDAR_PX_PER_MINUTE;
  const professionalMap = new Map((state.professionals || []).map(item => [item.id, item]));
  const overview = selectedGroup ? buildClassWeekOverview(state, selectedGroup) : null;
  const labels = [];
  for (let minute = bounds.start; minute <= bounds.end; minute += 30) {
    labels.push(`<span class="time-label" style="top:${(minute - bounds.start) * CALENDAR_PX_PER_MINUTE}px">${minutesToTime(minute)}</span>`);
  }

  const columns = DAYS.map(day => {
    const dayEntries = entries
      .filter(item => item.dia === day.id)
      .sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
    const recessBand = recess ? renderRecessBand(recess, bounds.start) : '';
    const blocks = dayEntries.map(entry => renderClassBlock(entry, bounds.start, professionalMap)).join('');
    return `<div class="day-column class-schedule-day-column" data-day="${day.id}" style="height:${height}px" aria-label="${escapeHtml(day.label)}">${recessBand}${blocks}</div>`;
  }).join('');

  root.innerHTML = `<div class="class-schedule-calendar-view">
    <section class="card class-schedule-view-switcher">
      <div>
        <strong>Vista de horarios de aula</strong>
        <small>La cuadrícula muestra una clase completa de lunes a viernes, el recreo y los huecos libres de la jornada.</small>
      </div>
      <div class="segmented-control" role="group" aria-label="Vista de horarios de aula">
        <button type="button" data-class-schedule-mode="list">Listado</button>
        <button class="is-active" type="button" data-class-schedule-mode="calendar">Vista semanal</button>
      </div>
    </section>
    <section class="card class-schedule-calendar-toolbar">
      <label><span>Clase / grupo</span><select data-class-schedule-calendar-group>${groups.map(group => `<option value="${escapeHtml(group)}" ${group === selectedGroup ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}</select></label>
      <div class="class-schedule-calendar-stats">
        <span><strong>${entries.length}</strong> franjas</span>
        <span><strong>${new Set(entries.map(item => item.materia).filter(Boolean)).size}</strong> asignaturas</span>
      </div>
    </section>
    ${selectedGroup ? `<section class="card calendar-card class-schedule-calendar-card">
      <div class="class-schedule-calendar-heading"><div><span class="eyebrow">Horario ordinario semanal</span><h2>${escapeHtml(selectedGroup)}</h2></div>${recess ? `<span class="badge badge-neutral">Recreo ${escapeHtml(recess.inicio)}–${escapeHtml(recess.fin)}</span>` : ''}</div>
      ${entries.length ? '' : '<div class="class-schedule-calendar-empty"><strong>Clase todavía sin franjas ordinarias</strong><span>Puedes conservar esta vista mientras completas el horario desde “Listado”.</span></div>'}
      <div class="calendar-head"><div>Hora</div>${DAYS.map(day => `<div>${escapeHtml(day.label)}</div>`).join('')}</div>
      <div class="calendar-scroll"><div class="calendar-body"><div class="time-ruler" style="height:${height}px">${labels.join('')}</div>${columns}</div></div>
      <div class="calendar-legend class-schedule-calendar-legend"><span><i class="teacher-legend-dot class"></i>Asignatura / docencia ordinaria</span><span><i class="class-schedule-recess-dot"></i>Recreo</span><span>Pulsa un bloque para editar esa asignatura semanal en el listado.</span></div>
    </section>
    ${overview ? renderGapSummary(overview) : ''}` : `<section class="card"><div class="empty-state"><strong>No hay clases disponibles</strong>Configura primero la estructura del centro o añade alumnado con su grupo-clase ordinario.</div></section>`}
  </div>`;

  root.querySelector('[data-class-schedule-mode="list"]')?.addEventListener('click', showListView);
  root.querySelector('[data-class-schedule-calendar-group]')?.addEventListener('change', async event => {
    const value = String(event.target.value || '');
    if (value) localStorage.setItem(GROUP_KEY, value);
    const next = await loadState();
    renderCalendarView(next);
  });
  root.querySelectorAll('[data-class-schedule-entry]').forEach(block => block.addEventListener('click', () => {
    openEntryInList(block.dataset.classScheduleEntry);
  }));
}

function renderGapSummary(overview) {
  return `<section class="card class-schedule-gap-card" data-class-schedule-gaps>
    <div class="card-header"><div><h2>Huecos libres de la jornada</h2><small>Se calculan a partir de ${escapeHtml(overview.startLabel)}–${escapeHtml(overview.endLabel)}, descontando materias y recreo.</small></div></div>
    <div class="class-schedule-gap-grid">${overview.days.map(day => `<article><strong>${escapeHtml(day.label)}</strong>${day.gaps.length ? day.gaps.map(gap => `<span>Libre ${escapeHtml(gap.inicio)}–${escapeHtml(gap.fin)} <b>${gap.minutes} min</b></span>`).join('') : '<span class="is-complete">Sin huecos libres</span>'}</article>`).join('')}</div>
  </section>`;
}

function showListView() {
  mode = 'list';
  localStorage.setItem(MODE_KEY, mode);
  document.querySelector('[data-view="classSchedules"]')?.click();
}

function openEntryInList(entryId) {
  mode = 'list';
  localStorage.setItem(MODE_KEY, mode);
  document.querySelector('[data-view="classSchedules"]')?.click();
  setTimeout(() => {
    root.querySelector(`[data-edit-week="${cssEscape(entryId)}"]`)?.click();
  }, 0);
}

function classGroupsForState(state) {
  const configured = configuredClassGroups(state.schoolSettings);
  const scheduled = (state.classSchedules || [])
    .map(item => String(item.grupoClase || '').trim())
    .filter(Boolean);
  const enrolled = (state.students || [])
    .filter(item => item.activo !== false)
    .map(item => String(item.grupoClase || '').trim())
    .filter(Boolean);
  return [...new Set([...configured, ...scheduled, ...enrolled])].sort(compareClassGroups);
}

function compareClassGroups(a, b) {
  return a.localeCompare(b, 'es', { numeric:true, sensitivity:'base' });
}

function recessForClass(state, group) {
  const course = courseForClassGroup(state.schoolSettings, group)
    || (state.students || []).find(item => item.grupoClase === group)?.curso
    || '';
  return recessForStage(state.schoolSettings, stageForCourse(course));
}

function calendarBounds(entries, recess) {
  const starts = entries.map(item => timeToMinutes(item.inicio)).filter(Number.isFinite);
  const ends = entries.map(item => timeToMinutes(item.fin)).filter(Number.isFinite);
  if (recess) {
    starts.push(timeToMinutes(recess.inicio));
    ends.push(timeToMinutes(recess.fin));
  }
  const min = Math.min(DEFAULT_CALENDAR_START, ...starts);
  const max = Math.max(DEFAULT_CALENDAR_END, ...ends);
  return {
    start:Math.floor(min / 30) * 30,
    end:Math.ceil(max / 30) * 30
  };
}

function renderRecessBand(recess, calendarStart) {
  const start = timeToMinutes(recess.inicio);
  const end = timeToMinutes(recess.fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const top = (start - calendarStart) * CALENDAR_PX_PER_MINUTE;
  const height = Math.max(24, (end - start) * CALENDAR_PX_PER_MINUTE);
  return `<div class="class-schedule-recess-band" style="top:${top}px;height:${height}px"><span>Recreo</span></div>`;
}

function renderClassBlock(entry, calendarStart, professionalMap) {
  const start = timeToMinutes(entry.inicio);
  const end = timeToMinutes(entry.fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '';
  const top = (start - calendarStart) * CALENDAR_PX_PER_MINUTE;
  const height = Math.max(28, (end - start) * CALENDAR_PX_PER_MINUTE);
  const teacher = professionalMap.get(entry.professionalId)?.nombre || entry.docente || 'Sin docente enlazado';
  return `<button class="class-schedule-calendar-block" data-class-schedule-entry="${escapeHtml(entry.id)}" type="button" style="top:${top}px;height:${height}px" title="Editar ${escapeHtml(entry.materia || 'asignatura')}">
    <strong>${escapeHtml(entry.materia || 'Asignatura')}</strong>
    <small class="session-time">${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</small>
    <small>${escapeHtml(teacher)}</small>
    ${entry.aula ? `<small>${escapeHtml(entry.aula)}</small>` : ''}
  </button>`;
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value || ''));
  return String(value || '').replace(/["\\]/g, '\\$&');
}
