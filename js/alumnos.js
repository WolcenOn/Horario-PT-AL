import { deriveStudentStatus } from './hours.js';
import { escapeHtml, fullName, minutesParts, targetFromParts, uid, formatDuration } from './utils.js';
import { showModal, setModalMessage } from './ui.js';

export function renderStudents(root, { state, hoursMap, conflictStudentIds, onEdit, onDelete }) {
  const rows = [...state.students].sort((a,b) => fullName(a).localeCompare(fullName(b), 'es')).map(student => {
    const h = hoursMap.get(student.id) || { ptTarget:0,ptAssigned:0,ptPending:0,alTarget:0,alAssigned:0,alPending:0 };
    const status = deriveStudentStatus(h, conflictStudentIds.has(student.id));
    return `<tr data-search-row="${escapeHtml(`${fullName(student)} ${student.curso} ${student.grupoClase} ${status}`.toLowerCase())}">
      <td class="name-cell"><strong>${escapeHtml(fullName(student))}</strong><small>${escapeHtml(student.grupoClase || '')} · ${escapeHtml(student.tutor || 'Sin tutor')}</small></td>
      <td>${escapeHtml(student.curso || '—')}</td>
      <td>${formatDuration(h.ptTarget)}</td><td>${formatDuration(h.ptAssigned)}</td><td>${pendingCell(h.ptPending)}</td>
      <td>${formatDuration(h.alTarget)}</td><td>${formatDuration(h.alAssigned)}</td><td>${pendingCell(h.alPending)}</td>
      <td>${statusBadge(status)}</td>
      <td class="table-actions"><button class="button" data-edit="${student.id}" type="button">Editar</button><button class="button button-danger" data-delete="${student.id}" type="button">Eliminar</button></td>
    </tr>`;
  }).join('');

  root.innerHTML = `<div class="toolbar"><div class="toolbar-group"><input id="studentSearch" class="search-input" type="search" placeholder="Buscar alumno, curso o estado…" aria-label="Buscar alumnos"></div></div>
  <section class="card"><div class="card-header"><div><h2>Seguimiento de alumnos</h2><small>Las horas asignadas se calculan automáticamente desde las sesiones.</small></div><span class="badge badge-neutral">${state.students.length} alumnos</span></div>
  <div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Curso</th><th>PT objetivo</th><th>PT asignado</th><th>PT pendiente</th><th>AL objetivo</th><th>AL asignado</th><th>AL pendiente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="10"><div class="empty-state"><strong>No hay alumnos</strong>Utiliza “Nuevo alumno” para comenzar.</div></td></tr>`}</tbody></table></div></section>`;

  root.querySelector('#studentSearch')?.addEventListener('input', event => filterRows(root, event.target.value));
  root.onclick = event => {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) onEdit(edit.dataset.edit);
    if (del) onDelete(del.dataset.delete);
  };
}

export function openStudentForm(student, { onSave }) {
  const current = student || { activo:true, restricciones:[] };
  const pt = minutesParts(current.horasPTObjetivoMin || 0);
  const al = minutesParts(current.horasALObjetivoMin || 0);
  showModal({
    title: student ? 'Editar alumno' : 'Nuevo alumno',
    bodyHtml: `<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
      <div class="form-field"><label for="apellidos">Apellidos *</label><input id="apellidos" name="apellidos" required value="${escapeHtml(current.apellidos || '')}"></div>
      <div class="form-field"><label for="curso">Curso</label><input id="curso" name="curso" value="${escapeHtml(current.curso || '')}" placeholder="4º"></div>
      <div class="form-field"><label for="grupoClase">Grupo / clase ordinaria</label><input id="grupoClase" name="grupoClase" value="${escapeHtml(current.grupoClase || '')}" placeholder="4ºA"></div>
      <div class="form-field full"><label for="tutor">Tutor/a</label><input id="tutor" name="tutor" value="${escapeHtml(current.tutor || '')}"></div>
      <fieldset><legend>Objetivo semanal PT</legend><div class="duration-pair"><div class="form-field"><label for="ptHours">Horas</label><input id="ptHours" name="ptHours" type="number" min="0" max="40" value="${pt.hours}"></div><div class="form-field"><label for="ptMinutes">Minutos</label><input id="ptMinutes" name="ptMinutes" type="number" min="0" max="59" value="${pt.minutes}"></div></div></fieldset>
      <fieldset><legend>Objetivo semanal AL</legend><div class="duration-pair"><div class="form-field"><label for="alHours">Horas</label><input id="alHours" name="alHours" type="number" min="0" max="40" value="${al.hours}"></div><div class="form-field"><label for="alMinutes">Minutos</label><input id="alMinutes" name="alMinutes" type="number" min="0" max="59" value="${al.minutes}"></div></div></fieldset>
      <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
      <div class="form-field full"><label><input name="activo" type="checkbox" ${current.activo !== false ? 'checked' : ''}> Alumno activo</label></div>
    </div>`,
    onSubmit: async (data, form, message) => {
      const nombre = data.get('nombre')?.trim();
      const apellidos = data.get('apellidos')?.trim();
      const ptMin = targetFromParts(data.get('ptHours'), data.get('ptMinutes'));
      const alMin = targetFromParts(data.get('alHours'), data.get('alMinutes'));
      if (!nombre || !apellidos) { setModalMessage(message, 'Nombre y apellidos son obligatorios.'); return false; }
      if (!Number.isFinite(ptMin) || !Number.isFinite(alMin)) { setModalMessage(message, 'Las horas objetivo deben ser valores válidos y no negativos.'); return false; }
      await onSave({
        ...current,
        id: current.id || uid('alu'), nombre, apellidos,
        curso: data.get('curso')?.trim(), grupoClase: data.get('grupoClase')?.trim(), tutor: data.get('tutor')?.trim(),
        horasPTObjetivoMin: ptMin, horasALObjetivoMin: alMin,
        observaciones: data.get('observaciones')?.trim(), activo: data.get('activo') === 'on',
        restricciones: current.restricciones || []
      });
      return true;
    }
  });
}

function filterRows(root, query) {
  const q = query.trim().toLowerCase();
  root.querySelectorAll('[data-search-row]').forEach(row => row.hidden = q && !row.dataset.searchRow.includes(q));
}
function pendingCell(value) { return value < 0 ? `<span class="badge badge-warning">+${formatDuration(Math.abs(value))}</span>` : value > 0 ? `<span class="badge badge-warning">${formatDuration(value)}</span>` : `<span class="badge badge-success">0 min</span>`; }
function statusBadge(status) { const cls = { Completo:'success', Pendiente:'warning', Exceso:'warning', Conflicto:'danger' }[status]; return `<span class="badge badge-${cls}">${status === 'Conflicto' ? '⚠ ' : ''}${status}</span>`; }
