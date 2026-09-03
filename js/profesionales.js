import { DAYS } from './constants.js';
import { escapeHtml, formatDuration, minutesParts, targetFromParts, uid } from './utils.js';
import { showModal, setModalMessage } from './ui.js';
import { sessionDuration } from './hours.js';

export function renderProfessionals(root, { state, onEdit, onDelete }) {
  const rows = [...state.professionals].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(prof => {
    const profSessions = state.sessions.filter(s => (s.professionalId || state.groups.find(g=>g.id===s.groupId)?.professionalId) === prof.id);
    const used = profSessions.reduce((sum,s)=>sum+sessionDuration(s),0);
    return `<tr><td class="name-cell"><strong>${escapeHtml(prof.nombre)}</strong><small>${prof.activo === false ? 'Inactivo' : 'Activo'}</small></td><td><span class="badge badge-${prof.tipo.toLowerCase()}">${prof.tipo}</span></td><td>${profSessions.length}</td><td>${formatDuration(used)}</td><td>${formatDuration(prof.maxWeeklyMinutes || 0)}</td><td>${formatDuration(Math.max(0,(prof.maxWeeklyMinutes || 0)-used))}</td><td class="table-actions"><button class="button" data-edit="${prof.id}" type="button">Editar</button><button class="button button-danger" data-delete="${prof.id}" type="button">Eliminar</button></td></tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Profesionales PT y AL</h2><small>Disponibilidad y carga semanal.</small></div><span class="badge badge-neutral">${state.professionals.length} profesionales</span></div><div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Tipo</th><th>Sesiones</th><th>Horas utilizadas</th><th>Máximo semanal</th><th>Disponible</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openProfessionalForm(professional, { onSave }) {
  const current = professional || { tipo:'PT', activo:true, disponibilidad:{} };
  const max = minutesParts(current.maxWeeklyMinutes || 0);
  const availabilityHtml = DAYS.map(day => {
    const interval = current.disponibilidad?.[day.id]?.[0] || { inicio:'09:00', fin:'14:00' };
    return `<span>${day.label}</span><input aria-label="${day.label} inicio" name="${day.id}_inicio" type="time" value="${interval.inicio}"><input aria-label="${day.label} fin" name="${day.id}_fin" type="time" value="${interval.fin}">`;
  }).join('');
  showModal({ title: professional ? 'Editar profesional' : 'Nuevo profesional', bodyHtml:`<div class="form-grid">
    <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
    <div class="form-field"><label for="tipo">Tipo *</label><select id="tipo" name="tipo"><option value="PT" ${current.tipo==='PT'?'selected':''}>PT</option><option value="AL" ${current.tipo==='AL'?'selected':''}>AL</option></select></div>
    <fieldset class="full"><legend>Máximo semanal</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="maxHours" type="number" min="0" value="${max.hours}"></div><div class="form-field"><label>Minutos</label><input name="maxMinutes" type="number" min="0" max="59" value="${max.minutes}"></div></div></fieldset>
    <fieldset class="full"><legend>Disponibilidad lectiva</legend><div class="availability-grid"><strong>Día</strong><strong>Inicio</strong><strong>Fin</strong>${availabilityHtml}</div></fieldset>
    <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
    <div class="form-field full"><label><input name="activo" type="checkbox" ${current.activo!==false?'checked':''}> Profesional activo</label></div>
  </div>`, onSubmit: async (data, form, message) => {
    const nombre=data.get('nombre')?.trim(); const tipo=data.get('tipo'); const maxMinutes=targetFromParts(data.get('maxHours'),data.get('maxMinutes'));
    if(!nombre){setModalMessage(message,'El nombre es obligatorio.');return false;} if(!['PT','AL'].includes(tipo)){setModalMessage(message,'Selecciona PT o AL.');return false;} if(!Number.isFinite(maxMinutes)){setModalMessage(message,'El máximo semanal no es válido.');return false;}
    const disponibilidad={};
    for(const day of DAYS){const inicio=data.get(`${day.id}_inicio`);const fin=data.get(`${day.id}_fin`);if(inicio&&fin){if(fin<=inicio){setModalMessage(message,`La disponibilidad del ${day.label.toLowerCase()} termina antes de empezar.`);return false;}disponibilidad[day.id]=[{inicio,fin}];}else disponibilidad[day.id]=[];}
    await onSave({...current,id:current.id||uid('prof'),nombre,tipo,maxWeeklyMinutes:maxMinutes,disponibilidad,observaciones:data.get('observaciones')?.trim(),activo:data.get('activo')==='on'}); return true;
  }});
}
