import { DAYS } from './constants.js';
import { COURSE_OPTIONS } from './education.js';
import { curriculumForCourse, normalizeCenterPlanningSettings } from './center-planning.js';
import { describeTimePattern, normalizeTimePattern, subjectPatternForCourse, validateTimePattern } from './time-patterns.js';
import { escapeHtml, formatDuration } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

const SESSION_OPTIONS = [15,30,45,60,75,90,105,120];

export function renderTemporalPatterns(root, { state, onEditSubject, onOpenActivities }) {
  const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const configured = [];
  for (const course of COURSE_OPTIONS) {
    const curriculum = curriculumForCourse(settings, course.value);
    for (const [subject, minutes] of Object.entries(curriculum)) {
      configured.push({
        course:course.value,
        courseLabel:course.label,
        subject,
        minutes,
        pattern:subjectPatternForCourse(settings, course.value, subject)
      });
    }
  }
  const customized = configured.filter(item => describeTimePattern(item.pattern) !== 'Sin restricciones temporales específicas');
  const activityPatterns = settings.weeklyActivities.filter(activity => activity.active !== false);

  root.innerHTML = `<div class="temporal-patterns-view">
    <section class="card temporal-patterns-hero">
      <div><p class="eyebrow">Fase 2 · cuándo puede ocurrir cada cosa</p><h2>Patrones temporales</h2><p>Define duración de sesiones, días permitidos, preferencias y ventanas horarias antes de construir la cuadrícula semanal. Las restricciones duras limitan los huecos; las preferencias solo orientan al generador.</p></div>
      <button class="button" data-open-center-activities type="button">🧩 Actividades del centro</button>
    </section>

    <section class="capacity-metrics">
      ${metric('Materias con carga', configured.length)}
      ${metric('Materias personalizadas', customized.length)}
      ${metric('Actividades activas', activityPatterns.length)}
      ${metric('Rejilla', `${settings.generation.stepMinutes} min`)}
    </section>

    <section class="card temporal-patterns-guide">
      <div class="card-header"><div><h2>Cómo se usan</h2><small>Una restricción imposible impedirá generar una propuesta completa; una preferencia solo suma prioridad.</small></div></div>
      <div class="card-body temporal-guide-grid">
        <div><strong>Días permitidos</strong><span>Restricción dura. Por ejemplo, Música solo martes y jueves.</span></div>
        <div><strong>Ventana permitida</strong><span>Restricción dura. Por ejemplo, Educación Física entre 09:00 y 13:00.</span></div>
        <div><strong>Días / franja preferidos</strong><span>Preferencia blanda. El generador los intentará usar si no perjudica otras necesidades.</span></div>
        <div><strong>Duración y frecuencia</strong><span>La duración mínima/máxima es dura; la preferida guía el reparto. “1 sesión/día” evita repetir una materia el mismo día.</span></div>
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Materias curriculares</h2><small>Solo aparecen las materias con carga semanal configurada en Plan del centro.</small></div><span class="badge badge-neutral">${configured.length}</span></div>
      <div class="temporal-course-list">
        ${COURSE_OPTIONS.map(course => renderCourse(course, configured)).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Actividades no curriculares</h2><small>Biblioteca, Lectura, coordinaciones y otras actividades guardan su propio patrón temporal desde “Actividades del centro”.</small></div><button class="button" data-open-center-activities type="button">Gestionar actividades</button></div>
      <div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Carga</th><th>Bloque</th><th>Patrón</th></tr></thead><tbody>
        ${activityPatterns.map(activity => `<tr><td><strong>${escapeHtml(activity.name)}</strong></td><td>${formatDuration(activity.weeklyMinutes)}</td><td>${activity.sessionMinutes} min</td><td>${escapeHtml(describeTimePattern(activity.timePattern))}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty-state"><strong>Sin actividades activas</strong>Añade Biblioteca, Lectura, coordinaciones u otras tareas desde Actividades del centro.</div></td></tr>'}
      </tbody></table></div>
    </section>
  </div>`;

  root.querySelectorAll('[data-edit-subject-pattern]').forEach(button => button.addEventListener('click', () => {
    onEditSubject(button.dataset.course, button.dataset.subject);
  }));
  root.querySelectorAll('[data-open-center-activities]').forEach(button => button.addEventListener('click', onOpenActivities));
}

export function openSubjectPatternForm({ course, subject, pattern, generation }, { onSave }) {
  const current = normalizeTimePattern(pattern);
  const allowed = new Set(current.allowedDays.length ? current.allowedDays : DAYS.map(day => day.id));
  const preferred = new Set(current.preferredDays);
  showModal({
    title:`Patrón temporal · ${subject} · ${course}`,
    submitLabel:'Guardar patrón',
    bodyHtml:`<div class="form-grid temporal-pattern-form">
      <div class="form-field"><label for="subjectSessionMinutes">Duración preferida</label><select id="subjectSessionMinutes" name="sessionMinutes"><option value="0" ${!current.sessionMinutes?'selected':''}>Usar global (${generation.lessonMinutes} min)</option>${durationOptions(current.sessionMinutes)}</select><span class="field-hint">Objetivo de reparto; no obliga a que todas las sesiones sean idénticas.</span></div>
      <div class="form-field"><label for="subjectMaxPerDay">Máximo de sesiones al día</label><select id="subjectMaxPerDay" name="maxSessionsPerDay"><option value="0" ${!current.maxSessionsPerDay?'selected':''}>Usar global (${generation.maxSameSubjectPerDay})</option>${[1,2,3,4].map(value => `<option value="${value}" ${current.maxSessionsPerDay===value?'selected':''}>${value}</option>`).join('')}</select><span class="field-hint">Usa 1 para evitar que la misma materia se repita dos veces en un día.</span></div>
      <div class="form-field"><label for="subjectMinSessionMinutes">Duración mínima</label><select id="subjectMinSessionMinutes" name="minSessionMinutes"><option value="0" ${!current.minSessionMinutes?'selected':''}>Sin mínimo específico</option>${durationOptions(current.minSessionMinutes)}</select><span class="field-hint">Restricción dura. Por ejemplo, 45 min impide restos de 15 o 30 min.</span></div>
      <div class="form-field"><label for="subjectMaxSessionMinutes">Duración máxima</label><select id="subjectMaxSessionMinutes" name="maxSessionMinutes"><option value="0" ${!current.maxSessionMinutes?'selected':''}>Sin máximo específico</option>${durationOptions(current.maxSessionMinutes)}</select><span class="field-hint">Restricción dura. El generador redistribuye el total semanal dentro del rango.</span></div>
      <fieldset class="full"><legend>Días permitidos</legend><div class="temporal-day-grid">${DAYS.map(day => `<label><input type="checkbox" name="allowedDay" value="${day.id}" ${allowed.has(day.id)?'checked':''}><span>${escapeHtml(day.label)}</span></label>`).join('')}</div><p class="field-hint">Debe quedar al menos un día permitido.</p></fieldset>
      <fieldset class="full"><legend>Días preferidos</legend><div class="temporal-day-grid">${DAYS.map(day => `<label><input type="checkbox" name="preferredDay" value="${day.id}" ${preferred.has(day.id)?'checked':''}><span>${escapeHtml(day.label)}</span></label>`).join('')}</div></fieldset>
      <div class="form-field"><label for="earliestStart">No empezar antes de</label><input id="earliestStart" name="earliestStart" type="time" value="${escapeHtml(current.earliestStart)}"><span class="field-hint">Restricción dura.</span></div>
      <div class="form-field"><label for="latestEnd">Terminar como máximo a</label><input id="latestEnd" name="latestEnd" type="time" value="${escapeHtml(current.latestEnd)}"><span class="field-hint">Restricción dura.</span></div>
      <div class="form-field"><label for="preferredStart">Preferir desde</label><input id="preferredStart" name="preferredStart" type="time" value="${escapeHtml(current.preferredStart)}"></div>
      <div class="form-field"><label for="preferredEnd">Preferir hasta</label><input id="preferredEnd" name="preferredEnd" type="time" value="${escapeHtml(current.preferredEnd)}"></div>
    </div>`,
    onSubmit:async (data, _form, message) => {
      const allowedDays = data.getAll('allowedDay');
      if (!allowedDays.length) {
        setModalMessage(message, 'Selecciona al menos un día permitido.');
        return false;
      }
      try {
        const next = validateTimePattern({
          sessionMinutes:Number(data.get('sessionMinutes') || 0),
          minSessionMinutes:Number(data.get('minSessionMinutes') || 0),
          maxSessionMinutes:Number(data.get('maxSessionMinutes') || 0),
          maxSessionsPerDay:Number(data.get('maxSessionsPerDay') || 0),
          allowedDays,
          preferredDays:data.getAll('preferredDay'),
          earliestStart:String(data.get('earliestStart') || ''),
          latestEnd:String(data.get('latestEnd') || ''),
          preferredStart:String(data.get('preferredStart') || ''),
          preferredEnd:String(data.get('preferredEnd') || '')
        }, `${course} · ${subject}`);
        await onSave(next);
        return true;
      } catch (error) {
        setModalMessage(message, error.message || 'Revisa el patrón temporal.');
        return false;
      }
    }
  });
}

function durationOptions(selected) {
  return SESSION_OPTIONS.map(value => `<option value="${value}" ${selected===value?'selected':''}>${value} min</option>`).join('');
}

function renderCourse(course, configured) {
  const rows = configured.filter(item => item.course === course.value);
  if (!rows.length) return '';
  return `<details class="temporal-course-card" ${course.value==='1º'?'open':''}><summary><strong>${escapeHtml(course.label)}</strong><span>${rows.length} materia(s)</span></summary><div class="temporal-subject-list">${rows.map(item => `<article class="temporal-subject-row"><div><strong>${escapeHtml(item.subject)}</strong><small>${formatDuration(item.minutes)} · ${escapeHtml(describeTimePattern(item.pattern))}</small></div><button class="button" type="button" data-edit-subject-pattern data-course="${escapeHtml(item.course)}" data-subject="${escapeHtml(item.subject)}">Configurar</button></article>`).join('')}</div></details>`;
}

function metric(label, value) {
  return `<div class="capacity-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}
