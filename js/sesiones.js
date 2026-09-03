import { DAYS } from './constants.js';
import { detectConflicts } from './conflicts.js';
import { escapeHtml, formatDuration, fullName, timeToMinutes, uid } from './utils.js';
import { sessionDuration } from './hours.js';
import { showModal, setModalMessage } from './ui.js';

export function renderSessions(root, { state, serviceFilter, conflicts, onEdit, onDelete }) {
  const groupMap = new Map(state.groups.map(g=>[g.id,g]));
  const professionalMap = new Map(state.professionals.map(p=>[p.id,p]));
  const studentMap = new Map(state.students.map(s=>[s.id,s]));
  const dayOrder = new Map(DAYS.map((d,i)=>[d.id,i]));
  const visible = state.sessions.filter(s => {
    const g=groupMap.get(s.groupId); return serviceFilter==='ALL' || g?.tipo===serviceFilter;
  }).sort((a,b)=>(dayOrder.get(a.dia)-dayOrder.get(b.dia)) || a.inicio.localeCompare(b.inicio));
  const rows=visible.map(session=>{
    const group=groupMap.get(session.groupId); const professional=professionalMap.get(session.professionalId||group?.professionalId);
    const names=(group?.studentIds||[]).map(id=>fullName(studentMap.get(id))).filter(Boolean);
    const hasConflict=conflicts.some(c=>c.sessionIds.includes(session.id));
    return `<tr><td>${DAYS.find(d=>d.id===session.dia)?.label||session.dia}</td><td><strong>${session.inicio}–${session.fin}</strong><small class="muted"> · ${formatDuration(sessionDuration(session))}</small></td><td>${group?`<span class="badge badge-${group.tipo.toLowerCase()}">${group.tipo}</span> ${escapeHtml(group.nombre)}`:'Grupo inexistente'}</td><td>${escapeHtml(professional?.nombre||'—')}</td><td>${names.map(escapeHtml).join(', ')}</td><td>${escapeHtml(session.aula||'—')}</td><td>${hasConflict?'<span class="badge badge-danger">⚠ Conflicto</span>':'<span class="badge badge-success">Correcta</span>'}</td><td class="table-actions"><button class="button" data-edit="${session.id}" type="button">Editar</button><button class="button button-danger" data-delete="${session.id}" type="button">Eliminar</button></td></tr>`;
  }).join('');
  root.innerHTML=`<section class="card"><div class="card-header"><div><h2>Sesiones semanales</h2><small>Una sesión representa cuándo se reúne un grupo.</small></div><span class="badge badge-neutral">${visible.length} sesiones</span></div><div class="table-wrap"><table><thead><tr><th>Día</th><th>Hora</th><th>Grupo</th><th>Profesional</th><th>Alumnos</th><th>Aula</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows||`<tr><td colspan="8"><div class="empty-state"><strong>No hay sesiones</strong>Crea una nueva sesión para empezar.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick=event=>{const e=event.target.closest('[data-edit]');const d=event.target.closest('[data-delete]');if(e)onEdit(e.dataset.edit);if(d)onDelete(d.dataset.delete);};
}

export function openSessionForm(session, { state, onSave }) {
  const current=session||{dia:'lunes',inicio:'09:00',fin:'09:45'};
  const activeGroups=state.groups.filter(g=>g.activo!==false);
  const groupOptions=activeGroups.map(g=>`<option value="${g.id}" ${g.id===current.groupId?'selected':''}>${g.tipo} · ${escapeHtml(g.nombre)}</option>`).join('');
  const dayOptions=DAYS.map(d=>`<option value="${d.id}" ${d.id===current.dia?'selected':''}>${d.label}</option>`).join('');
  showModal({title:session?'Editar sesión':'Nueva sesión',bodyHtml:`<div class="form-grid">
    <div class="form-field full"><label for="groupId">Grupo *</label><select id="groupId" name="groupId" required><option value="">Selecciona un grupo</option>${groupOptions}</select><small id="groupInfo" class="field-hint"></small></div>
    <div class="form-field"><label for="dia">Día *</label><select id="dia" name="dia">${dayOptions}</select></div>
    <div class="form-field"><label for="aula">Aula / espacio</label><input id="aula" name="aula" value="${escapeHtml(current.aula||'')}"></div>
    <div class="form-field"><label for="inicio">Inicio *</label><input id="inicio" name="inicio" type="time" required value="${current.inicio||'09:00'}"></div>
    <div class="form-field"><label for="fin">Fin *</label><input id="fin" name="fin" type="time" required value="${current.fin||'09:45'}"></div>
    <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones||'')}</textarea></div>
  </div>`,
  onOpen:form=>{
    const updateInfo=()=>{const group=state.groups.find(g=>g.id===form.elements.groupId.value);const prof=state.professionals.find(p=>p.id===group?.professionalId);const students=(group?.studentIds||[]).map(id=>fullName(state.students.find(s=>s.id===id))).filter(Boolean);form.querySelector('#groupInfo').textContent=group?`${prof?.nombre||'Sin profesional'} · ${students.length} alumno(s): ${students.join(', ')}`:'';};
    form.elements.groupId.addEventListener('change',updateInfo);updateInfo();
  },
  onSubmit:async(data,form,message)=>{
    const groupId=data.get('groupId');const group=state.groups.find(g=>g.id===groupId);const inicio=data.get('inicio');const fin=data.get('fin');
    if(!group){setModalMessage(message,'Selecciona un grupo válido.');return false;}
    if(!inicio||!fin||timeToMinutes(fin)<=timeToMinutes(inicio)){setModalMessage(message,'La hora de finalización debe ser posterior a la hora de inicio.');return false;}
    const candidate={...current,id:current.id||uid('ses'),groupId,professionalId:group.professionalId,dia:data.get('dia'),inicio,fin,aula:data.get('aula')?.trim(),observaciones:data.get('observaciones')?.trim(),excludedStudentIds:current.excludedStudentIds||[]};
    const sessions=state.sessions.filter(s=>s.id!==candidate.id).concat(candidate);
    const candidateConflicts=detectConflicts({...state,sessions}).filter(c=>c.sessionIds.includes(candidate.id));
    if(candidateConflicts.length){
      const text=candidateConflicts.map(c=>`• ${c.message}`).join('\n');
      const accepted=window.confirm(`Esta sesión genera ${candidateConflicts.length} advertencia(s) o conflicto(s):\n\n${text}\n\n¿Quieres guardarla de todos modos?`);
      if(!accepted){setModalMessage(message,'La sesión no se ha guardado. Ajusta el horario o el grupo para resolver los conflictos.', 'warning');return false;}
    }
    await onSave(candidate);return true;
  }});
}
