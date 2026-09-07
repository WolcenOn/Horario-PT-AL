import { CENTER_ACTIVITY_CATEGORIES, normalizeCenterPlanningSettings, normalizeWeeklyActivities } from './center-planning.js';
import { DAYS } from './constants.js';
import { configuredClassGroups } from './education.js';
import { describeTimePattern, validateTimePattern } from './time-patterns.js';
import { escapeHtml, formatDuration, uid } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

export function renderCenterActivities(root, { state, onAdd, onEdit, onDelete }) {
  const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const activities = settings.weeklyActivities;
  const professionalMap = new Map((state.professionals || []).map(item => [item.id, item]));
  const active = activities.filter(item => item.active !== false);
  const totalMinutes = active.reduce((sum, item) => sum + item.weeklyMinutes * Math.max(1, item.assignedTeacherIds.length || item.requiredStaff), 0);
  const pending = active.filter(item => item.assignedTeacherIds.length < item.requiredStaff);
  const categories = new Set(active.map(item => item.category));

  root.innerHTML = `<div class="center-activities-view">
    <section class="card activity-hero">
      <div><p class="eyebrow">Carga semanal no curricular</p><h2>Actividades del centro</h2><p>Configura biblioteca, lectura, coordinaciones, apoyos, planes y otras tareas que consumen tiempo del profesorado. Además de la carga y los candidatos, cada actividad puede definir días permitidos, ventanas horarias y preferencias que utilizará el generador semanal.</p></div>
      <button class="button button-primary" data-add-center-activity type="button">+ Nueva actividad</button>
    </section>
    <section class="capacity-metrics">
      ${metric('Actividades activas', active.length)}
      ${metric('Tipos utilizados', categories.size)}
      ${metric('Carga docente fijada', formatDuration(totalMinutes))}
      ${metric('Pendientes de asignar', pending.length, pending.length ? 'is-warning' : 'is-ok')}
    </section>
    ${pending.length ? `<section class="capacity-banner is-warning"><strong>Hay actividades sin toda la plantilla asignada</strong><span>${pending.slice(0,8).map(item => `${escapeHtml(item.name)} (${item.assignedTeacherIds.length}/${item.requiredStaff})`).join(' · ')}</span></section>` : ''}
    <section class="card">
      <div class="card-header"><div><h2>Catálogo semanal</h2><small>Las actividades fijadas descuentan carga en el Estudio de plantilla y sus patrones temporales ya pueden intervenir en la generación global.</small></div><span class="badge badge-neutral">${activities.length} definidas</span></div>
      <div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Categoría</th><th>Carga</th><th>Bloque</th><th>Personal</th><th>Asignados</th><th>Candidatos</th><th>Clases</th><th>Patrón temporal</th><th>Franja propuesta</th><th>Acciones</th></tr></thead><tbody>
        ${activities.map(item => activityRow(item, professionalMap)).join('') || `<tr><td colspan="11"><div class="empty-state"><strong>Sin actividades adicionales</strong>Añade Biblioteca, Plan lector, coordinaciones u otras tareas que deban entrar en la carga semanal.</div></td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card activity-help"><div class="card-header"><div><h2>Cómo se interpretará</h2></div></div><div class="card-body activity-help-grid">
      <div><strong>Biblioteca · 2 h</strong><span>Puede restringirse a ciertos días o a una ventana, por ejemplo 12:00–14:00, y dejar que el solver elija el docente.</span></div>
      <div><strong>Lectura · 1 h</strong><span>Puede asociarse a una clase y preferir primeras horas, sin convertir esa preferencia en una obligación.</span></div>
      <div><strong>Coordinación · 1 h</strong><span>Todos los docentes asignados deberán coincidir en la misma franja cuando se coloque el bloque.</span></div>
      <div><strong>Recreo</strong><span>Por defecto una actividad evita recreos de las clases asociadas. Puedes permitirlos explícitamente para biblioteca, vigilancia u otras tareas.</span></div>
    </section>
  </div>`;

  root.querySelector('[data-add-center-activity]')?.addEventListener('click', onAdd);
  root.querySelectorAll('[data-edit-center-activity]').forEach(button => button.addEventListener('click', () => onEdit(button.dataset.editCenterActivity)));
  root.querySelectorAll('[data-delete-center-activity]').forEach(button => button.addEventListener('click', () => onDelete(button.dataset.deleteCenterActivity)));
}

export function openCenterActivityForm(activity, { state, onSave }) {
  const current = activity || {
    id:uid('act'),
    name:'',
    category:'biblioteca',
    weeklyMinutes:60,
    sessionMinutes:60,
    requiredStaff:1,
    assignedTeacherIds:[],
    eligibleTeacherIds:[],
    classGroupIds:[],
    movable:true,
    allowDuringRecess:false,
    active:true,
    timePattern:{ allowedDays:[], preferredDays:[], earliestStart:'', latestEnd:'', preferredStart:'', preferredEnd:'', maxSessionsPerDay:1 },
    scheduledSlots:[],
    notes:''
  };
  const teachers = (state.professionals || []).filter(item => item.activo !== false).sort((a,b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const classes = configuredClassGroups(state.schoolSettings);
  const assigned = new Set(current.assignedTeacherIds || []);
  const eligible = new Set(current.eligibleTeacherIds || []);
  const selectedClasses = new Set(current.classGroupIds || []);
  const allowedDays = new Set(current.timePattern?.allowedDays?.length ? current.timePattern.allowedDays : DAYS.map(day => day.id));
  const preferredDays = new Set(current.timePattern?.preferredDays || []);
  showModal({
    title:activity ? 'Editar actividad del centro' : 'Nueva actividad del centro',
    submitLabel:'Guardar actividad',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="activityName">Nombre *</label><input id="activityName" name="name" required value="${escapeHtml(current.name || '')}" placeholder="Biblioteca, Plan lector, Coordinación de ciclo…"></div>
      <div class="form-field"><label for="activityCategory">Tipo</label><select id="activityCategory" name="category">${CENTER_ACTIVITY_CATEGORIES.map(item => `<option value="${item.value}" ${item.value===current.category?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="weeklyHours">Carga semanal total</label><input id="weeklyHours" name="weeklyHours" type="number" min="0.25" step="0.25" value="${trimHours(current.weeklyMinutes)}"><span class="field-hint">Tiempo que consume cada docente asignado.</span></div>
      <div class="form-field"><label for="sessionMinutes">Duración habitual de cada bloque</label><select id="sessionMinutes" name="sessionMinutes">${[15,30,45,60,75,90,120].map(value => `<option value="${value}" ${Number(current.sessionMinutes)===value?'selected':''}>${value} min</option>`).join('')}</select></div>
      <div class="form-field"><label for="requiredStaff">Docentes simultáneos necesarios</label><input id="requiredStaff" name="requiredStaff" type="number" min="1" max="20" value="${Math.max(1, Number(current.requiredStaff) || 1)}"></div>
      <div class="form-field"><label><input name="movable" type="checkbox" ${current.movable !== false ? 'checked' : ''}> Puede recolocarse automáticamente</label><label><input name="allowDuringRecess" type="checkbox" ${current.allowDuringRecess === true ? 'checked' : ''}> Puede coincidir con recreo</label><label><input name="active" type="checkbox" ${current.active !== false ? 'checked' : ''}> Actividad activa</label></div>

      <fieldset class="full"><legend>Patrón temporal · días permitidos</legend><div class="activity-check-grid activity-day-grid">${DAYS.map(day => `<label><input type="checkbox" name="allowedDay" value="${day.id}" ${allowedDays.has(day.id)?'checked':''}><span>${escapeHtml(day.label)}</span></label>`).join('')}</div><p class="field-hint">Restricción dura: el generador no utilizará días desmarcados.</p></fieldset>
      <fieldset class="full"><legend>Patrón temporal · días preferidos</legend><div class="activity-check-grid activity-day-grid">${DAYS.map(day => `<label><input type="checkbox" name="preferredDay" value="${day.id}" ${preferredDays.has(day.id)?'checked':''}><span>${escapeHtml(day.label)}</span></label>`).join('')}</div><p class="field-hint">Preferencia blanda: se intentarán usar antes, pero no bloquean otros días permitidos.</p></fieldset>
      <div class="form-field"><label for="activityEarliestStart">No empezar antes de</label><input id="activityEarliestStart" name="earliestStart" type="time" value="${escapeHtml(current.timePattern?.earliestStart || '')}"></div>
      <div class="form-field"><label for="activityLatestEnd">Terminar como máximo a</label><input id="activityLatestEnd" name="latestEnd" type="time" value="${escapeHtml(current.timePattern?.latestEnd || '')}"></div>
      <div class="form-field"><label for="activityPreferredStart">Preferir desde</label><input id="activityPreferredStart" name="preferredStart" type="time" value="${escapeHtml(current.timePattern?.preferredStart || '')}"></div>
      <div class="form-field"><label for="activityPreferredEnd">Preferir hasta</label><input id="activityPreferredEnd" name="preferredEnd" type="time" value="${escapeHtml(current.timePattern?.preferredEnd || '')}"></div>
      <div class="form-field"><label for="activityMaxPerDay">Máximo de bloques al día</label><select id="activityMaxPerDay" name="maxSessionsPerDay">${[1,2,3,4].map(value => `<option value="${value}" ${Number(current.timePattern?.maxSessionsPerDay || 1)===value?'selected':''}>${value}</option>`).join('')}</select></div>

      <fieldset class="full"><legend>Docentes ya asignados</legend><div class="activity-check-grid">${teachers.map(teacher => `<label><input type="checkbox" name="assignedTeacherId" value="${teacher.id}" ${assigned.has(teacher.id)?'checked':''}><span>${escapeHtml(teacher.nombre || 'Sin nombre')}<small>${escapeHtml(teacher.especialidad || teacher.tipo || '')}</small></span></label>`).join('') || '<span class="muted">No hay profesorado activo.</span>'}</div><p class="field-hint">Estos docentes consumen ya la carga semanal indicada. En coordinaciones con varias personas, marca a todos los participantes.</p></fieldset>
      <fieldset class="full"><legend>Docentes candidatos</legend><div class="activity-check-grid">${teachers.map(teacher => `<label><input type="checkbox" name="eligibleTeacherId" value="${teacher.id}" ${eligible.has(teacher.id)?'checked':''}><span>${escapeHtml(teacher.nombre || 'Sin nombre')}<small>${escapeHtml(teacher.especialidad || teacher.tipo || '')}</small></span></label>`).join('') || '<span class="muted">No hay profesorado activo.</span>'}</div><p class="field-hint">Sirve para actividades todavía no adjudicadas. El solver puede elegir entre estos candidatos intentando equilibrar cargas y movimientos.</p></fieldset>
      <fieldset class="full"><legend>Clases relacionadas (opcional)</legend><div class="activity-check-grid activity-class-grid">${classes.map(group => `<label><input type="checkbox" name="classGroupId" value="${escapeHtml(group)}" ${selectedClasses.has(group)?'checked':''}><span>${escapeHtml(group)}</span></label>`).join('') || '<span class="muted">Configura primero las clases del centro.</span>'}</div></fieldset>
      <div class="form-field full"><label for="activityNotes">Observaciones</label><textarea id="activityNotes" name="notes">${escapeHtml(current.notes || '')}</textarea></div>
    </div>`,
    onSubmit:async (data, _form, message) => {
      const name = String(data.get('name') || '').trim();
      const weeklyMinutes = Math.round((Number(data.get('weeklyHours')) || 0) * 60);
      const sessionMinutes = Math.round(Number(data.get('sessionMinutes')) || 0);
      const requiredStaff = Math.round(Number(data.get('requiredStaff')) || 1);
      if (!name) { setModalMessage(message, 'Indica el nombre de la actividad.'); return false; }
      if (weeklyMinutes <= 0) { setModalMessage(message, 'La carga semanal debe ser mayor que cero.'); return false; }
      if (sessionMinutes <= 0 || sessionMinutes > weeklyMinutes && weeklyMinutes >= 15) {
        setModalMessage(message, 'Revisa la duración habitual del bloque.');
        return false;
      }
      const selectedAllowedDays = data.getAll('allowedDay');
      if (!selectedAllowedDays.length) {
        setModalMessage(message, 'Selecciona al menos un día permitido para la actividad.');
        return false;
      }
      let timePattern;
      try {
        timePattern = validateTimePattern({
          maxSessionsPerDay:Number(data.get('maxSessionsPerDay') || 1),
          allowedDays:selectedAllowedDays,
          preferredDays:data.getAll('preferredDay'),
          earliestStart:String(data.get('earliestStart') || ''),
          latestEnd:String(data.get('latestEnd') || ''),
          preferredStart:String(data.get('preferredStart') || ''),
          preferredEnd:String(data.get('preferredEnd') || '')
        }, name);
      } catch (error) {
        setModalMessage(message, error.message || 'Revisa el patrón temporal.');
        return false;
      }
      const next = normalizeWeeklyActivities([{
        ...current,
        name,
        category:data.get('category'),
        weeklyMinutes,
        sessionMinutes,
        requiredStaff,
        assignedTeacherIds:data.getAll('assignedTeacherId'),
        eligibleTeacherIds:data.getAll('eligibleTeacherId'),
        classGroupIds:data.getAll('classGroupId'),
        movable:data.get('movable') === 'on',
        allowDuringRecess:data.get('allowDuringRecess') === 'on',
        active:data.get('active') === 'on',
        timePattern,
        scheduledSlots:[],
        notes:String(data.get('notes') || '').trim()
      }])[0];
      if (!next) { setModalMessage(message, 'No se pudo normalizar la actividad.'); return false; }
      await onSave(next);
      return true;
    }
  });
}

function activityRow(item, professionalMap) {
  const category = CENTER_ACTIVITY_CATEGORIES.find(option => option.value === item.category)?.label || 'Otra';
  const assignedNames = item.assignedTeacherIds.map(id => professionalMap.get(id)?.nombre || id);
  const eligibleNames = item.eligibleTeacherIds.map(id => professionalMap.get(id)?.nombre || id);
  const staffClass = item.assignedTeacherIds.length < item.requiredStaff ? 'badge-warning' : 'badge-success';
  const scheduled = item.scheduledSlots?.length
    ? item.scheduledSlots.map(slot => `${slot.dia.slice(0,3)} ${slot.inicio}–${slot.fin}`).join(' · ')
    : '—';
  return `<tr class="${item.active === false ? 'is-muted-row' : ''}">
    <td><strong>${escapeHtml(item.name)}</strong><small>${item.active === false ? 'Inactiva' : item.movable ? 'Recolocable' : 'Mantener si ya está fijada'}</small></td>
    <td>${escapeHtml(category)}</td>
    <td>${formatDuration(item.weeklyMinutes)}</td>
    <td>${item.sessionMinutes} min</td>
    <td><span class="badge ${staffClass}">${item.assignedTeacherIds.length}/${item.requiredStaff}</span></td>
    <td>${assignedNames.length ? assignedNames.map(escapeHtml).join(', ') : '—'}</td>
    <td>${eligibleNames.length ? eligibleNames.map(escapeHtml).join(', ') : '—'}</td>
    <td>${item.classGroupIds.length ? item.classGroupIds.map(escapeHtml).join(', ') : '—'}</td>
    <td>${escapeHtml(describeTimePattern(item.timePattern))}${item.allowDuringRecess ? '<small>Recreo permitido</small>' : ''}</td>
    <td>${escapeHtml(scheduled)}</td>
    <td class="table-actions"><button class="button" data-edit-center-activity="${item.id}" type="button">Editar</button><button class="button button-danger" data-delete-center-activity="${item.id}" type="button">Eliminar</button></td>
  </tr>`;
}

function metric(label, value, className = '') {
  return `<div class="capacity-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function trimHours(minutes) {
  return Number((Math.max(0, Number(minutes) || 0) / 60).toFixed(2));
}
