import { DAYS } from './constants.js';
import { escapeHtml, formatDuration, minutesParts, targetFromParts, uid } from './utils.js';
import { showModal, setModalMessage } from './ui.js';
import { sessionDuration } from './hours.js';
import { externalBlocksForDay, normalizeExternalBlocks } from './professional-availability.js';

export function renderProfessionals(root, { state, onEdit, onDelete }) {
  const rows = [...state.professionals].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(prof => {
    const profSessions = state.sessions.filter(s => (s.professionalId || state.groups.find(g=>g.id===s.groupId)?.professionalId) === prof.id);
    const used = profSessions.reduce((sum,s)=>sum+sessionDuration(s),0);
    const external = DAYS.flatMap(day => externalBlocksForDay(prof, day.id).map(block => `${day.label.slice(0,3)} ${block.centro} ${block.inicio}–${block.fin}`));
    return `<tr><td class="name-cell"><strong>${escapeHtml(prof.nombre)}</strong><small>${prof.activo === false ? 'Inactivo' : 'Activo'}</small></td><td><span class="badge badge-${prof.tipo.toLowerCase()}">${prof.tipo}</span></td><td>${profSessions.length}</td><td>${formatDuration(used)}</td><td>${formatDuration(prof.maxWeeklyMinutes || 0)}</td><td>${formatDuration(Math.max(0,(prof.maxWeeklyMinutes || 0)-used))}</td><td>${external.length ? `<div class="professional-external-summary">${external.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td><td class="table-actions"><button class="button" data-edit="${prof.id}" type="button">Editar</button><button class="button button-danger" data-delete="${prof.id}" type="button">Eliminar</button></td></tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Profesionales PT y AL</h2><small>Disponibilidad, carga semanal y presencia en otros centros.</small></div><span class="badge badge-neutral">${state.professionals.length} profesionales</span></div><div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Tipo</th><th>Sesiones</th><th>Horas utilizadas</th><th>Máximo semanal</th><th>Disponible</th><th>Otros centros</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openProfessionalForm(professional, { onSave }) {
  const current = professional || { tipo:'PT', activo:true, disponibilidad:{}, bloqueosExternos:{} };
  const max = minutesParts(current.maxWeeklyMinutes || 0);
  const availabilityHtml = DAYS.map(day => {
    const interval = current.disponibilidad?.[day.id]?.[0] || { inicio:'09:00', fin:'14:00' };
    return `<span>${day.label}</span><input aria-label="${day.label} inicio" name="${day.id}_inicio" type="time" value="${escapeHtml(interval.inicio || '')}"><input aria-label="${day.label} fin" name="${day.id}_fin" type="time" value="${escapeHtml(interval.fin || '')}">`;
  }).join('');
  const externalHtml = DAYS.map(day => {
    const block = externalBlocksForDay(current, day.id)[0] || { centro:'', inicio:'', fin:'' };
    return `<span>${day.label}</span><input aria-label="${day.label} centro externo" name="${day.id}_centro_externo" value="${escapeHtml(block.centro || '')}" placeholder="IES / otro centro"><input aria-label="${day.label} inicio centro externo" name="${day.id}_externo_inicio" type="time" value="${escapeHtml(block.inicio || '')}"><input aria-label="${day.label} fin centro externo" name="${day.id}_externo_fin" type="time" value="${escapeHtml(block.fin || '')}">`;
  }).join('');
  showModal({ title: professional ? 'Editar profesional' : 'Nuevo profesional', bodyHtml:`<div class="form-grid">
    <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
    <div class="form-field"><label for="tipo">Tipo *</label><select id="tipo" name="tipo"><option value="PT" ${current.tipo==='PT'?'selected':''}>PT</option><option value="AL" ${current.tipo==='AL'?'selected':''}>AL</option></select></div>
    <fieldset class="full"><legend>Máximo semanal</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="maxHours" type="number" min="0" value="${max.hours}"></div><div class="form-field"><label>Minutos</label><input name="maxMinutes" type="number" min="0" max="59" value="${max.minutes}"></div></div></fieldset>
    <fieldset class="full"><legend>Disponibilidad lectiva total</legend><div class="availability-grid"><strong>Día</strong><strong>Inicio</strong><strong>Fin</strong>${availabilityHtml}</div><p class="field-hint professional-fieldset-hint">Indica el tramo general en el que el profesional trabaja. Los bloques de otros centros se restarán automáticamente de esta disponibilidad.</p></fieldset>
    <fieldset class="full"><legend>Presencia en otros centros</legend><div class="external-center-grid"><strong>Día</strong><strong>Centro externo</strong><strong>Inicio</strong><strong>Fin</strong>${externalHtml}</div><p class="field-hint professional-fieldset-hint">Opcional. Ejemplo: si AL está en un instituto de 08:30 a 11:30, escribe el nombre del instituto y esa franja. La configuración automática no podrá colocar sesiones aquí.</p></fieldset>
    <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
    <div class="form-field full"><label><input name="activo" type="checkbox" ${current.activo!==false?'checked':''}> Profesional activo</label></div>
  </div>`, onSubmit: async (data, form, message) => {
    const nombre=data.get('nombre')?.trim(); const tipo=data.get('tipo'); const maxMinutes=targetFromParts(data.get('maxHours'),data.get('maxMinutes'));
    if(!nombre){setModalMessage(message,'El nombre es obligatorio.');return false;} if(!['PT','AL'].includes(tipo)){setModalMessage(message,'Selecciona PT o AL.');return false;} if(!Number.isFinite(maxMinutes)){setModalMessage(message,'El máximo semanal no es válido.');return false;}
    const disponibilidad={};
    const bloqueosExternos={};
    for(const day of DAYS){
      const inicio=data.get(`${day.id}_inicio`);const fin=data.get(`${day.id}_fin`);
      if(inicio&&fin){if(fin<=inicio){setModalMessage(message,`La disponibilidad del ${day.label.toLowerCase()} termina antes de empezar.`);return false;}disponibilidad[day.id]=[{inicio,fin}];}else disponibilidad[day.id]=[];

      const centro=data.get(`${day.id}_centro_externo`)?.trim() || '';
      const externoInicio=data.get(`${day.id}_externo_inicio`) || '';
      const externoFin=data.get(`${day.id}_externo_fin`) || '';
      const anyExternal=Boolean(centro||externoInicio||externoFin);
      const completeExternal=Boolean(centro&&externoInicio&&externoFin);
      if(anyExternal&&!completeExternal){setModalMessage(message,`${day.label}: para bloquear otro centro indica nombre, inicio y fin.`);return false;}
      if(completeExternal){
        if(externoFin<=externoInicio){setModalMessage(message,`${day.label}: la franja del centro externo termina antes de empezar.`);return false;}
        bloqueosExternos[day.id]=[{centro,inicio:externoInicio,fin:externoFin}];
      } else bloqueosExternos[day.id]=[];
    }
    await onSave({...current,id:current.id||uid('prof'),nombre,tipo,maxWeeklyMinutes:maxMinutes,disponibilidad,bloqueosExternos:normalizeExternalBlocks(bloqueosExternos),observaciones:data.get('observaciones')?.trim(),activo:data.get('activo')==='on'}); return true;
  }});
}
