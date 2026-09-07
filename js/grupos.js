import { studentServices } from './student-services.js';
import { escapeHtml, fullName, uid } from './utils.js';
import { showModal, setModalMessage } from './ui.js';

export function renderGroups(root, { state, serviceFilter, onEdit, onDelete }) {
  const professionalMap = new Map(state.professionals.map(p => [p.id, p]));
  const studentMap = new Map(state.students.map(s => [s.id, s]));
  const visible = state.groups.filter(g => serviceFilter === 'ALL' || g.tipo === serviceFilter);
  const rows = visible.map(group => {
    const professional = professionalMap.get(group.professionalId);
    const names = (group.studentIds || []).map(id => fullName(studentMap.get(id))).filter(Boolean);
    const sessionCount = state.sessions.filter(s => s.groupId === group.id).length;
    return `<tr>
      <td class="name-cell"><strong>${escapeHtml(group.nombre)}</strong><small>${escapeHtml(group.niveles || 'Sin nivel')}</small></td>
      <td><span class="badge badge-${group.tipo.toLowerCase()}">${group.tipo}</span></td>
      <td>${escapeHtml(professional?.nombre || 'Sin profesional')}</td>
      <td>${names.length ? names.map(escapeHtml).join(', ') : '<span class="muted">Sin alumnos</span>'}</td>
      <td>${sessionCount}</td>
      <td>${group.maxStudents || '—'}</td>
      <td class="table-actions"><button class="button" data-edit="${group.id}" type="button">Editar</button><button class="button button-danger" data-delete="${group.id}" type="button">Eliminar</button></td>
    </tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Grupos de apoyo</h2><small>Los grupos PT/AL utilizan la misma matrícula ordinaria; un alumno puede participar en PT, AL o ambos.</small></div><span class="badge badge-neutral">${visible.length} grupos</span></div>
  <div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Servicio</th><th>Profesional</th><th>Alumnos</th><th>Sesiones</th><th>Máx. recomendado</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state"><strong>No hay grupos para este filtro</strong>Crea un grupo o cambia el filtro PT/AL.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openGroupForm(group, { state, onSave }) {
  const current = group || { tipo:'PT', studentIds:[], activo:true, maxStudents:4, color:'#dceef5' };
  const professionals = state.professionals.filter(p => p.activo !== false);
  const students = [...state.students].filter(s => s.activo !== false).sort((a,b)=> {
    const groupCompare = String(a.grupoClase || '').localeCompare(String(b.grupoClase || ''), 'es', { numeric:true });
    return groupCompare || fullName(a).localeCompare(fullName(b),'es');
  });
  const classes = [...new Set(students.map(student => student.grupoClase).filter(Boolean))].sort((a,b) => a.localeCompare(b,'es',{numeric:true}));
  const profOptions = professionals.map(p => `<option value="${p.id}" data-type="${p.tipo}" ${p.id===current.professionalId?'selected':''}>${escapeHtml(p.nombre)} · ${p.tipo}</option>`).join('');
  const studentRows = students.map(student => {
    const services = studentServices(student, state.groups);
    const checked = (current.studentIds || []).includes(student.id);
    const search = `${fullName(student)} ${student.grupoClase || ''} ${student.curso || ''}`.toLowerCase();
    return `<label class="support-student-option" data-student-picker-row data-class="${escapeHtml(student.grupoClase || '')}" data-search="${escapeHtml(search)}">
      <input type="checkbox" name="studentId" value="${student.id}" ${checked ? 'checked' : ''}>
      <span class="support-student-main"><strong>${escapeHtml(fullName(student))}</strong><small>${escapeHtml(student.grupoClase || student.curso || 'Sin clase')}</small></span>
      <span class="support-student-services">${services.length ? services.map(service => `<span class="badge badge-${service.toLowerCase()}">${service}</span>`).join('') : '<span class="badge badge-neutral">Sin apoyo</span>'}</span>
    </label>`;
  }).join('');

  showModal({
    title: group ? 'Editar grupo' : 'Nuevo grupo',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}" placeholder="PT 4ºA"></div>
      <div class="form-field"><label for="tipo">Servicio *</label><select id="tipo" name="tipo"><option value="PT" ${current.tipo==='PT'?'selected':''}>PT</option><option value="AL" ${current.tipo==='AL'?'selected':''}>AL</option></select></div>
      <div class="form-field full"><label for="professionalId">Profesional responsable *</label><select id="professionalId" name="professionalId" required>${profOptions}</select><small class="field-hint">Solo se consideran válidos los profesionales del mismo servicio.</small></div>
      <div class="form-field"><label for="niveles">Curso o niveles predominantes</label><input id="niveles" name="niveles" value="${escapeHtml(current.niveles || '')}" placeholder="4º / 5º"></div>
      <div class="form-field"><label for="maxStudents">Máximo recomendado</label><input id="maxStudents" name="maxStudents" type="number" min="1" max="20" value="${current.maxStudents || 4}"></div>
      <fieldset class="full"><legend>Alumnos del grupo</legend>
        <div class="support-student-picker-tools"><input data-student-picker-search type="search" placeholder="Buscar alumno…" aria-label="Buscar alumno"><select data-student-picker-class aria-label="Filtrar por clase"><option value="ALL">Todas las clases</option>${classes.map(classGroup => `<option value="${escapeHtml(classGroup)}">${escapeHtml(classGroup)}</option>`).join('')}</select><span data-student-picker-count></span></div>
        <div class="support-student-picker">${studentRows || '<div class="empty-state">No hay alumnado activo cargado.</div>'}</div>
        <small class="field-hint">Puedes seleccionar alumnado de cualquier clase. Seleccionarlo aquí lo incorpora a este servicio sin duplicar su ficha ordinaria.</small>
      </fieldset>
      <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
      <div class="form-field"><label for="color">Color identificativo</label><input id="color" name="color" type="color" value="${escapeHtml(current.color || (current.tipo==='PT'?'#dceef5':'#ece7f7'))}"></div>
      <div class="form-field"><label><input name="activo" type="checkbox" ${current.activo!==false?'checked':''}> Grupo activo</label></div>
    </div>`,
    onOpen: form => {
      const syncProfessionals = () => {
        const type = form.elements.tipo.value;
        [...form.elements.professionalId.options].forEach(option => { option.hidden = option.dataset.type !== type; option.disabled = option.dataset.type !== type; });
        if (form.elements.professionalId.selectedOptions[0]?.disabled) {
          const first = [...form.elements.professionalId.options].find(o => !o.disabled);
          if (first) form.elements.professionalId.value = first.value;
        }
        form.elements.color.value = type === 'PT' ? '#dceef5' : '#ece7f7';
      };
      const filterStudents = () => {
        const query = String(form.querySelector('[data-student-picker-search]')?.value || '').trim().toLowerCase();
        const classGroup = form.querySelector('[data-student-picker-class]')?.value || 'ALL';
        let visible = 0;
        form.querySelectorAll('[data-student-picker-row]').forEach(row => {
          const matchSearch = !query || row.dataset.search.includes(query);
          const matchClass = classGroup === 'ALL' || row.dataset.class === classGroup;
          row.hidden = !(matchSearch && matchClass);
          if (!row.hidden) visible += 1;
        });
        const selected = form.querySelectorAll('input[name="studentId"]:checked').length;
        const count = form.querySelector('[data-student-picker-count]');
        if (count) count.textContent = `${selected} seleccionados · ${visible} visibles`;
      };
      form.elements.tipo.addEventListener('change', syncProfessionals);
      form.querySelector('[data-student-picker-search]')?.addEventListener('input', filterStudents);
      form.querySelector('[data-student-picker-class]')?.addEventListener('change', filterStudents);
      form.querySelector('.support-student-picker')?.addEventListener('change', filterStudents);
      syncProfessionals();
      filterStudents();
    },
    onSubmit: async (data, form, message) => {
      const nombre=data.get('nombre')?.trim(); const tipo=data.get('tipo'); const professionalId=data.get('professionalId');
      const professional=state.professionals.find(p=>p.id===professionalId);
      if(!nombre){setModalMessage(message,'El nombre del grupo es obligatorio.');return false;}
      if(!professional || professional.tipo!==tipo){setModalMessage(message,'El profesional debe existir y ser del mismo tipo PT/AL que el grupo.');return false;}
      const studentIds=data.getAll('studentId').map(String);
      const maxStudents=Number(data.get('maxStudents')||0);
      if(maxStudents>0 && studentIds.length>maxStudents){setModalMessage(message,`El grupo tiene ${studentIds.length} alumnos y supera el máximo recomendado (${maxStudents}). Puedes guardarlo si aumentas ese máximo.`, 'warning');return false;}
      await onSave({...current,id:current.id||uid('grp'),nombre,tipo,professionalId,studentIds,niveles:data.get('niveles')?.trim(),maxStudents:maxStudents||4,color:data.get('color')||'#dceef5',observaciones:data.get('observaciones')?.trim(),activo:data.get('activo')==='on'}); return true;
    }
  });
}
