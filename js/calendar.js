import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { classDayEntries, classEntriesForInterval, studentNamesForClass } from './class-schedules.js';
import { escapeHtml, fullName, minutesToTime, timeToMinutes } from './utils.js';

const DRAG_SNAP_MINUTES = 15;

export function renderCalendar(root, { state, serviceFilter, conflicts, selectedSessionId, onSelectSession, onEditSession, onMoveSession, onOpenClassSchedules }) {
  const groupMap = new Map(state.groups.map(group => [group.id, group]));
  const professionalMap = new Map(state.professionals.map(professional => [professional.id, professional]));
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const validSessions = state.sessions.filter(session => Number.isFinite(timeToMinutes(session.inicio)) && Number.isFinite(timeToMinutes(session.fin)));
  const minSession = Math.min(DEFAULT_CALENDAR_START, ...validSessions.map(session => timeToMinutes(session.inicio)));
  const maxSession = Math.max(DEFAULT_CALENDAR_END, ...validSessions.map(session => timeToMinutes(session.fin)));
  const start = Math.floor(minSession / 30) * 30;
  const end = Math.ceil(maxSession / 30) * 30;
  const height = (end - start) * CALENDAR_PX_PER_MINUTE;
  const labels = [];

  for (let minute = start; minute <= end; minute += 30) {
    labels.push(`<span class="time-label" style="top:${(minute - start) * CALENDAR_PX_PER_MINUTE}px">${minutesToTime(minute)}</span>`);
  }

  const conflictSessionIds = new Set(conflicts.flatMap(conflict => conflict.sessionIds));
  const columns = DAYS.map(day => {
    const blocks = state.sessions.filter(session => session.dia === day.id).map(session => {
      const group = groupMap.get(session.groupId);
      if (!group) return '';
      const top = (timeToMinutes(session.inicio) - start) * CALENDAR_PX_PER_MINUTE;
      const blockHeight = Math.max(28, (timeToMinutes(session.fin) - timeToMinutes(session.inicio)) * CALENDAR_PX_PER_MINUTE);
      const professional = professionalMap.get(session.professionalId || group.professionalId);
      const excluded = new Set(session.excludedStudentIds || []);
      const students = (group.studentIds || []).filter(id => !excluded.has(id)).map(id => fullName(studentMap.get(id))).filter(Boolean);
      const dimmed = serviceFilter !== 'ALL' && group.tipo !== serviceFilter;
      const selected = selectedSessionId === session.id;

      return `<button class="session-block ${group.tipo.toLowerCase()} ${conflictSessionIds.has(session.id) ? 'has-conflict' : ''} ${dimmed ? 'is-dimmed' : ''} ${selected ? 'is-selected' : ''}" style="top:${top}px;height:${blockHeight}px" data-session-id="${session.id}" type="button" title="Arrastrar para mover · Pulsar para consultar horario ordinario">
        <strong>${conflictSessionIds.has(session.id) ? '⚠ ' : ''}${escapeHtml(group.nombre)}</strong>
        <small class="session-time">${session.inicio}–${session.fin}</small>
        <small>${escapeHtml(professional?.nombre || 'Sin profesional')}</small>
        <small>${escapeHtml(students.join(', '))}</small>
        ${session.aula ? `<small>${escapeHtml(session.aula)}</small>` : ''}
      </button>`;
    }).join('');

    return `<div class="day-column" data-day="${day.id}" style="height:${height}px" aria-label="${day.label}">${blocks}</div>`;
  }).join('');

  root.innerHTML = `<section class="card calendar-card">
    <div class="calendar-head"><div>Hora</div>${DAYS.map(day => `<div>${day.label}</div>`).join('')}</div>
    <div class="calendar-scroll"><div class="calendar-body"><div class="time-ruler" style="height:${height}px">${labels.join('')}</div>${columns}</div></div>
    <div class="calendar-legend">
      <span><i class="legend-dot pt"></i>PT</span>
      <span><i class="legend-dot al"></i>AL</span>
      <span><i class="legend-conflict"></i>Conflicto / advertencia</span>
      <span>Pulsa una sesión para consultar las materias de sus alumnos · arrastra para moverla.</span>
    </div>
  </section>
  ${renderClassReferencePanel(state, selectedSessionId, groupMap)}`;

  let suppressClickUntil = 0;
  root.onclick = event => {
    if (Date.now() < suppressClickUntil) return;
    const editSelected = event.target.closest('[data-reference-edit]');
    const manageSchedules = event.target.closest('[data-reference-manage]');
    if (editSelected) { onEditSession(editSelected.dataset.referenceEdit); return; }
    if (manageSchedules) { onOpenClassSchedules(); return; }
    const block = event.target.closest('[data-session-id]');
    if (block) onSelectSession(block.dataset.sessionId);
  };

  const scroller = root.querySelector('.calendar-scroll');
  let drag = null;

  root.onpointerdown = event => {
    if (event.button !== 0) return;
    const block = event.target.closest('.session-block');
    if (!block) return;
    const session = state.sessions.find(item => item.id === block.dataset.sessionId);
    if (!session) return;
    const sessionStart = timeToMinutes(session.inicio);
    const sessionEnd = timeToMinutes(session.fin);
    if (!Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd) || sessionEnd <= sessionStart) return;

    drag = {
      pointerId: event.pointerId,
      block,
      session,
      duration: sessionEnd - sessionStart,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      preview: null,
      previewEl: null,
      targetColumn: null
    };
    block.setPointerCapture?.(event.pointerId);
  };

  root.onpointermove = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
    if (!drag.active && distance < 6) return;

    if (!drag.active) startDrag(drag, groupMap);
    event.preventDefault();
    autoScrollCalendar(scroller, event.clientY);

    root.querySelectorAll('.day-column.is-drop-target').forEach(column => column.classList.remove('is-drop-target'));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.day-column');
    if (!target || !root.contains(target)) {
      drag.preview = null;
      drag.targetColumn = null;
      removeDropPreview(drag);
      return;
    }

    target.classList.add('is-drop-target');
    const rect = target.getBoundingClientRect();
    const rawStart = start + (event.clientY - rect.top) / CALENDAR_PX_PER_MINUTE;
    const snappedStart = Math.round(rawStart / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES;
    const maxStart = Math.max(start, end - drag.duration);
    const nextStart = Math.min(maxStart, Math.max(start, snappedStart));
    const nextEnd = nextStart + drag.duration;
    drag.preview = {
      dia: target.dataset.day,
      inicio: minutesToTime(nextStart),
      fin: minutesToTime(nextEnd)
    };
    drag.targetColumn = target;
    renderDropPreview(drag, groupMap, state, start, nextStart);
  };

  root.onpointerup = async event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const finished = drag;
    drag = null;

    if (!finished.active) return;
    event.preventDefault();
    suppressClickUntil = Date.now() + 350;
    const preview = finished.preview;
    cleanupDrag(root, finished);

    if (!preview) return;
    const unchanged = preview.dia === finished.session.dia && preview.inicio === finished.session.inicio && preview.fin === finished.session.fin;
    if (!unchanged) await onMoveSession(finished.session.id, preview);
  };

  root.onpointercancel = () => {
    if (!drag) return;
    cleanupDrag(root, drag);
    drag = null;
  };
}

function renderClassReferencePanel(state, selectedSessionId, groupMap) {
  if (!selectedSessionId) {
    return `<section class="card class-reference-panel is-empty">
      <div><strong>Horario ordinario de referencia</strong><span>Pulsa una sesión del calendario para ver qué materias tienen sus alumnos en esa franja y durante el resto de ese día.</span></div>
    </section>`;
  }

  const session = state.sessions.find(item => item.id === selectedSessionId);
  const group = session ? groupMap.get(session.groupId) : null;
  if (!session || !group) return '';
  const excluded = new Set(session.excludedStudentIds || []);
  const studentIds = (group.studentIds || []).filter(id => !excluded.has(id));
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const classGroups = [...new Set(studentIds.map(id => studentMap.get(id)?.grupoClase?.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));

  const rows = classGroups.map(grupoClase => {
    const dayEntries = classDayEntries(state.classSchedules || [], grupoClase, session.dia);
    const overlaps = new Set(classEntriesForInterval(state.classSchedules || [], grupoClase, session.dia, session.inicio, session.fin).map(entry => entry.id));
    const names = studentNamesForClass(state, studentIds, grupoClase);
    const schedule = dayEntries.length
      ? dayEntries.map(entry => `<div class="class-subject-slot ${overlaps.has(entry.id) ? 'is-overlap' : ''}">
          <span>${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</span>
          <strong>${escapeHtml(entry.materia)}</strong>
          ${entry.aula ? `<small>${escapeHtml(entry.aula)}</small>` : ''}
        </div>`).join('')
      : `<div class="class-schedule-missing">Sin horario cargado para ${escapeHtml(dayLabel(session.dia))}.</div>`;
    return `<div class="class-reference-row">
      <div class="class-reference-meta"><strong>${escapeHtml(grupoClase)}</strong><small>${escapeHtml(names.join(', ') || 'Alumnos del grupo')}</small></div>
      <div class="class-day-strip">${schedule}</div>
    </div>`;
  }).join('');

  return `<section class="card class-reference-panel">
    <div class="class-reference-header">
      <div>
        <span class="eyebrow">Referencia del aula ordinaria</span>
        <h2>${escapeHtml(group.nombre)} · ${escapeHtml(dayLabel(session.dia))} ${escapeHtml(session.inicio)}–${escapeHtml(session.fin)}</h2>
        <small>Las materias que coinciden con la sesión aparecen destacadas. Sirven como apoyo para decidir la mejor franja; no bloquean el horario automáticamente.</small>
      </div>
      <div class="button-row">
        <button class="button" type="button" data-reference-manage>Gestionar horarios de aula</button>
        <button class="button button-primary" type="button" data-reference-edit="${session.id}">Editar sesión</button>
      </div>
    </div>
    ${classGroups.length ? `<div class="class-reference-list">${rows}</div>` : `<div class="class-schedule-missing wide">Los alumnos de esta sesión no tienen “Grupo / clase ordinaria” indicado en su ficha.</div>`}
  </section>`;
}

function startDrag(drag, groupMap) {
  drag.active = true;
  drag.block.classList.add('is-drag-source');
  const group = groupMap.get(drag.session.groupId);
  drag.block.setAttribute('aria-label', `Moviendo ${group?.nombre || 'sesión'}`);
}

function renderDropPreview(drag, groupMap, state, calendarStart, nextStart) {
  if (!drag.targetColumn || !drag.preview) return;
  const group = groupMap.get(drag.session.groupId);
  const top = (nextStart - calendarStart) * CALENDAR_PX_PER_MINUTE;
  const previewHeight = Math.max(28, drag.duration * CALENDAR_PX_PER_MINUTE);
  const classContext = candidateClassContext(state, group, drag.session, drag.preview);

  if (!drag.previewEl) {
    drag.previewEl = document.createElement('div');
    drag.previewEl.className = `calendar-drop-preview ${(group?.tipo || 'PT').toLowerCase()}`;
  }

  if (drag.previewEl.parentElement !== drag.targetColumn) drag.targetColumn.appendChild(drag.previewEl);
  drag.previewEl.style.top = `${top}px`;
  drag.previewEl.style.height = `${previewHeight}px`;
  drag.previewEl.innerHTML = `
    <strong>${escapeHtml(group?.nombre || 'Sesión')}</strong>
    <span class="drop-preview-time"><b>${drag.preview.inicio}</b><i>→</i><b>${drag.preview.fin}</b></span>
    ${classContext ? `<small class="drop-preview-context">${escapeHtml(classContext)}</small>` : ''}
  `;
}

function candidateClassContext(state, group, session, preview) {
  if (!group) return '';
  const excluded = new Set(session.excludedStudentIds || []);
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const classGroups = [...new Set((group.studentIds || [])
    .filter(id => !excluded.has(id))
    .map(id => studentMap.get(id)?.grupoClase?.trim())
    .filter(Boolean))];
  if (!classGroups.length) return 'Sin grupo ordinario indicado';

  return classGroups.map(grupoClase => {
    const entries = classEntriesForInterval(state.classSchedules || [], grupoClase, preview.dia, preview.inicio, preview.fin);
    const subjects = [...new Set(entries.map(entry => entry.materia).filter(Boolean))];
    return `${grupoClase}: ${subjects.length ? subjects.join(' / ') : 'sin horario cargado'}`;
  }).join(' · ');
}

function removeDropPreview(drag) {
  drag.previewEl?.remove();
  drag.previewEl = null;
}

function autoScrollCalendar(scroller, clientY) {
  if (!scroller) return;
  const rect = scroller.getBoundingClientRect();
  const edge = 54;
  if (clientY < rect.top + edge) scroller.scrollBy({ top: -18, behavior: 'auto' });
  if (clientY > rect.bottom - edge) scroller.scrollBy({ top: 18, behavior: 'auto' });
}

function cleanupDrag(root, drag) {
  drag.block?.classList.remove('is-drag-source');
  drag.block?.removeAttribute('aria-label');
  removeDropPreview(drag);
  root.querySelectorAll('.day-column.is-drop-target').forEach(column => column.classList.remove('is-drop-target'));
}

function dayLabel(dayId) {
  return DAYS.find(day => day.id === dayId)?.label || dayId || '';
}
