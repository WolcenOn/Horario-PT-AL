import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { escapeHtml, fullName, minutesToTime, timeToMinutes } from './utils.js';

const DRAG_SNAP_MINUTES = 15;

export function renderCalendar(root, { state, serviceFilter, conflicts, onEditSession, onMoveSession }) {
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

      return `<button class="session-block ${group.tipo.toLowerCase()} ${conflictSessionIds.has(session.id) ? 'has-conflict' : ''} ${dimmed ? 'is-dimmed' : ''}" style="top:${top}px;height:${blockHeight}px" data-session-id="${session.id}" type="button" title="Arrastrar para mover · Pulsar para editar ${escapeHtml(group.nombre)}">
        <strong>${conflictSessionIds.has(session.id) ? '⚠ ' : ''}${escapeHtml(group.nombre)}</strong>
        <small>${session.inicio}–${session.fin} · ${escapeHtml(professional?.nombre || 'Sin profesional')}</small>
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
      <span>Arrastra una sesión para cambiarla de día u hora · ajuste de 15 min.</span>
    </div>
  </section>`;

  let suppressClickUntil = 0;
  root.onclick = event => {
    if (Date.now() < suppressClickUntil) return;
    const block = event.target.closest('[data-session-id]');
    if (block) onEditSession(block.dataset.sessionId);
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
      startX: event.clientX,
      startY: event.clientY,
      duration: sessionEnd - sessionStart,
      active: false,
      preview: null,
      ghost: null
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
    positionGhost(drag.ghost, event.clientX, event.clientY);

    root.querySelectorAll('.day-column.is-drop-target').forEach(column => column.classList.remove('is-drop-target'));
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.day-column');
    if (!target || !root.contains(target)) {
      drag.preview = null;
      updateGhostTime(drag.ghost, null);
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
    updateGhostTime(drag.ghost, drag.preview);
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

function startDrag(drag, groupMap) {
  drag.active = true;
  drag.block.classList.add('is-drag-source');
  const group = groupMap.get(drag.session.groupId);
  const ghost = document.createElement('div');
  ghost.className = `calendar-drag-ghost ${(group?.tipo || 'PT').toLowerCase()}`;
  ghost.innerHTML = `<strong>${escapeHtml(group?.nombre || 'Sesión')}</strong><small data-drag-time>${drag.session.inicio}–${drag.session.fin}</small>`;
  document.body.appendChild(ghost);
  drag.ghost = ghost;
}

function positionGhost(ghost, clientX, clientY) {
  if (!ghost) return;
  ghost.style.left = `${Math.min(window.innerWidth - 200, Math.max(8, clientX + 14))}px`;
  ghost.style.top = `${Math.min(window.innerHeight - 80, Math.max(8, clientY + 14))}px`;
}

function updateGhostTime(ghost, preview) {
  const label = ghost?.querySelector('[data-drag-time]');
  if (!label) return;
  label.textContent = preview ? `${preview.inicio}–${preview.fin}` : 'Suelta sobre un día del calendario';
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
  drag.ghost?.remove();
  root.querySelectorAll('.day-column.is-drop-target').forEach(column => column.classList.remove('is-drop-target'));
}
