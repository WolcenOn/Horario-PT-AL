import { DAYS } from './constants.js';
import { configuredClassGroups, courseForClassGroup, stageForCourse } from './education.js';
import { subjectsForStage } from './subjects.js';
import { PROFESSIONAL_TYPES, RESPONSIBILITY_TYPES, normalizeProfessionalProfile, normalizeResponsibilities, normalizeTeachingAssignments } from './center-planning.js';
import { escapeHtml, formatDuration, minutesParts, targetFromParts, uid } from './utils.js';
import { showModal, setModalMessage } from './ui.js';
import { sessionDuration } from './hours.js';
import { effectiveAvailability, externalBlocksForDay, normalizeExternalBlocks } from './professional-availability.js';

export function renderProfessionals(root, { state, onEdit, onDelete }) {
  const rows = [...state.professionals].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(raw => {
    const prof = normalizeProfessionalProfile(raw);
    const profSessions = state.sessions.filter(s => (s.professionalId || state.groups.find(g=>g.id===s.groupId)?.professionalId) === prof.id);
    const used = profSessions.reduce((sum,s)=>sum+sessionDuration(s),0);
    const external = DAYS.flatMap(day => externalBlocksForDay(prof, day.id).map(block => `${day.label.slice(0,3)} ${block.centro} ${block.inicio}–${block.fin}`));
    const typeBadge = prof.tipo === 'PT' ? 'badge-pt' : prof.tipo === 'AL' ? 'badge-al' : 'badge-neutral';
    const teaching = prof.teachingAssignments.map(item => `${item.grupoClase} · ${item.materia}`);
    const functions = prof.responsibilities.map(item => `${responsibilityLabel(item.tipo)}: ${item.nombre}${item.weeklyMinutes ? ` (${formatDuration(item.weeklyMinutes)})` : ''}`);
    return `<tr>
      <td class="name-cell"><strong>${escapeHtml(prof.nombre)}</strong><small>${escapeHtml(prof.especialidad || (prof.tipo === 'DOCENTE' ? 'Docente' : prof.tipo))} · ${prof.activo === false ? 'Inactivo' : 'Activo'}</small></td>
      <td><span class="badge ${typeBadge}">${escapeHtml(prof.tipo)}</span></td>
      <td>${escapeHtml(prof.tutoriaGrupo || '—')}</td>
      <td>${teaching.length ? `<div class="professional-external-summary">${teaching.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${functions.length ? `<div class="professional-external-summary">${functions.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${profSessions.length}</td><td>${formatDuration(used)}</td><td>${formatDuration(prof.maxWeeklyMinutes || 0)}</td>
      <td>${external.length ? `<div class="professional-external-summary">${external.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td class="table-actions"><button class="button" data-edit="${prof.id}" type="button">Editar</button><button class="button button-danger" data-delete="${prof.id}" type="button">Eliminar</button></td>
    </tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Profesorado del centro</h2><small>PT, AL y docentes ordinarios con tutorías, docencia, funciones, disponibilidad y presencia en otros centros.</small></div><span class="badge badge-neutral">${state.professionals.length} profesionales</span></div><div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Perfil</th><th>Tutoría</th><th>Asignaturas / clases</th><th>Coordinaciones y planes</th><th>PT/AL sesiones</th><th>PT/AL utilizado</th><th>Máximo semanal</th><th>Otros centros</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="10"><div class="empty-state"><strong>No hay profesorado</strong>Utiliza “Nuevo profesor” para comenzar.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openProfessionalForm(professional, { state, onSave }) {
  const current = normalizeProfessionalProfile(professional || { tipo:'PT', activo:true, disponibilidad:{}, disponibilidadBase:{}, bloqueosExternos:{} });
  const max = minutesParts(current.maxWeeklyMinutes || 0);
  const baseAvailability = current.disponibilidadBase || current.disponibilidad || {};
  const classGroups = configuredClassGroups(state?.schoolSettings);
  const availabilityHtml = DAYS.map(day => {
    const interval = baseAvailability?.[day.id]?.[0] || { inicio:'09:00', fin:'14:00' };
    return `<span>${day.label}</span><input aria-label="${day.label} inicio" name="${day.id}_inicio" type="time" value="${escapeHtml(interval.inicio || '')}"><input aria-label="${day.label} fin" name="${day.id}_fin" type="time" value="${escapeHtml(interval.fin || '')}">`;
  }).join('');
  const externalHtml = DAYS.map(day => {
    const block = externalBlocksForDay(current, day.id)[0] || { centro:'', inicio:'', fin:'' };
    return `<span>${day.label}</span><input aria-label="${day.label} centro externo" name="${day.id}_centro_externo" value="${escapeHtml(block.centro || '')}" placeholder="IES / otro centro"><input aria-label="${day.label} inicio centro externo" name="${day.id}_externo_inicio" type="time" value="${escapeHtml(block.inicio || '')}"><input aria-label="${day.label} fin centro externo" name="${day.id}_externo_fin" type="time" value="${escapeHtml(block.fin || '')}">`;
  }).join('');
  const classOptions = `<option value="">Sin tutoría</option>${classGroups.map(group => `<option value="${escapeHtml(group)}" ${current.tutoriaGrupo === group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}${current.tutoriaGrupo && !classGroups.includes(current.tutoriaGrupo) ? `<option value="${escapeHtml(current.tutoriaGrupo)}" selected>${escapeHtml(current.tutoriaGrupo)} · dato existente</option>` : ''}`;

  showModal({
    title: professional ? 'Editar profesional' : 'Nuevo profesional',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
      <div class="form-field"><label for="tipo">Perfil *</label><select id="tipo" name="tipo">${PROFESSIONAL_TYPES.map(type => `<option value="${type}" ${current.tipo===type?'selected':''}>${type === 'DOCENTE' ? 'Docente ordinario' : type}</option>`).join('')}</select><span class="field-hint">PT y AL pueden seguir asignándose a grupos de apoyo; Docente sirve para el horario global.</span></div>
      <div class="form-field"><label for="especialidad">Especialidad / puesto</label><input id="especialidad" name="especialidad" value="${escapeHtml(current.especialidad || '')}" placeholder="Primaria, Inglés, Música, PT…"></div>
      <div class="form-field"><label for="tutoriaGrupo">Tutoría</label><select id="tutoriaGrupo" name="tutoriaGrupo">${classOptions}</select><span class="field-hint">La lista procede de la estructura de clases del colegio.</span></div>
      <div class="form-field full professional-advanced-intro">La parte avanzada es opcional. Puedes dejarla vacía y seguir usando únicamente PT/AL, o añadir la docencia ordinaria y las funciones del centro progresivamente.</div>
      <fieldset class="full"><legend>Asignaturas y clases que imparte</legend><div id="teachingAssignments" class="teaching-assignment-list"></div><button class="button" type="button" data-add-teaching>+ Añadir asignatura / clase</button><p class="field-hint">Estas asignaciones preparan el modelo para un horario global y permiten enlazar cada materia con su profesor.</p></fieldset>
      <fieldset class="full"><legend>Coordinaciones, planes y programas</legend><div id="responsibilities" class="responsibility-list"></div><button class="button" type="button" data-add-responsibility>+ Añadir función</button><p class="field-hint">La dedicación semanal es opcional y se guarda en minutos para poder incorporarla después al horario general.</p></fieldset>
      <fieldset class="full"><legend>Máximo semanal</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="maxHours" type="number" min="0" value="${max.hours}"></div><div class="form-field"><label>Minutos</label><input name="maxMinutes" type="number" min="0" max="59" value="${max.minutes}"></div></div></fieldset>
      <fieldset class="full"><legend>Disponibilidad lectiva total</legend><div class="availability-grid"><strong>Día</strong><strong>Inicio</strong><strong>Fin</strong>${availabilityHtml}</div><p class="field-hint professional-fieldset-hint">Indica el tramo general en el que el profesional trabaja. Los bloques de otros centros se restarán automáticamente.</p></fieldset>
      <fieldset class="full"><legend>Presencia en otros centros</legend><div class="external-center-grid"><strong>Día</strong><strong>Centro externo</strong><strong>Inicio</strong><strong>Fin</strong>${externalHtml}</div><p class="field-hint professional-fieldset-hint">Opcional. La configuración automática PT/AL nunca colocará sesiones dentro de estas franjas.</p></fieldset>
      <div class="form-field full"><label for="observaciones">Observaciones</label><textarea id="observaciones" name="observaciones">${escapeHtml(current.observaciones || '')}</textarea></div>
      <div class="form-field full"><label><input name="activo" type="checkbox" ${current.activo!==false?'checked':''}> Profesional activo</label></div>
    </div>`,
    onOpen: form => {
      const teachingRoot = form.querySelector('#teachingAssignments');
      const responsibilityRoot = form.querySelector('#responsibilities');

      const addTeachingRow = (assignment = {}) => {
        const row = document.createElement('div');
        row.className = 'teaching-assignment-row';
        const existingGroup = assignment.grupoClase || '';
        const groups = [...classGroups];
        if (existingGroup && !groups.includes(existingGroup)) groups.push(existingGroup);
        row.innerHTML = `<select data-teaching-group aria-label="Clase">${groups.length ? `<option value="">Clase…</option>${groups.map(group => `<option value="${escapeHtml(group)}" ${group===existingGroup?'selected':''}>${escapeHtml(group)}</option>`).join('')}` : '<option value="">Configura las clases del centro</option>'}</select><select data-teaching-subject aria-label="Asignatura"></select><button class="icon-button" type="button" data-remove-row aria-label="Eliminar asignación">✕</button>`;
        teachingRoot.appendChild(row);
        refreshSubjectOptions(row, assignment.materia || '', state);
      };

      const addResponsibilityRow = (responsibility = {}) => {
        const row = document.createElement('div');
        row.className = 'responsibility-row';
        const hours = responsibility.weeklyMinutes ? Number((responsibility.weeklyMinutes / 60).toFixed(2)) : '';
        row.innerHTML = `<select data-responsibility-type aria-label="Tipo de función">${RESPONSIBILITY_TYPES.map(option => `<option value="${option.value}" ${option.value===responsibility.tipo?'selected':''}>${escapeHtml(option.label)}</option>`).join('')}</select><input data-responsibility-name aria-label="Nombre de la función" value="${escapeHtml(responsibility.nombre || '')}" placeholder="Ej.: Coordinación TIC"><input data-responsibility-hours type="number" min="0" step="0.25" value="${hours}" aria-label="Horas semanales" placeholder="h/sem"><button class="icon-button" type="button" data-remove-row aria-label="Eliminar función">✕</button>`;
        responsibilityRoot.appendChild(row);
      };

      current.teachingAssignments.forEach(addTeachingRow);
      current.responsibilities.forEach(addResponsibilityRow);
      form.querySelector('[data-add-teaching]')?.addEventListener('click', () => addTeachingRow());
      form.querySelector('[data-add-responsibility]')?.addEventListener('click', () => addResponsibilityRow({ tipo:'coordinacion' }));
      form.addEventListener('change', event => {
        if (event.target.matches('[data-teaching-group]')) refreshSubjectOptions(event.target.closest('.teaching-assignment-row'), '', state);
      });
      form.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-row]');
        if (remove) remove.closest('.teaching-assignment-row, .responsibility-row')?.remove();
      });
    },
    onSubmit: async (data, form, message) => {
      const nombre=data.get('nombre')?.trim(); const tipo=data.get('tipo'); const maxMinutes=targetFromParts(data.get('maxHours'),data.get('maxMinutes'));
      if(!nombre){setModalMessage(message,'El nombre es obligatorio.');return false;} if(!PROFESSIONAL_TYPES.includes(tipo)){setModalMessage(message,'Selecciona un perfil profesional válido.');return false;} if(!Number.isFinite(maxMinutes)){setModalMessage(message,'El máximo semanal no es válido.');return false;}
      const disponibilidadBase={};
      const rawExternalBlocks={};
      for(const day of DAYS){
        const inicio=data.get(`${day.id}_inicio`);const fin=data.get(`${day.id}_fin`);
        if(inicio&&fin){if(fin<=inicio){setModalMessage(message,`La disponibilidad del ${day.label.toLowerCase()} termina antes de empezar.`);return false;}disponibilidadBase[day.id]=[{inicio,fin}];}else disponibilidadBase[day.id]=[];
        const centro=data.get(`${day.id}_centro_externo`)?.trim() || '';
        const externoInicio=data.get(`${day.id}_externo_inicio`) || '';
        const externoFin=data.get(`${day.id}_externo_fin`) || '';
        const anyExternal=Boolean(centro||externoInicio||externoFin);
        const completeExternal=Boolean(centro&&externoInicio&&externoFin);
        if(anyExternal&&!completeExternal){setModalMessage(message,`${day.label}: para bloquear otro centro indica nombre, inicio y fin.`);return false;}
        if(completeExternal){
          if(externoFin<=externoInicio){setModalMessage(message,`${day.label}: la franja del centro externo termina antes de empezar.`);return false;}
          rawExternalBlocks[day.id]=[{centro,inicio:externoInicio,fin:externoFin}];
        } else rawExternalBlocks[day.id]=[];
      }
      const teachingAssignments = normalizeTeachingAssignments([...form.querySelectorAll('.teaching-assignment-row')].map(row => ({
        grupoClase:row.querySelector('[data-teaching-group]')?.value || '',
        materia:row.querySelector('[data-teaching-subject]')?.value || ''
      })));
      const responsibilities = normalizeResponsibilities([...form.querySelectorAll('.responsibility-row')].map(row => ({
        tipo:row.querySelector('[data-responsibility-type]')?.value || 'otra',
        nombre:row.querySelector('[data-responsibility-name]')?.value || '',
        weeklyMinutes:Math.round((Number(row.querySelector('[data-responsibility-hours]')?.value) || 0) * 60)
      })));
      const bloqueosExternos=normalizeExternalBlocks(rawExternalBlocks);
      const disponibilidad=effectiveAvailability(disponibilidadBase,bloqueosExternos);
      await onSave(normalizeProfessionalProfile({...current,id:current.id||uid('prof'),nombre,tipo,especialidad:data.get('especialidad')?.trim(),tutoriaGrupo:data.get('tutoriaGrupo')?.trim(),teachingAssignments,responsibilities,maxWeeklyMinutes:maxMinutes,disponibilidadBase,disponibilidad,bloqueosExternos,observaciones:data.get('observaciones')?.trim(),activo:data.get('activo')==='on'})); return true;
    }
  });
}

function refreshSubjectOptions(row, preferred, state) {
  if (!row) return;
  const group = row.querySelector('[data-teaching-group]')?.value || '';
  const course = courseForClassGroup(state?.schoolSettings, group);
  const subjects = subjectsForStage(stageForCourse(course));
  const select = row.querySelector('[data-teaching-subject]');
  if (!select) return;
  const current = preferred || select.value;
  const values = [...subjects];
  if (current && !values.includes(current)) values.push(current);
  select.innerHTML = `<option value="">Asignatura…</option>${values.map(subject => `<option value="${escapeHtml(subject)}" ${subject===current?'selected':''}>${escapeHtml(subject)}</option>`).join('')}`;
}

function responsibilityLabel(type) {
  return RESPONSIBILITY_TYPES.find(option => option.value === type)?.label || 'Función';
}
