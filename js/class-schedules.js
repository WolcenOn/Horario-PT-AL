import { DAYS } from './constants.js';
import { subjectsForClassGroup } from './subjects.js';
import { escapeHtml, fullName, minutesToTime, overlapInterval, timeToMinutes, uid } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

const dayOrder = new Map(DAYS.map((day, index) => [day.id, index]));

export function renderClassSchedules(root, { state, onEdit, onDelete }) {
  const classGroups = knownClassGroups(state);
  const weeklySubjects = groupWeeklySubjects(state.classSchedules || []);
  const rows = weeklySubjects.map((item, index) => {
    const slots = item.entries.map(entry => `<span class="weekly-summary-slot"><b>${escapeHtml(shortDayLabel(entry.dia))}</b> ${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</span>`).join('');
    const teachers = [...new Set(item.entries.map(entry => entry.docente).filter(Boolean))];
    const rooms = [...new Set(item.entries.map(entry => entry.aula).filter(Boolean))];
    const searchText = `${item.grupoClase} ${item.materia} ${teachers.join(' ')} ${rooms.join(' ')} ${item.entries.map(entry => `${dayLabel(entry.dia)} ${entry.inicio} ${entry.fin}`).join(' ')}`.toLowerCase();
    return `<tr data-class-group="${escapeHtml(item.grupoClase)}" data-search-row="${escapeHtml(searchText)}">
      <td><strong>${escapeHtml(item.grupoClase)}</strong></td>
      <td><strong>${escapeHtml(item.materia)}</strong></td>
      <td><div class="weekly-summary-slots">${slots}</div></td>
      <td>${teachers.length ? escapeHtml(teachers.join(' / ')) : '—'}</td>
      <td>${rooms.length ? escapeHtml(rooms.join(' / ')) : '—'}</td>
      <td class="table-actions"><button class="button" data-edit-week="${index}" type="button">Editar semana</button><button class="button button-danger" data-delete-week="${index}" type="button">Eliminar semana</button></td>
    </tr>`;
  }).join('');

  root.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-group">
        <input id="classScheduleSearch" class="search-input" type="search" placeholder="Buscar clase, asignatura, docente…" aria-label="Buscar horarios de aula">
        <select id="classScheduleFilter" class="select-compact" aria-label="Filtrar por grupo o clase">
          <option value="">Todas las clases</option>
          ${classGroups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('')}
        </select>
      </div>
    </div>
    <section class="card">
      <div class="card-header">
        <div><h2>Horarios ordinarios por asignatura</h2><small>Cada fila reúne todas las franjas semanales de una asignatura dentro de una clase.</small></div>
        <span class="badge badge-neutral">${state.classSchedules.length} franjas · ${weeklySubjects.length} asignaturas</span>
      </div>
      <div class="class-schedule-help">
        <strong>Edición semanal</strong>
        <span>Elige una clase y una asignatura fija, y añade todas sus sesiones de lunes a viernes en una sola ventana. Puedes poner varias franjas el mismo día.</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clase</th><th>Asignatura</th><th>Franjas semanales</th><th>Docente</th><th>Aula</th><th>Acciones</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6"><div class="empty-state"><strong>No hay horarios de aula cargados</strong>Utiliza “+ Asignatura semanal” para introducir de una vez todas las franjas de una materia.</div></td></tr>`}</tbody>
      </table></div>
    </section>`;

  const search = root.querySelector('#classScheduleSearch');
  const filter = root.querySelector('#classScheduleFilter');
  const applyFilters = () => {
    const query = search?.value.trim().toLowerCase() || '';
    const classGroup = filter?.value || '';
    root.querySelectorAll('[data-search-row]').forEach(row => {
      row.hidden = Boolean((query && !row.dataset.searchRow.includes(query)) || (classGroup && row.dataset.classGroup !== classGroup));
    });
  };
  search?.addEventListener('input', applyFilters);
  filter?.addEventListener('change', applyFilters);

  root.onclick = event => {
    const edit = event.target.closest('[data-edit-week]');
    const del = event.target.closest('[data-delete-week]');
    if (edit) {
      const item = weeklySubjects[Number(edit.dataset.editWeek)];
      if (item) onEdit({ grupoClase:item.grupoClase, materia:item.materia });
    }
    if (del) {
      const item = weeklySubjects[Number(del.dataset.deleteWeek)];
      if (item) onDelete({ grupoClase:item.grupoClase, materia:item.materia, count:item.entries.length });
    }
  };
}

export function openWeeklyClassScheduleForm(selection, { state, onSave }) {
  const classGroups = knownClassGroups(state);
  const initialGroup = selection?.grupoClase || classGroups[0] || '';
  showModal({
    title: selection ? 'Editar asignatura semanal' : 'Nueva asignatura semanal',
    submitLabel: 'Guardar semana',
    bodyHtml: `<div class="weekly-schedule-editor">
      <div class="weekly-schedule-intro">
        <strong>Define toda la semana de una asignatura</strong>
        <span>Selecciona la clase y la asignatura. Después añade una o varias franjas en cada día que corresponda.</span>
      </div>
      <div class="form-grid weekly-schedule-top">
        <div class="form-field"><label for="grupoClase">Grupo / clase ordinaria *</label><select id="grupoClase" name="grupoClase" required>${classGroups.length ? classGroups.map(group => `<option value="${escapeHtml(group)}" ${group === initialGroup ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('') : '<option value="">No hay clases disponibles</option>'}</select><span class="field-hint">Las clases proceden del campo “Grupo / clase ordinaria” de los alumnos.</span></div>
        <div class="form-field"><label for="materia">Asignatura *</label><select id="materia" name="materia" required></select><span class="field-hint">Catálogo fijo según la etapa para evitar nombres duplicados o variantes.</span></div>
        <div class="form-field"><label for="docente">Docente</label><input id="docente" name="docente" placeholder="Opcional"></div>
        <div class="form-field"><label for="aula">Aula</label><input id="aula" name="aula" placeholder="Opcional"></div>
      </div>
      <div class="weekly-day-list" id="weeklyDayList">
        ${DAYS.map(day => `<section class="weekly-day-card" data-week-day="${day.id}">
          <header><div><strong>${escapeHtml(day.label)}</strong><small data-day-count>Sin franjas</small></div><button class="button button-small" type="button" data-add-week-slot="${day.id}">+ Añadir franja</button></header>
          <div class="weekly-day-slots" data-day-slots="${day.id}"></div>
        </section>`).join('')}
      </div>
      <div class="form-field"><label for="observaciones">Observaciones comunes</label><textarea id="observaciones" name="observaciones" placeholder="Opcional"></textarea></div>
    </div>`,
    onOpen: form => {
      const groupSelect = form.elements.grupoClase;
      const subjectSelect = form.elements.materia;
      let preferredSubject = selection?.materia || '';

      const addSlot = (dayId, entry = {}) => {
        const container = form.querySelector(`[data-day-slots="${dayId}"]`);
        if (!container) return;
        const existingRows = [...container.querySelectorAll('.weekly-slot-row')];
        const lastEnd = existingRows.at(-1)?.querySelector('[data-slot-end]')?.value;
        const defaultStart = entry.inicio || lastEnd || '09:00';
        const defaultEnd = entry.fin || minutesToTime(Math.min(23 * 60 + 59, timeToMinutes(defaultStart) + 45));
        const row = document.createElement('div');
        row.className = 'weekly-slot-row';
        if (entry.id) row.dataset.entryId = entry.id;
        row.innerHTML = `<input type="time" data-slot-start aria-label="${escapeHtml(dayLabel(dayId))} inicio" value="${escapeHtml(defaultStart)}"><span>→</span><input type="time" data-slot-end aria-label="${escapeHtml(dayLabel(dayId))} fin" value="${escapeHtml(defaultEnd)}"><button class="icon-button weekly-slot-remove" type="button" data-remove-week-slot aria-label="Eliminar franja">✕</button>`;
        container.appendChild(row);
        updateDayCount(form, dayId);
      };

      const loadPair = () => {
        const grupoClase = groupSelect.value;
        const materia = subjectSelect.value;
        const entries = entriesForClassSubject(state.classSchedules || [], grupoClase, materia);
        for (const day of DAYS) {
          const container = form.querySelector(`[data-day-slots="${day.id}"]`);
          if (container) container.innerHTML = '';
          entries.filter(entry => entry.dia === day.id).forEach(entry => addSlot(day.id, entry));
          updateDayCount(form, day.id);
        }
        const teachers = [...new Set(entries.map(entry => entry.docente).filter(Boolean))];
        const rooms = [...new Set(entries.map(entry => entry.aula).filter(Boolean))];
        const notes = [...new Set(entries.map(entry => entry.observaciones).filter(Boolean))];
        form.elements.docente.value = teachers.length === 1 ? teachers[0] : teachers[0] || '';
        form.elements.aula.value = rooms.length === 1 ? rooms[0] : rooms[0] || '';
        form.elements.observaciones.value = notes.length === 1 ? notes[0] : notes[0] || '';
      };

      const refreshSubjects = () => {
        const subjects = subjectsForClassGroup(state, groupSelect.value);
        subjectSelect.innerHTML = subjects.map(subject => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join('');
        if (preferredSubject && subjects.includes(preferredSubject)) subjectSelect.value = preferredSubject;
        preferredSubject = '';
        loadPair();
      };

      form.addEventListener('click', event => {
        const add = event.target.closest('[data-add-week-slot]');
        const remove = event.target.closest('[data-remove-week-slot]');
        if (add) addSlot(add.dataset.addWeekSlot);
        if (remove) {
          const row = remove.closest('.weekly-slot-row');
          const dayId = remove.closest('[data-week-day]')?.dataset.weekDay;
          row?.remove();
          if (dayId) updateDayCount(form, dayId);
        }
      });
      groupSelect.addEventListener('change', refreshSubjects);
      subjectSelect.addEventListener('change', loadPair);
      refreshSubjects();
    },
    onSubmit: async (data, form, message) => {
      const grupoClase = data.get('grupoClase')?.trim();
      const materia = data.get('materia')?.trim();
      if (!grupoClase || !materia) { setModalMessage(message, 'Selecciona una clase y una asignatura.'); return false; }
      const validSubjects = subjectsForClassGroup(state, grupoClase);
      if (!validSubjects.includes(materia)) { setModalMessage(message, 'Selecciona una asignatura válida del catálogo.'); return false; }

      const docente = data.get('docente')?.trim() || '';
      const aula = data.get('aula')?.trim() || '';
      const observaciones = data.get('observaciones')?.trim() || '';
      const entries = [];

      for (const day of DAYS) {
        const dayEntries = [];
        for (const row of form.querySelectorAll(`[data-day-slots="${day.id}"] .weekly-slot-row`)) {
          const inicio = row.querySelector('[data-slot-start]')?.value;
          const fin = row.querySelector('[data-slot-end]')?.value;
          const start = timeToMinutes(inicio);
          const end = timeToMinutes(fin);
          if (!inicio || !fin || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            setModalMessage(message, `${day.label}: revisa las horas de inicio y fin.`);
            return false;
          }
          dayEntries.push({ start, end, inicio, fin, id:row.dataset.entryId || uid('clase') });
        }
        dayEntries.sort((a, b) => a.start - b.start);
        for (let i = 0; i < dayEntries.length; i++) {
          for (let j = i + 1; j < dayEntries.length; j++) {
            if (overlapInterval(dayEntries[i].start, dayEntries[i].end, dayEntries[j].start, dayEntries[j].end)) {
              setModalMessage(message, `${day.label}: hay dos franjas de ${materia} que se solapan.`);
              return false;
            }
          }
        }
        entries.push(...dayEntries.map(entry => ({
          id:entry.id,
          grupoClase,
          materia,
          dia:day.id,
          inicio:entry.inicio,
          fin:entry.fin,
          docente,
          aula,
          observaciones
        })));
      }

      if (!entries.length) { setModalMessage(message, 'Añade al menos una franja semanal antes de guardar.'); return false; }
      await onSave({ grupoClase, materia, entries });
      return true;
    }
  });
}

export function entriesForClassSubject(entries, grupoClase, materia) {
  const normalizedGroup = normalizeClassGroup(grupoClase);
  const normalizedSubject = normalizeSubject(materia);
  return entries
    .filter(entry => normalizeClassGroup(entry.grupoClase) === normalizedGroup && normalizeSubject(entry.materia) === normalizedSubject)
    .sort((a, b) => (dayOrder.get(a.dia) ?? 99) - (dayOrder.get(b.dia) ?? 99) || timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
}

export function classEntriesForInterval(entries, grupoClase, dia, inicio, fin) {
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fin);
  if (!grupoClase || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const normalizedGroup = normalizeClassGroup(grupoClase);
  return entries
    .filter(entry => normalizeClassGroup(entry.grupoClase) === normalizedGroup && entry.dia === dia)
    .filter(entry => overlapInterval(start, end, timeToMinutes(entry.inicio), timeToMinutes(entry.fin)))
    .sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
}

export function classDayEntries(entries, grupoClase, dia) {
  const normalizedGroup = normalizeClassGroup(grupoClase);
  return entries
    .filter(entry => normalizeClassGroup(entry.grupoClase) === normalizedGroup && entry.dia === dia)
    .sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
}

export function studentNamesForClass(state, studentIds, grupoClase) {
  const wanted = new Set(studentIds || []);
  return state.students
    .filter(student => wanted.has(student.id) && normalizeClassGroup(student.grupoClase) === normalizeClassGroup(grupoClase))
    .map(fullName)
    .filter(Boolean);
}

export function knownClassGroups(state) {
  return [...new Set([
    ...(state.students || []).map(student => student.grupoClase?.trim()).filter(Boolean),
    ...(state.classSchedules || []).map(entry => entry.grupoClase?.trim()).filter(Boolean)
  ])].sort(classGroupCompare);
}

function groupWeeklySubjects(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = `${normalizeClassGroup(entry.grupoClase)}\u0000${normalizeSubject(entry.materia)}`;
    if (!groups.has(key)) groups.set(key, { grupoClase:entry.grupoClase, materia:entry.materia, entries:[] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()]
    .map(item => ({ ...item, entries:entriesForClassSubject(item.entries, item.grupoClase, item.materia) }))
    .sort((a, b) => classGroupCompare(a.grupoClase, b.grupoClase) || a.materia.localeCompare(b.materia, 'es', { sensitivity:'base' }));
}

function updateDayCount(form, dayId) {
  const day = form.querySelector(`[data-week-day="${dayId}"]`);
  const count = day?.querySelectorAll('.weekly-slot-row').length || 0;
  const label = day?.querySelector('[data-day-count]');
  if (label) label.textContent = count ? `${count} franja${count === 1 ? '' : 's'}` : 'Sin franjas';
}

function normalizeClassGroup(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function normalizeSubject(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function classGroupCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function dayLabel(dayId) {
  return DAYS.find(day => day.id === dayId)?.label || dayId || '—';
}

function shortDayLabel(dayId) {
  return dayLabel(dayId).slice(0, 3);
}
