import { deriveStudentStatus } from './hours.js';
import { COURSE_OPTIONS, classesForCourse, configuredClassGroups, normalizeSchoolSettings, schoolStructureConfigured } from './education.js';
import { get } from './db.js';
import { studentServiceKey, studentServices } from './student-services.js';
import { escapeHtml, fullName, minutesParts, targetFromParts, uid, formatDuration } from './utils.js';
import { showModal, setModalMessage } from './ui.js';

export function renderStudents(root, { state, hoursMap, conflictStudentIds, onEdit, onDelete }) {
  const classes = [...new Set([
    ...configuredClassGroups(state.schoolSettings),
    ...state.students.map(student => student.grupoClase).filter(Boolean)
  ])].sort((a,b) => a.localeCompare(b, 'es', { numeric:true }));

  const rows = [...state.students].sort((a,b) => {
    const classCompare = String(a.grupoClase || '').localeCompare(String(b.grupoClase || ''), 'es', { numeric:true });
    return classCompare || fullName(a).localeCompare(fullName(b), 'es');
  }).map(student => {
    const h = hoursMap.get(student.id) || { ptTarget:0,ptAssigned:0,ptPending:0,alTarget:0,alAssigned:0,alPending:0 };
    const services = studentServices(student, state.groups);
    const serviceKey = studentServiceKey(student, state.groups);
    const status = services.length ? deriveStudentStatus(h, conflictStudentIds.has(student.id)) : 'Sin apoyo';
    return `<tr data-search-row="${escapeHtml(`${fullName(student)} ${student.curso} ${student.grupoClase} ${status} ${services.join(' ')}`.toLowerCase())}" data-class="${escapeHtml(student.grupoClase || '')}" data-support="${serviceKey}">
      <td class="name-cell"><strong>${escapeHtml(fullName(student))}</strong><small>${escapeHtml(student.grupoClase || 'Sin clase')} · ${escapeHtml(student.tutor || 'Sin tutor')}</small></td>
      <td>${escapeHtml(student.curso || '—')}</td>
      <td>${supportBadges(services)}</td>
      <td>${formatDuration(h.ptTarget)}<small>${formatDuration(h.ptAssigned)} asignado</small></td>
      <td>${formatDuration(h.alTarget)}<small>${formatDuration(h.alAssigned)} asignado</small></td>
      <td>${studentStatusBadge(status, h)}</td>
      <td class="table-actions"><button class="button" data-edit="${student.id}" type="button">Editar</button><button class="button button-danger" data-delete="${student.id}" type="button">Eliminar</button></td>
    </tr>`;
  }).join('');

  root.innerHTML = `<div class="toolbar student-toolbar">
    <div class="toolbar-group"><input id="studentSearch" class="search-input" type="search" placeholder="Buscar alumno, clase o estado…" aria-label="Buscar alumnos"></div>
    <div class="toolbar-group"><label class="sr-only" for="studentClassFilter">Filtrar por clase</label><select id="studentClassFilter"><option value="ALL">Todas las clases</option>${classes.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('')}</select></div>
    <div class="toolbar-group"><label class="sr-only" for="studentSupportFilter">Filtrar por apoyo</label><select id="studentSupportFilter"><option value="ALL">Todos los alumnos</option><option value="NONE">Sin PT/AL</option><option value="PT">Solo PT</option><option value="AL">Solo AL</option><option value="PT+AL">PT + AL</option></select></div>
  </div>
  <section class="card"><div class="card-header"><div><h2>Alumnado del centro</h2><small>Incluye toda la matrícula. PT y AL son apoyos opcionales sobre los mismos alumnos.</small></div><span class="badge badge-neutral">${state.students.length} alumnos</span></div>
  <div class="table-wrap"><table><thead><tr><th>Alumno</th><th>Curso</th><th>Apoyos</th><th>PT</th><th>AL</th><th>Seguimiento</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state"><strong>No hay alumnos</strong>Utiliza “Nuevo alumno” o carga la matrícula desde “Clases y alumnado”.</div></td></tr>`}</tbody></table></div></section>`;

  const applyFilters = () => filterRows(root, {
    query:root.querySelector('#studentSearch')?.value || '',
    classGroup:root.querySelector('#studentClassFilter')?.value || 'ALL',
    support:root.querySelector('#studentSupportFilter')?.value || 'ALL'
  });
  root.querySelector('#studentSearch')?.addEventListener('input', applyFilters);
  root.querySelector('#studentClassFilter')?.addEventListener('change', applyFilters);
  root.querySelector('#studentSupportFilter')?.addEventListener('change', applyFilters);
  root.onclick = event => {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) onEdit(edit.dataset.edit);
    if (del) onDelete(del.dataset.delete);
  };
}

export async function openStudentForm(student, { onSave, initialCourse = '', initialClassGroup = '' }) {
  const current = student || { activo:true, restricciones:[], curso:initialCourse, grupoClase:initialClassGroup };
  const schoolSettings = normalizeSchoolSettings(await get('settings', 'school'));
  const structureReady = schoolStructureConfigured(schoolSettings);
  const pt = minutesParts(current.horasPTObjetivoMin || 0);
  const al = minutesParts(current.horasALObjetivoMin || 0);
  showModal({
    title: student ? 'Editar alumno' : 'Nuevo alumno',
    bodyHtml: `<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
      <div class="form-field"><label for="apellidos">Apellidos *</label><input id="apellidos" name="apellidos" required value="${escapeHtml(current.apellidos || '')}"></div>
      <div class="form-field"><label for="curso">Curso *</label><select id="curso" name="curso" required>${courseOptionsHtml(current.curso)}</select><span class="field-hint">El curso y la clase forman parte de la matrícula ordinaria, independientemente de PT/AL.</span></div>
      <div class="form-field"><label for="grupoClase">Grupo / clase ordinaria${structureReady ? ' *' : ''}</label><select id="grupoClase" name="grupoClase" ${structureReady ? 'required' : ''}></select><span id="classGroupHint" class="field-hint">${structureReady ? 'Se muestran las clases definidas en la estructura del colegio.' : 'Configura primero las clases del colegio para organizar la matrícula.'}</span></div>
      <div class="form-field full"><label for="tutor">Tutor/a</label><input id="tutor" name="tutor" value="${escapeHtml(current.tutor || '')}"></div>
      <fieldset><legend>Apoyo PT</legend><div class="duration-pair"><div class="form-field"><label for="ptHours">Horas objetivo</label><input id="ptHours" name="ptHours" type="number" min="0" max="40" value="${pt.hours}"></div><div class="form-field"><label for="ptMinutes">Minutos</label><input id="ptMinutes" name="ptMinutes" type="number" min="0" max="59" value="${pt.minutes}"></div></div><p class="field-hint">Déjalo en 0 si el alumno no requiere PT.</p></fieldset>
      <fieldset><legend>Apoyo AL</legend><div class="duration-pair"><div class="form-field"><label for="alHours">Horas objetivo</label><input id="alHours" name="alHours" type="number" min="0" max="40" value="${al.hours}"></div><div class="form-field"><label for="alMinutes">Minutos</label><input id="alMinutes" name="alMinutes" type="number" min="0" max="59" value="${al.minutes}"></div></div><p class="field-hint">Déjalo en 0 si el alumno no requiere AL. PT y AL pueden coexistir.</p></fieldset>
      <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
      <div class="form-field full"><label><input name="activo" type="checkbox" ${current.activo !== false ? 'checked' : ''}> Alumno activo</label></div>
    </div>`,
    onOpen: form => {
      const refreshClassGroups = () => {
        const course = form.elements.curso.value;
        const groups = classesForCourse(schoolSettings, course);
        const existing = current.grupoClase?.trim() || '';
        const legacy = existing && !groups.includes(existing) ? `<option value="${escapeHtml(existing)}">${escapeHtml(existing)} · dato existente</option>` : '';
        form.elements.grupoClase.innerHTML = `<option value="">${structureReady ? 'Selecciona una clase…' : 'Sin estructura configurada'}</option>${legacy}${groups.map(group => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`).join('')}`;
        if (existing && (groups.includes(existing) || legacy)) form.elements.grupoClase.value = existing;
        else if (!student && groups.length === 1) form.elements.grupoClase.value = groups[0];
      };
      form.elements.curso.addEventListener('change', refreshClassGroups);
      refreshClassGroups();
    },
    onSubmit: async (data, form, message) => {
      const nombre = data.get('nombre')?.trim();
      const apellidos = data.get('apellidos')?.trim();
      const curso = data.get('curso')?.trim();
      const grupoClase = data.get('grupoClase')?.trim() || '';
      const ptMin = targetFromParts(data.get('ptHours'), data.get('ptMinutes'));
      const alMin = targetFromParts(data.get('alHours'), data.get('alMinutes'));
      if (!nombre || !apellidos) { setModalMessage(message, 'Nombre y apellidos son obligatorios.'); return false; }
      if (!curso) { setModalMessage(message, 'Selecciona el curso del alumno.'); return false; }
      if (structureReady) {
        const validGroups = classesForCourse(schoolSettings, curso);
        if (!grupoClase || !validGroups.includes(grupoClase)) {
          setModalMessage(message, 'Selecciona una clase válida para el curso del alumno según la estructura del colegio.');
          return false;
        }
      }
      if (!Number.isFinite(ptMin) || !Number.isFinite(alMin)) { setModalMessage(message, 'Las horas objetivo deben ser valores válidos y no negativos.'); return false; }
      await onSave({
        ...current,
        id: current.id || uid('alu'), nombre, apellidos,
        curso, grupoClase, tutor: data.get('tutor')?.trim(),
        horasPTObjetivoMin: ptMin, horasALObjetivoMin: alMin,
        observaciones: data.get('observaciones')?.trim(), activo: data.get('activo') === 'on',
        restricciones: current.restricciones || []
      });
      return true;
    }
  });
}

function courseOptionsHtml(currentCourse) {
  const current = String(currentCourse || '').trim();
  const known = new Set(COURSE_OPTIONS.map(option => option.value));
  const legacy = current && !known.has(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} · dato existente</option>`
    : '';
  return `<option value="" ${current ? '' : 'selected'}>Selecciona un curso…</option>${legacy}${COURSE_OPTIONS.map(option => `<option value="${escapeHtml(option.value)}" ${current === option.value ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}`;
}

function filterRows(root, { query, classGroup, support }) {
  const q = String(query || '').trim().toLowerCase();
  root.querySelectorAll('[data-search-row]').forEach(row => {
    const searchOk = !q || row.dataset.searchRow.includes(q);
    const classOk = classGroup === 'ALL' || row.dataset.class === classGroup;
    const supportOk = support === 'ALL' || row.dataset.support === support;
    row.hidden = !(searchOk && classOk && supportOk);
  });
}

function supportBadges(services) {
  if (!services.length) return '<span class="badge badge-neutral">Sin apoyo</span>';
  return services.map(service => `<span class="badge badge-${service.toLowerCase()}">${service}</span>`).join(' ');
}

function studentStatusBadge(status, hours) {
  if (status === 'Sin apoyo') return '<span class="badge badge-neutral">Ordinario</span>';
  const cls = { Completo:'success', Pendiente:'warning', Exceso:'warning', Conflicto:'danger' }[status] || 'neutral';
  const pending = Math.max(0, hours.ptPending || 0) + Math.max(0, hours.alPending || 0);
  return `<span class="badge badge-${cls}">${status === 'Conflicto' ? '⚠ ' : ''}${status}</span>${pending ? `<small>${formatDuration(pending)} pendiente</small>` : ''}`;
}
