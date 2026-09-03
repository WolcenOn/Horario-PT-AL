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
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Grupos de apoyo</h2><small>El grupo define alumnado, servicio y profesional; las sesiones definen cuándo se reúne.</small></div><span class="badge badge-neutral">${visible.length} grupos</span></div>
  <div class="table-wrap"><table><thead><tr><th>Grupo</th><th>Servicio</th><th>Profesional</th><th>Alumnos</th><th>Sesiones</th><th>Máx. recomendado</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="7"><div class="empty-state"><strong>No hay grupos para este filtro</strong>Crea un grupo o cambia el filtro PT/AL.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openGroupForm(group, { state, onSave }) {
  const current = group || { tipo:'PT', studentIds:[], activo:true, maxStudents:4, color:'#dceef5' };
  const professionals = state.professionals.filter(p => p.activo !== false);
  const students = [...state.students].filter(s => s.activo !== false).sort((a,b)=>fullName(a).localeCompare(fullName(b),'es'));
  const profOptions = professionals.map(p => `<option value="${p.id}" data-type="${p.tipo}" ${p.id===current.professionalId?'selected':''}>${escapeHtml(p.nombre)} · ${p.tipo}</option>`).join('');
  const studentOptions = students.map(s => `<option value="${s.id}" ${(current.studentIds||[]).includes(s.id)?'selected':''}>${escapeHtml(fullName(s))} · ${escapeHtml(s.grupoClase || s.curso || '')}</option>`).join('');
  showModal({
    title: group ? 'Editar grupo' : 'Nuevo grupo',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}" placeholder="PT 4ºA"></div>
      <div class="form-field"><label for="tipo">Servicio *</label><select id="tipo" name="tipo"><option value="PT" ${current.tipo==='PT'?'selected':''}>PT</option><option value="AL" ${current.tipo==='AL'?'selected':''}>AL</option></select></div>
      <div class="form-field full"><label for="professionalId">Profesional responsable *</label><select id="professionalId" name="professionalId" required>${profOptions}</select><small class="field-hint">Solo se muestran como válidos los profesionales del mismo servicio.</small></div>
      <div class="form-field"><label for="niveles">Curso o niveles predominantes</label><input id="niveles" name="niveles" value="${escapeHtml(current.niveles || '')}" placeholder="4º / 5º"></div>
      <div class="form-field"><label for="maxStudents">Máximo recomendado</label><input id="maxStudents" name="maxStudents" type="number" min="1" max="20" value="${current.maxStudents || 4}"></div>
      <div class="form-field full"><label for="studentIds">Alumnos</label><select id="studentIds" name="studentIds" multiple>${studentOptions}</select><small class="field-hint">Ctrl/Cmd + clic permite seleccionar varios.</small></div>
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
      form.elements.tipo.addEventListener('change', syncProfessionals);
      syncProfessionals();
    },
    onSubmit: async (data, form, message) => {
      const nombre=data.get('nombre')?.trim(); const tipo=data.get('tipo'); const professionalId=data.get('professionalId');
      const professional=state.professionals.find(p=>p.id===professionalId);
      if(!nombre){setModalMessage(message,'El nombre del grupo es obligatorio.');return false;}
      if(!professional || professional.tipo!==tipo){setModalMessage(message,'El profesional debe existir y ser del mismo tipo PT/AL que el grupo.');return false;}
      const studentIds=[...form.elements.studentIds.selectedOptions].map(o=>o.value);
      const maxStudents=Number(data.get('maxStudents')||0);
      if(maxStudents>0 && studentIds.length>maxStudents){setModalMessage(message,`El grupo tiene ${studentIds.length} alumnos y supera el máximo recomendado (${maxStudents}). Puedes guardarlo si aumentas ese máximo.`, 'warning');return false;}
      await onSave({...current,id:current.id||uid('grp'),nombre,tipo,professionalId,studentIds,niveles:data.get('niveles')?.trim(),maxStudents:maxStudents||4,color:data.get('color')||'#dceef5',observaciones:data.get('observaciones')?.trim(),activo:data.get('activo')==='on'}); return true;
    }
  });
}
