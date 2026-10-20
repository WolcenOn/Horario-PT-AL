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
import { summarizeProfessionalWorkload } from './professional-schedule.js';
import { effectiveAvailability, externalBlocksForDay, normalizeExternalBlocks } from './professional-availability.js';
import {normalizeTeacherEmail} from './absence-email.js';
import {auditTeacherAccountContacts,staffContactLabel} from './teacher-account-contacts.js';

export function renderProfessionals(root, { state, onEdit, onDelete }) {
  const accountContacts=auditTeacherAccountContacts(state.professionals);
  const contactById=new Map(accountContacts.entries.map(row=>[row.id,row]));
  const rows = [...state.professionals].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')).map(raw => {
    const prof = normalizeProfessionalProfile(raw);
    const contact=contactById.get(prof.id);
    const workload = summarizeProfessionalWorkload(state, prof.id);
    const difference = workload?.differenceMinutes;
    const differenceClass = difference === null ? 'is-undefined'
      : difference < 0 ? 'is-exceeded' : difference === 0 ? 'is-balanced' : 'is-pending';
    const differenceLabel = difference === null ? 'Sin capacidad definida'
      : difference < 0 ? `Exceso ${formatDuration(-difference)}`
      : difference === 0 ? 'Completa' : `Faltan ${formatDuration(difference)}`;
    const capacityLabel = workload.capacitySource === 'undefined' ? 'Sin definir'
      : formatDuration(workload.capacityMinutes);
    const external = DAYS.flatMap(day => externalBlocksForDay(prof, day.id).map(block => `${day.label.slice(0,3)} ${block.centro} ${block.inicio}–${block.fin}`));
    const typeBadge = prof.tipo === 'PT' ? 'badge-pt' : prof.tipo === 'AL' ? 'badge-al' : 'badge-neutral';
    const teaching = prof.teachingAssignments.map(item => `${item.grupoClase} · ${item.materia}`);
    const functions = prof.responsibilities.map(item => `${responsibilityLabel(item.tipo)}: ${item.nombre}${item.weeklyMinutes ? ` (${formatDuration(item.weeklyMinutes)})` : ''}`);
    const permissions = prof.allowedSubjects || [];
    const specialties = prof.specialtySubjects || [];
    return `<tr>
      <td class="name-cell">
        <div class="professional-name-row">
          <strong>${escapeHtml(prof.nombre)}</strong>
          <div class="professional-name-actions">
            <button class="professional-icon-action" type="button" data-edit="${escapeHtml(prof.id)}"
              aria-label="Editar ficha de ${escapeHtml(prof.nombre)}" title="Editar ficha de ${escapeHtml(prof.nombre)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/></svg>
            </button>
            <button class="professional-icon-action is-danger" type="button" data-delete="${escapeHtml(prof.id)}"
              aria-label="Eliminar ficha de ${escapeHtml(prof.nombre)}" title="Eliminar ficha de ${escapeHtml(prof.nombre)}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
                stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M5 6l1 14h12l1-14"/><path d="M10 10v7M14 10v7"/></svg>
            </button>
          </div>
        </div>
        <small>${escapeHtml(prof.especialidad || (prof.tipo === 'DOCENTE' ? 'Docente' : prof.tipo))} · ${teacherRoleLabel(prof.teacherRole)} · ${prof.activo === false ? 'Inactivo' : 'Activo'}</small>
      </td>
      <td><span class="badge ${typeBadge}">${escapeHtml(prof.tipo)}</span></td>
      <td>${escapeHtml(prof.tutoriaGrupo || '—')}<small>${escapeHtml(tutorPreferenceLabel(prof.tutorPreference))}</small></td>
      <td>${specialties.length ? `<div class="professional-external-summary">${specialties.map(item => `<span><strong>★</strong> ${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${permissions.length ? `<div class="professional-external-summary">${permissions.slice(0,5).map(item => `<span>${escapeHtml(item)}</span>`).join('')}${permissions.length > 5 ? `<span>+ ${permissions.length - 5} más</span>` : ''}</div>` : '—'}</td>
      <td>${teaching.length ? `<div class="professional-external-summary">${teaching.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td>${functions.length ? `<div class="professional-external-summary">${functions.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td data-capacity-id="${escapeHtml(prof.id)}">
        <strong>${capacityLabel}</strong>
        ${workload.capacitySource === 'availability' ? '<small>Según disponibilidad</small>' : ''}
      </td>
      <td data-programmed-id="${escapeHtml(prof.id)}">
        <strong>${formatDuration(workload.scheduledMinutes)}</strong>
        <small class="professional-load-status ${differenceClass}">${differenceLabel}</small>
        ${workload.overlapMinutes ? `<small class="professional-load-status is-exceeded">Solapes: ${formatDuration(workload.overlapMinutes)}</small>` : ''}
      </td>
      <td>${external.length ? `<div class="professional-external-summary">${external.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : '—'}</td>
      <td data-teacher-account-contact="${escapeHtml(contact?.status||'missing')}">${contact?.email?escapeHtml(contact.email):'—'}<small>${escapeHtml(staffContactLabel(contact?.status))}</small></td>
     </tr>`;
  }).join('');
  root.innerHTML = `<section class="card"><div class="card-header"><div><h2>Profesorado del centro</h2><small>Usa el lápiz junto al nombre para editar. «Programado» suma el tiempo ocupado en clases ordinarias, apoyos PT/AL y actividades con horario; no cuenta funciones sin franja ni asignaciones pendientes de colocar. El guardado sigue siendo local hasta sincronizar.</small></div><span class="badge badge-neutral">${state.professionals.length} profesionales</span></div><p class="absence-guidance" data-teacher-account-summary>Correos individuales registrados: ${accountContacts.summary.contactOnly} de ${accountContacts.summary.total}. Sin correo: ${accountContacts.summary.missing}; formato incorrecto: ${accountContacts.summary.invalid}; compartidos: ${accountContacts.summary.shared}. <strong>El correo de contacto no constituye una cuenta de acceso verificada.</strong> Es necesario activar una cuenta remota y acreditar el control del buzón antes de recuperar contraseñas.</p><div class="table-wrap"><table><thead><tr><th>Profesional</th><th>Tipo</th><th>Tutoría</th><th>Especialidad principal</th><th>Puede impartir</th><th>Docencia fijada</th><th>Funciones</th><th>Capacidad semanal</th><th>Programado</th><th>Otros centros</th><th>Correo y futuro acceso</th></tr></thead><tbody>${rows || `<tr><td colspan="11"><div class="empty-state"><strong>No hay profesorado</strong>Utiliza “Nuevo profesor” para comenzar.</div></td></tr>`}</tbody></table></div></section>`;
  root.onclick = event => { const e=event.target.closest('[data-edit]'); const d=event.target.closest('[data-delete]'); if(e)onEdit(e.dataset.edit); if(d)onDelete(d.dataset.delete); };
}

function availabilityRow(day, interval = {}) {
  return `<div class="professional-schedule-row" data-availability-row>
    <input type="time" data-availability-start aria-label="${day.label} inicio de disponibilidad"
      value="${escapeHtml(interval.inicio || '')}">
    <input type="time" data-availability-end aria-label="${day.label} fin de disponibilidad"
      value="${escapeHtml(interval.fin || '')}">
    <button class="button button-ghost" type="button" data-remove-schedule-row>Quitar</button>
  </div>`;
}

function externalBlockRow(day, block = {}) {
  return `<div class="professional-schedule-row professional-external-row" data-external-row>
    <input data-external-center aria-label="${day.label} nombre del centro externo"
      placeholder="Otro centro" value="${escapeHtml(block.centro || '')}">
    <input type="time" data-external-start aria-label="${day.label} inicio del centro externo"
      value="${escapeHtml(block.inicio || '')}">
    <input type="time" data-external-end aria-label="${day.label} fin del centro externo"
      value="${escapeHtml(block.fin || '')}">
    <button class="button button-ghost" type="button" data-remove-schedule-row>Quitar</button>
  </div>`;
}

function overlappingIntervals(intervals) {
  return intervals.some((a, i) => intervals.slice(i + 1).some(b =>
    a.inicio < b.fin && b.inicio < a.fin
  ));
}

export function openProfessionalForm(professional, { state, onSave }) {
  const current = normalizeProfessionalProfile(professional || { tipo:'PT', activo:true, disponibilidad:{}, disponibilidadBase:{}, bloqueosExternos:{} });
  const workload = professional?.id ? summarizeProfessionalWorkload(state, professional.id) : null;
  const max = minutesParts(current.maxWeeklyMinutes || 0);
  const minTutor = minutesParts(current.minimumTutorMinutes || 0);
  const baseAvailability = current.disponibilidadBase || current.disponibilidad || {};
  const classGroups = configuredClassGroups(state?.schoolSettings);
  const availabilityHtml = DAYS.map(day => {
    const currentIntervals = Array.isArray(baseAvailability?.[day.id])
      ? baseAvailability[day.id] : [];
    const intervals = currentIntervals.length ? currentIntervals
      : professional ? [] : [{ inicio:'09:00', fin:'14:00' }];
    return `<div class="professional-day-entry" data-availability-day="${day.id}">
      <strong>${day.label}</strong>
      <div class="professional-day-rows" data-availability-rows>
        ${intervals.map(interval => availabilityRow(day, interval)).join('')}
      </div>
      <button class="button button-ghost" type="button" data-add-availability="${day.id}">
        + Añadir franja</button>
    </div>`;
  }).join('');
  const externalHtml = DAYS.map(day => `<div class="professional-day-entry"
    data-external-day="${day.id}">
    <strong>${day.label}</strong>
    <div class="professional-day-rows" data-external-rows>
      ${externalBlocksForDay(current, day.id).map(block => externalBlockRow(day, block)).join('')}
    </div>
    <button class="button button-ghost" type="button" data-add-external="${day.id}">
      + Añadir tramo en otro centro</button>
  </div>`).join('');
  const classOptions = `<option value="">Sin tutoría fijada</option>${classGroups.map(group => `<option value="${escapeHtml(group)}" ${current.tutoriaGrupo === group ? 'selected' : ''}>${escapeHtml(group)}</option>`).join('')}${current.tutoriaGrupo && !classGroups.includes(current.tutoriaGrupo) ? `<option value="${escapeHtml(current.tutoriaGrupo)}" selected>${escapeHtml(current.tutoriaGrupo)} · dato existente</option>` : ''}`;
  const permissionSubjects = [...new Set([...FIXED_SUBJECT_NAMES, ...(current.allowedSubjects || []), ...(current.specialtySubjects || [])])];
  const permissionsHtml = permissionSubjects.map(subject => `<label><input type="checkbox" name="allowedSubject" value="${escapeHtml(subject)}" ${(current.allowedSubjects || []).includes(subject) ? 'checked' : ''}><span>${escapeHtml(subject)}</span></label>`).join('');
  const specialtiesHtml = permissionSubjects.map(subject => `<label><input type="checkbox" name="specialtySubject" value="${escapeHtml(subject)}" ${(current.specialtySubjects || []).includes(subject) ? 'checked' : ''}><span>${escapeHtml(subject)}</span></label>`).join('');

  showModal({
    title: professional ? 'Editar profesional' : 'Nuevo profesional',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="nombre">Nombre *</label><input id="nombre" name="nombre" required value="${escapeHtml(current.nombre || '')}"></div>
      <div class="form-field"><label for="teacherEmail">Correo electrónico profesional (opcional)</label><input id="teacherEmail" name="teacherEmail" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(current.email||'')}" placeholder="nombre@centro.es"><small class="field-hint">Se guarda localmente y en las copias JSON para avisos. Puede reutilizarse para una cuenta personal solo cuando se cree la cuenta y se verifique el buzón. Modificarlo aquí NO crea, verifica ni cambia una cuenta ni habilita recuperar contraseñas.</small></div>
      <div class="form-field"><label for="tipo">Tipo *</label><select id="tipo" name="tipo">${PROFESSIONAL_TYPES.map(type => `<option value="${type}" ${current.tipo===type?'selected':''}>${type === 'DOCENTE' ? 'Docente ordinario' : type}</option>`).join('')}</select></div>
      <div class="form-field"><label for="supportRoomId">Sala habitual de apoyos (opcional)</label><input id="supportRoomId" name="supportRoomId" maxlength="64" value="${escapeHtml(current.supportRoomId||'')}" placeholder="Ej.: Sala AL"><small class="field-hint">La sala del grupo o de una sesión puede tener prioridad. Se usa solo para la vista previa semanal.</small></div>
      <div class="form-field"><label for="especialidad">Especialidad / puesto</label><input id="especialidad" name="especialidad" value="${escapeHtml(current.especialidad || '')}" placeholder="Primaria, Inglés, Música, PT…"></div>
      <div class="form-field"><label for="teacherRole">Papel en la plantilla</label><select id="teacherRole" name="teacherRole">${TEACHER_ROLES.map(item => `<option value="${item.value}" ${current.teacherRole===item.value?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select><span class="field-hint">Sirve para analizar qué especialistas podrían asumir tutoría si faltan generalistas.</span></div>
      <div class="form-field"><label for="tutoriaGrupo">Tutoría fijada</label><select id="tutoriaGrupo" name="tutoriaGrupo">${classOptions}</select></div>
      <div class="form-field"><label for="tutorPreference">Disponibilidad para tutoría</label><select id="tutorPreference" name="tutorPreference">${TUTOR_PREFERENCES.map(item => `<option value="${item.value}" ${current.tutorPreference===item.value?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
      <div class="form-field full"><fieldset><legend>Presencia mínima deseada con su tutoría</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="minTutorHours" type="number" min="0" value="${minTutor.hours}"></div><div class="form-field"><label>Minutos</label><input name="minTutorMinutes" type="number" min="0" max="59" value="${minTutor.minutes}"></div></div><p class="field-hint">El solver de reparto intenta que el tutor conserve una presencia significativa con su grupo.</p></fieldset></div>
      <fieldset class="full"><legend>Materias de especialidad principal</legend><div class="subject-permission-grid">${specialtiesHtml}</div><p class="field-hint">Estas materias tienen prioridad para este docente. Si además puede impartir generalistas, márcalas abajo; el sistema intentará no gastar horas del especialista en otras materias mientras quede carga de su especialidad por cubrir.</p></fieldset>
      <fieldset class="full"><legend>Materias que puede impartir</legend><div class="subject-permission-grid">${permissionsHtml}</div><p class="field-hint">Marca todas las habilitaciones reales, no solo su especialidad. Las materias de especialidad y las asignaciones fijadas se incluyen automáticamente.</p></fieldset>
      <fieldset class="full"><legend>Asignaturas y clases ya fijadas</legend><div id="teachingAssignments" class="teaching-assignment-list"></div><button class="button" type="button" data-add-teaching>+ Fijar asignatura / clase</button><p class="field-hint">Una asignación aquí significa “este docente debe impartir esta materia a este grupo”. Déjala sin fijar si quieres que el solver pueda decidir.</p></fieldset>
      <fieldset class="full"><legend>Coordinaciones, planes y programas</legend><div id="responsibilities" class="responsibility-list"></div><button class="button" type="button" data-add-responsibility>+ Añadir función</button><p class="field-hint">Estas horas se descuentan de la capacidad disponible para docencia ordinaria.</p></fieldset>
      <fieldset class="full"><legend>Capacidad lectiva semanal computable</legend><div class="duration-pair"><div class="form-field"><label>Horas</label><input name="maxHours" type="number" min="0" value="${max.hours}"></div><div class="form-field"><label>Minutos</label><input name="maxMinutes" type="number" min="0" max="59" value="${max.minutes}"></div></div><p class="field-hint">Si queda en 0, el Estudio de plantilla utilizará la suma de la disponibilidad semanal como capacidad provisional.</p>
        <div class="professional-form-load" data-professional-form-load>
          <span>Programado en horarios: <strong>${formatDuration(workload?.scheduledMinutes || 0)}</strong></span>
          <span>${workload?.differenceMinutes == null ? 'Sin capacidad definida para comparar' :
            workload.differenceMinutes < 0 ? `Exceso de ${formatDuration(-workload.differenceMinutes)}` :
            workload.differenceMinutes === 0 ? 'Capacidad cubierta' :
            `Faltan ${formatDuration(workload.differenceMinutes)} por programar`}</span>
        </div></fieldset>
      <fieldset class="full"><legend>Disponibilidad lectiva total</legend><p class="field-hint">Puedes tener varias franjas por día. Deja un día sin franjas para indicar que no tienes disponibilidad.</p><div class="professional-day-list">${availabilityHtml}</div></fieldset>
      <fieldset class="full"><legend>Presencia en otros centros</legend><p class="field-hint">Todos los tramos se conservan al editar la ficha; añade o quita los necesarios.</p><div class="professional-day-list">${externalHtml}</div></fieldset>
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
        const addAvailability = event.target.closest('[data-add-availability]');
        if (addAvailability) {
          const day = DAYS.find(item => item.id === addAvailability.dataset.addAvailability);
          form.querySelector(`[data-availability-day="${day.id}"] [data-availability-rows]`)
            ?.insertAdjacentHTML('beforeend', availabilityRow(day));
        }
        const addExternal = event.target.closest('[data-add-external]');
        if (addExternal) {
          const day = DAYS.find(item => item.id === addExternal.dataset.addExternal);
          form.querySelector(`[data-external-day="${day.id}"] [data-external-rows]`)
            ?.insertAdjacentHTML('beforeend', externalBlockRow(day));
        }
        if (event.target.closest('[data-remove-schedule-row]')) {
          event.target.closest('[data-availability-row], [data-external-row]')?.remove();
        }
      });
    },
    onSubmit: async (data, form, message) => {
      const nombre=data.get('nombre')?.trim();
      const tipo=data.get('tipo');
      let email='';
      try{email=normalizeTeacherEmail(data.get('teacherEmail'));}
      catch(error){setModalMessage(message,error.message);return false;}
      const maxMinutes=targetFromParts(data.get('maxHours'),data.get('maxMinutes'));
      const minimumTutorMinutes=targetFromParts(data.get('minTutorHours'),data.get('minTutorMinutes'));
      if(!nombre){setModalMessage(message,'El nombre es obligatorio.');return false;}
      if(!PROFESSIONAL_TYPES.includes(tipo)){setModalMessage(message,'Selecciona un tipo profesional válido.');return false;}
      if(!Number.isFinite(maxMinutes)||!Number.isFinite(minimumTutorMinutes)){setModalMessage(message,'Revisa las cargas horarias indicadas.');return false;}
      const disponibilidadBase={};
      const rawExternalBlocks={};
      for (const day of DAYS) {
        const intervals = [];
        for (const row of form.querySelectorAll(
          `[data-availability-day="${day.id}"] [data-availability-row]`
        )) {
          const inicio = row.querySelector('[data-availability-start]').value;
          const fin = row.querySelector('[data-availability-end]').value;
          if (!inicio && !fin) continue;
          if (!inicio || !fin || fin <= inicio) {
            setModalMessage(message, `Revisa el inicio y el fin de disponibilidad del ${day.label.toLowerCase()}.`);
            return false;
          }
          intervals.push({ inicio, fin });
        }
        if (overlappingIntervals(intervals)) {
          setModalMessage(message, `Hay franjas de disponibilidad solapadas el ${day.label.toLowerCase()}.`);
          return false;
        }
        disponibilidadBase[day.id] = intervals;
        const external = [];
        for (const row of form.querySelectorAll(
          `[data-external-day="${day.id}"] [data-external-row]`
        )) {
          const centro = row.querySelector('[data-external-center]').value.trim();
          const inicio = row.querySelector('[data-external-start]').value;
          const fin = row.querySelector('[data-external-end]').value;
          if (!centro && !inicio && !fin) continue;
          if (!centro || !inicio || !fin || fin <= inicio) {
            setModalMessage(message, `${day.label}: cada tramo de otro centro necesita nombre, inicio y fin válidos.`);
            return false;
          }
          external.push({ centro, inicio, fin });
        }
        if (overlappingIntervals(external)) {
          setModalMessage(message, `Hay tramos de otros centros solapados el ${day.label.toLowerCase()}.`);
          return false;
        }
        rawExternalBlocks[day.id] = external;
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
        email,
        especialidad:data.get('especialidad')?.trim(),
        supportRoomId:String(data.get('supportRoomId')||'').trim().slice(0,64),
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