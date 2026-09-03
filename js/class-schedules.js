import { DAYS } from './constants.js';
import { escapeHtml, fullName, overlapInterval, timeToMinutes, uid } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

const dayOrder = new Map(DAYS.map((day, index) => [day.id, index]));

export function renderClassSchedules(root, { state, onEdit, onDelete }) {
  const classGroups = knownClassGroups(state);
  const rows = [...state.classSchedules]
    .sort((a, b) => classGroupCompare(a.grupoClase, b.grupoClase) || (dayOrder.get(a.dia) ?? 99) - (dayOrder.get(b.dia) ?? 99) || timeToMinutes(a.inicio) - timeToMinutes(b.inicio))
    .map(entry => `<tr data-class-group="${escapeHtml(entry.grupoClase)}" data-search-row="${escapeHtml(`${entry.grupoClase} ${dayLabel(entry.dia)} ${entry.inicio} ${entry.fin} ${entry.materia} ${entry.docente || ''} ${entry.aula || ''}`.toLowerCase())}">
      <td><strong>${escapeHtml(entry.grupoClase)}</strong></td>
      <td>${escapeHtml(dayLabel(entry.dia))}</td>
      <td><strong>${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</strong></td>
      <td>${escapeHtml(entry.materia || '—')}</td>
      <td>${escapeHtml(entry.docente || '—')}</td>
      <td>${escapeHtml(entry.aula || '—')}</td>
      <td class="table-actions"><button class="button" data-edit-class-schedule="${entry.id}" type="button">Editar</button><button class="button button-danger" data-delete-class-schedule="${entry.id}" type="button">Eliminar</button></td>
    </tr>`).join('');

  root.innerHTML = `
    <div class="toolbar">
      <div class="toolbar-group">
        <input id="classScheduleSearch" class="search-input" type="search" placeholder="Buscar clase, materia, docente…" aria-label="Buscar horarios de aula">
        <select id="classScheduleFilter" class="select-compact" aria-label="Filtrar por grupo o clase">
          <option value="">Todas las clases</option>
          ${classGroups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('')}
        </select>
      </div>
    </div>
    <section class="card">
      <div class="card-header">
        <div><h2>Horarios ordinarios de las clases</h2><small>Estas materias se usan como referencia al seleccionar o mover una sesión PT/AL. No generan conflictos automáticos.</small></div>
        <span class="badge badge-neutral">${state.classSchedules.length} franjas</span>
      </div>
      <div class="class-schedule-help">
        <strong>Cómo se relaciona con los alumnos</strong>
        <span>La clave es el campo “Grupo / clase ordinaria” de cada alumno (por ejemplo, 4ºA). Escribe aquí exactamente ese mismo grupo.</span>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Clase</th><th>Día</th><th>Hora</th><th>Materia</th><th>Docente</th><th>Aula</th><th>Acciones</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7"><div class="empty-state"><strong>No hay horarios de aula cargados</strong>Añade las franjas de cada clase para ver sus materias desde el calendario PT/AL.</div></td></tr>`}</tbody>
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
    const edit = event.target.closest('[data-edit-class-schedule]');
    const del = event.target.closest('[data-delete-class-schedule]');
    if (edit) onEdit(edit.dataset.editClassSchedule);
    if (del) onDelete(del.dataset.deleteClassSchedule);
  };
}

export function openClassScheduleForm(entry, { state, onSave }) {
  const current = entry || { dia: 'lunes', inicio: '09:00', fin: '09:45' };
  const classGroups = knownClassGroups(state);
  showModal({
    title: entry ? 'Editar horario de aula' : 'Nueva franja de aula',
    bodyHtml: `<div class="form-grid">
      <div class="form-field full"><label for="grupoClase">Grupo / clase ordinaria *</label><input id="grupoClase" name="grupoClase" list="knownClassGroups" required value="${escapeHtml(current.grupoClase || '')}" placeholder="4ºA"><datalist id="knownClassGroups">${classGroups.map(group => `<option value="${escapeHtml(group)}"></option>`).join('')}</datalist><span class="field-hint">Debe coincidir con el grupo indicado en la ficha del alumno.</span></div>
      <div class="form-field"><label for="dia">Día *</label><select id="dia" name="dia">${DAYS.map(day => `<option value="${day.id}" ${current.dia === day.id ? 'selected' : ''}>${day.label}</option>`).join('')}</select></div>
      <div class="form-field"><label for="materia">Materia *</label><input id="materia" name="materia" required value="${escapeHtml(current.materia || '')}" placeholder="Matemáticas"></div>
      <div class="form-field"><label for="inicio">Inicio *</label><input id="inicio" name="inicio" type="time" required value="${escapeHtml(current.inicio || '09:00')}"></div>
      <div class="form-field"><label for="fin">Fin *</label><input id="fin" name="fin" type="time" required value="${escapeHtml(current.fin || '09:45')}"></div>
      <div class="form-field"><label for="docente">Docente</label><input id="docente" name="docente" value="${escapeHtml(current.docente || '')}"></div>
      <div class="form-field"><label for="aula">Aula</label><input id="aula" name="aula" value="${escapeHtml(current.aula || '')}"></div>
      <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
    </div>`,
    onSubmit: async (data, form, message) => {
      const grupoClase = data.get('grupoClase')?.trim();
      const materia = data.get('materia')?.trim();
      const dia = data.get('dia');
      const inicio = data.get('inicio');
      const fin = data.get('fin');
      const start = timeToMinutes(inicio);
      const end = timeToMinutes(fin);
      if (!grupoClase || !materia) { setModalMessage(message, 'Grupo/clase y materia son obligatorios.'); return false; }
      if (!DAYS.some(day => day.id === dia)) { setModalMessage(message, 'Selecciona un día válido.'); return false; }
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) { setModalMessage(message, 'La hora de fin debe ser posterior a la hora de inicio.'); return false; }
      await onSave({
        ...current,
        id: current.id || uid('clase'),
        grupoClase,
        dia,
        inicio,
        fin,
        materia,
        docente: data.get('docente')?.trim() || '',
        aula: data.get('aula')?.trim() || '',
        observaciones: data.get('observaciones')?.trim() || ''
      });
      return true;
    }
  });
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

function normalizeClassGroup(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function classGroupCompare(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'es', { numeric: true, sensitivity: 'base' });
}

function dayLabel(dayId) {
  return DAYS.find(day => day.id === dayId)?.label || dayId || '—';
}
