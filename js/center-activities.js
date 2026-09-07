import { CENTER_ACTIVITY_CATEGORIES, normalizeCenterPlanningSettings, normalizeWeeklyActivities } from './center-planning.js';
import { configuredClassGroups } from './education.js';
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
      <div><p class="eyebrow">Carga semanal no curricular</p><h2>Actividades del centro</h2><p>Configura biblioteca, lectura, coordinaciones, apoyos, planes y otras tareas que consumen tiempo del profesorado. Una actividad puede quedar fijada a docentes concretos o dejar candidatos preparados para que el optimizador decida más adelante.</p></div>
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
      <div class="card-header"><div><h2>Catálogo semanal</h2><small>La carga de las actividades fijadas ya puede descontarse del Estudio de plantilla. La colocación exacta en día y hora se incorporará al generador semanal.</small></div><span class="badge badge-neutral">${activities.length} definidas</span></div>
      <div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Categoría</th><th>Carga</th><th>Bloque habitual</th><th>Personal</th><th>Asignados</th><th>Candidatos</th><th>Clases</th><th>Acciones</th></tr></thead><tbody>
        ${activities.map(item => activityRow(item, professionalMap)).join('') || `<tr><td colspan="9"><div class="empty-state"><strong>Sin actividades adicionales</strong>Añade Biblioteca, Plan lector, coordinaciones u otras tareas que deban entrar en la carga semanal.</div></td></tr>`}
      </tbody></table></div>
    </section>
    <section class="card activity-help"><div class="card-header"><div><h2>Cómo se interpretará</h2></div></div><div class="card-body activity-help-grid">
      <div><strong>Biblioteca · 2 h</strong><span>Puede asignarse a un docente concreto o a varios candidatos. Si requiere 1 persona, el futuro solver elegirá solo una.</span></div>
      <div><strong>Lectura · 1 h</strong><span>Puede asociarse a una o varias clases para reservar tiempo del profesor responsable del plan lector.</span></div>
      <div><strong>Coordinación · 1 h</strong><span>Si tiene varios docentes fijados, cada uno consume esa hora y después deberán coincidir en la misma franja.</span></div>
      <div><strong>Movible</strong><span>Indica si el generador puede elegir la franja. Una actividad no movible deberá fijarse más adelante a una hora concreta.</span></div>
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
    active:true,
    notes:''
  };
  const teachers = (state.professionals || []).filter(item => item.activo !== false).sort((a,b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  const classes = configuredClassGroups(state.schoolSettings);
  const assigned = new Set(current.assignedTeacherIds || []);
  const eligible = new Set(current.eligibleTeacherIds || []);
  const selectedClasses = new Set(current.classGroupIds || []);
  showModal({
    title:activity ? 'Editar actividad del centro' : 'Nueva actividad del centro',
    submitLabel:'Guardar actividad',
    bodyHtml:`<div class="form-grid">
      <div class="form-field"><label for="activityName">Nombre *</label><input id="activityName" name="name" required value="${escapeHtml(current.name || '')}" placeholder="Biblioteca, Plan lector, Coordinación de ciclo…"></div>
      <div class="form-field"><label for="activityCategory">Tipo</label><select id="activityCategory" name="category">${CENTER_ACTIVITY_CATEGORIES.map(item => `<option value="${item.value}" ${item.value===current.category?'selected':''}>${escapeHtml(item.label)}</option>`).join('')}</select></div>
      <div class="form-field"><label for="weeklyHours">Carga semanal total</label><input id="weeklyHours" name="weeklyHours" type="number" min="0.25" step="0.25" value="${trimHours(current.weeklyMinutes)}"><span class="field-hint">Tiempo que consume cada docente asignado.</span></div>
      <div class="form-field"><label for="sessionMinutes">Duración habitual de cada bloque</label><select id="sessionMinutes" name="sessionMinutes">${[15,30,45,60,75,90,120].map(value => `<option value="${value}" ${Number(current.sessionMinutes)===value?'selected':''}>${value} min</option>`).join('')}</select></div>
      <div class="form-field"><label for="requiredStaff">Docentes simultáneos necesarios</label><input id="requiredStaff" name="requiredStaff" type="number" min="1" max="20" value="${Math.max(1, Number(current.requiredStaff) || 1)}"></div>
      <div class="form-field"><label><input name="movable" type="checkbox" ${current.movable !== false ? 'checked' : ''}> El optimizador puede elegir la franja</label><label><input name="active" type="checkbox" ${current.active !== false ? 'checked' : ''}> Actividad activa</label></div>
      <fieldset class="full"><legend>Docentes ya asignados</legend><div class="activity-check-grid">${teachers.map(teacher => `<label><input type="checkbox" name="assignedTeacherId" value="${teacher.id}" ${assigned.has(teacher.id)?'checked':''}><span>${escapeHtml(teacher.nombre || 'Sin nombre')}<small>${escapeHtml(teacher.especialidad || teacher.tipo || '')}</small></span></label>`).join('') || '<span class="muted">No hay profesorado activo.</span>'}</div><p class="field-hint">Estos docentes consumen ya la carga semanal indicada. En coordinaciones con varias personas, marca a todos los participantes.</p></fieldset>
      <fieldset class="full"><legend>Docentes candidatos</legend><div class="activity-check-grid">${teachers.map(teacher => `<label><input type="checkbox" name="eligibleTeacherId" value="${teacher.id}" ${eligible.has(teacher.id)?'checked':''}><span>${escapeHtml(teacher.nombre || 'Sin nombre')}<small>${escapeHtml(teacher.especialidad || teacher.tipo || '')}</small></span></label>`).join('') || '<span class="muted">No hay profesorado activo.</span>'}</div><p class="field-hint">Sirve para actividades todavía no adjudicadas. Más adelante el solver podrá elegir entre estos candidatos intentando equilibrar cargas y movimientos.</p></fieldset>
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
        active:data.get('active') === 'on',
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
  return `<tr class="${item.active === false ? 'is-muted-row' : ''}">
    <td><strong>${escapeHtml(item.name)}</strong><small>${item.active === false ? 'Inactiva' : item.movable ? 'Franja flexible' : 'Franja por fijar'}</small></td>
    <td>${escapeHtml(category)}</td>
    <td>${formatDuration(item.weeklyMinutes)}</td>
    <td>${item.sessionMinutes} min</td>
    <td><span class="badge ${staffClass}">${item.assignedTeacherIds.length}/${item.requiredStaff}</span></td>
    <td>${assignedNames.length ? assignedNames.map(escapeHtml).join(', ') : '—'}</td>
    <td>${eligibleNames.length ? eligibleNames.map(escapeHtml).join(', ') : '—'}</td>
    <td>${item.classGroupIds.length ? item.classGroupIds.map(escapeHtml).join(', ') : '—'}</td>
    <td class="table-actions"><button class="button" data-edit-center-activity="${item.id}" type="button">Editar</button><button class="button button-danger" data-delete-center-activity="${item.id}" type="button">Eliminar</button></td>
  </tr>`;
}

function metric(label, value, className = '') {
  return `<div class="capacity-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function trimHours(minutes) {
  return Number((Math.max(0, Number(minutes) || 0) / 60).toFixed(2));
}
