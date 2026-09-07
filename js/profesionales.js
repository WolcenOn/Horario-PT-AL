import { DAYS } from './constants.js';
import { configuredClassGroups, courseForClassGroup, stageForCourse } from './education.js';
import { FIXED_SUBJECT_NAMES, subjectsForStage } from './subjects.js';
import {
  PROFESSIONAL_TYPES,
  RESPONSIBILITY_TYPES,
  TEACHER_ROLES,
  TUTOR_PREFERENCES,
  normalizeAllowedSubjects,
  normalizeProfessionalProfile,
  normalizeResponsibilities,
  normalizeTeachingAssignments
} from './center-planning.js';
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
    const permissions = prof.allowedSubjects || [];
    const specialties = prof.specialtySubjects || [];
    return `<tr>
      <td class="name-cell"><strong>${escapeHtml(prof.nombre)}</strong><small>${escapeHtml(prof.especialidad || (prof.tipo === 'DOCENTE' ? 'Docente' : prof.tipo))} · ${teacherRoleLabel(prof.teacherRole)} · ${prof.activo === false ? 'Inactivo' : 'Activo'}</small></td>
      <td><span class="badge ${typeBadge}">${escapeHtml(prof.tipo)}</span></td>
      <td>${escapeHtml(prof.tutoriaGrupo || '—')}<small>${escapeHtml(tutorPreferenceLabel(prof.tutorPreference))}</small></td>
      <td>${specialties.length ? `<div class="professional-external-summary">${specialties.map(item => `<span><strong>★</strong> ${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${permissions.length ? `<div class="professional-external-summary">${permissions.slice(0,5).map(item => `<span>${escapeHtml(item)}</span>`).join('')}${permissions.length > 5 ? `<span>+ ${permissions.length - 5} más</span>` : ''}</div>` : '—'}</td>
      <td>${teaching.length ? `<div class="professional-external-summary">${teaching.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${functions.length ? `<div class="professional-external-summary">${functions.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${formatDuration(prof.maxWeeklyMinutes || 0)}</td>
      <td>${external.length ? `<div class="professional-external-summary">${external.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td class="table-actions"><button class="button" data-edit="${prof.id}" type="button">Editar</button><button class="button button-danger" data-delete="${prof.id}" type="button">Eliminar</button></td>
    </tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Profesorado del centro</h2><small>Perfiles, tutorías, especialidades, materias habilitadas, docencia fijada, funciones y disponibilidad.</small></div><span class="badge badge-neutral">${state.professionals.length} profesionales</span></div><div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Tipo</th><th>Tutoría</th><th>Especialidad principal</th><th>Puede impartir</th><th>Docencia fijada</th><th>Funciones</th><th>Capacidad semanal</th><th>Otros centros</th><th>Acciones</th></tr></thead><tbody>${rows || `<tr><td colspan="10"><div class="empty-state"><strong>No hay profesorado</strong>Utiliza “Nuevo profesor” para comenzar.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

export function openProfessionalForm(professional, { state, onSave }) {
  const current = normalizeProfessionalProfile(professional || { tipo:'PT', activo:true, disponibilidad:{}, disponibilidadBase:{}, bloqueosExternos:{} });
  const max = minutesParts(current.maxWeeklyMinutes || 0);
  const minTutor = minutesParts(current.minimumTutorMinutes || 0);
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
  const classOptions = `<option value="">Sin tutoría fijada</option>${classGroups.map(group => `<option value="${escapeHtml(group)}" ${current.tutoriaGrupo === group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}${current.tutoriaGrupo && !classGroups.includes(current.tutoriaGrupo) ? `<option value="${escapeHtml(current.tutoriaGrupo)}" selected>${escapeHtml(current.tutoriaGrupo)} · dato existente</option>` : ''}`;
  const permissionSubjects = [...new Set([...FIXED_SUBJECT_NAMES, ...(current.allowedSubjects || []), ...(current.specialtySubjects || [])])];
  const permissionsHtml = permissionSubjects.map(subject => `<label><input type="checkbox" name="allowedSubject" value="${escapeHtml(subject)}" ${(current.allowedSubjects || []).includes(subject) ? 'checked' : ''}><span>${escapeHtml(subject)}</span></label>`).join('');
  const specialtiesHtml = permissionSubjects.map(subject => `<label><input type="checkbox" name="specialtySubject" value="${escapeHtml(subject)}" ${(current.specialtySubjects || []).includes(subject) ? 'checked' : ''}><span>${escapeHtml(subject)}</span></label>`).join('');

  showModal({
    title: professional ? 'Editar profesional' : 'Nuevo profesional',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
      <div class="form-field"><label for="tipo">Tipo *</label><select id="tipo" name="tipo">${PROFESSIONAL_TYPES.map(type => `<option value="${type}" ${current.tipo===type?'selected':''}>${type === 'DOCENTE' ? 'Docente ordinario' : type}</option>`).join('')}</select></div>
      <div class="form-field"><label for="especialidad">Especialidad / puesto</label><input id="especialidad" name="especialidad" value="${escapeHtml(current.especialidad || '')}" placeholder="Primaria, Inglés, Música, PT…"></div>
      <div class="form-field"><label for="teacherRole">Papel en la plantilla</label><select id="teacherRole" name="teacherRole">${TEACHER_ROLES.map(item => `<option value="${item.value}" ${current.teacherRole===item.value?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select><span class="field-hint">Sirve para analizar qué especialistas podrían asumir tutoría si faltan generalistas.</span></div>
      <div class="form-field"><label for="tutoriaGrupo">Tutoría fijada</label><select id="tutoriaGrupo" name="tutoriaGrupo">${classOptions}</select></div>
      <div class="form-field"><label for="tutorPreference">Disponibilidad para tutoría</label><select id="tutorPreference" name="tutorPreference">${TUTOR_PREFERENCES.map(item => `<option value="${item.value}" ${current.tutorPreference===item.value?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
      <div class="form-field full"><fieldset><legend>Presencia mínima deseada con su tutoría</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="minTutorHours" type="number" min="0" value="${minTutor.hours}"></div><div class="form-field"><label>Minutos</label><input name="minTutorMinutes" type="number" min="0" max="59" value="${minTutor.minutes}"></div></div><p class="field-hint">El solver de reparto intenta que el tutor conserve una presencia significativa con su grupo.</p></fieldset></div>
      <fieldset class="full"><legend>Materias de especialidad principal</legend><div class="subject-permission-grid">${specialtiesHtml}</div><p class="field-hint">Estas materias tienen prioridad para este docente. Si además puede impartir generalistas, márcalas abajo; el sistema intentará no gastar horas del especialista en otras materias mientras quede carga de su especialidad por cubrir.</p></fieldset>
      <fieldset class="full"><legend>Materias que puede impartir</legend><div class="subject-permission-grid">${permissionsHtml}</div><p class="field-hint">Marca todas las habilitaciones reales, no solo su especialidad. Las materias de especialidad y las asignaciones fijadas se incluyen automáticamente.</p></fieldset>
      <fieldset class="full"><legend>Asignaturas y clases ya fijadas</legend><div id="teachingAssignments" class="teaching-assignment-list"></div><button class="button" type="button" data-add-teaching>+ Fijar asignatura / clase</button><p class="field-hint">Una asignación aquí significa “este docente debe impartir esta materia a este grupo”. Déjala sin fijar si quieres que el solver pueda decidir.</p></fieldset>
      <fieldset class="full"><legend>Coordinaciones, planes y programas</legend><div id="responsibilities" class="responsibility-list"></div><button class="button" type="button" data-add-responsibility>+ Añadir función</button><p class="field-hint">Estas horas se descuentan de la capacidad disponible para docencia ordinaria.</p></fieldset>
      <fieldset class="full"><legend>Capacidad lectiva semanal computable</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="maxHours" type="number" min="0" value="${max.hours}"></div><div class="form-field"><label>Minutos</label><input name="maxMinutes" type="number" min="0" max="59" value="${max.minutes}"></div></div><p class="field-hint">Si queda en 0, el Estudio de plantilla utilizará la suma de la disponibilidad semanal como capacidad provisional.</p></fieldset>
      <fieldset class="full"><legend>Disponibilidad lectiva total</legend><div class="availability-grid"><strong>Día</strong><strong>Inicio</strong><strong>Fin</strong>${availabilityHtml}</div></fieldset>
      <fieldset class="full"><legend>Presencia en otros centros</legend><div class="external-center-grid"><strong>Día</strong><strong>Centro externo</strong><strong>Inicio</strong><strong>Fin</strong>${externalHtml}</div></fieldset>
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
        if (event.target.matches('[name="specialtySubject"]') && event.target.checked) {
          const allowed = [...form.querySelectorAll('[name="allowedSubject"]')].find(item => item.value === event.target.value);
          if (allowed) allowed.checked = true;
        }
      });
      form.addEventListener('click', event => {
        const remove = event.target.closest('[data-remove-row]');
        if (remove) remove.closest('.teaching-assignment-row, .responsibility-row')?.remove();
      });
    },
    onSubmit: async (data, form, message) => {
      const nombre=data.get('nombre')?.trim();
      const tipo=data.get('tipo');
      const maxMinutes=targetFromParts(data.get('maxHours'),data.get('maxMinutes'));
      const minimumTutorMinutes=targetFromParts(data.get('minTutorHours'),data.get('minTutorMinutes'));
      if(!nombre){setModalMessage(message,'El nombre es obligatorio.');return false;}
      if(!PROFESSIONAL_TYPES.includes(tipo)){setModalMessage(message,'Selecciona un tipo profesional válido.');return false;}
      if(!Number.isFinite(maxMinutes)||!Number.isFinite(minimumTutorMinutes)){setModalMessage(message,'Revisa las cargas horarias indicadas.');return false;}
      const disponibilidadBase={};
      const rawExternalBlocks={};
      for(const day of DAYS){
        const inicio=data.get(`${day.id}_inicio`); const fin=data.get(`${day.id}_fin`);
        if(inicio&&fin){if(fin<=inicio){setModalMessage(message,`La disponibilidad del ${day.label.toLowerCase()} termina antes de empezar.`);return false;} disponibilidadBase[day.id]=[{inicio,fin}];} else disponibilidadBase[day.id]=[];
        const centro=data.get(`${day.id}_centro_externo`)?.trim() || '';
        const externoInicio=data.get(`${day.id}_externo_inicio`) || '';
        const externoFin=data.get(`${day.id}_externo_fin`) || '';
        const anyExternal=Boolean(centro||externoInicio||externoFin);
        const completeExternal=Boolean(centro&&externoInicio&&externoFin);
        if(anyExternal&&!completeExternal){setModalMessage(message,`${day.label}: para bloquear otro centro indica nombre, inicio y fin.`);return false;}
        if(completeExternal){if(externoFin<=externoInicio){setModalMessage(message,`${day.label}: la franja del centro externo termina antes de empezar.`);return false;} rawExternalBlocks[day.id]=[{centro,inicio:externoInicio,fin:externoFin}];} else rawExternalBlocks[day.id]=[];
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
      const specialtySubjects = normalizeAllowedSubjects(data.getAll('specialtySubject'));
      const allowedSubjects = normalizeAllowedSubjects([
        ...data.getAll('allowedSubject'),
        ...specialtySubjects,
        ...teachingAssignments.map(item => item.materia)
      ]);
      const bloqueosExternos=normalizeExternalBlocks(rawExternalBlocks);
      const disponibilidad=effectiveAvailability(disponibilidadBase,bloqueosExternos);
      await onSave(normalizeProfessionalProfile({
        ...current,
        id:current.id||uid('prof'),
        nombre,
        tipo,
        especialidad:data.get('especialidad')?.trim(),
        teacherRole:data.get('teacherRole'),
        tutorPreference:data.get('tutorPreference'),
        minimumTutorMinutes,
        allowedSubjects,
        specialtySubjects,
        tutoriaGrupo:data.get('tutoriaGrupo')?.trim(),
        teachingAssignments,
        responsibilities,
        maxWeeklyMinutes:maxMinutes,
        disponibilidadBase,
        disponibilidad,
        bloqueosExternos,
        observaciones:data.get('observaciones')?.trim(),
        activo:data.get('activo')==='on'
      }));
      return true;
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

function teacherRoleLabel(value) {
  return TEACHER_ROLES.find(option => option.value === value)?.label || 'Sin perfil';
}

function tutorPreferenceLabel(value) {
  return TUTOR_PREFERENCES.find(option => option.value === value)?.label || '';
}