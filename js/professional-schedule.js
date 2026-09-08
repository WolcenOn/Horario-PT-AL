import { DAYS } from './constants.js';
import { normalizeCenterPlanningSettings, normalizeProfessionalProfile } from './center-planning.js';
import { externalBlocksForDay } from './professional-availability.js';
import { escapeHtml, formatDuration, timeToMinutes } from './utils.js';

const DAY_ORDER = new Map(DAYS.map((day, index) => [day.id, index]));

export function buildProfessionalSchedule(state, professionalId) {
  const raw = (state.professionals || []).find(item => item.id === professionalId);
  if (!raw) return null;
  const professional = normalizeProfessionalProfile(raw);
  const groupMap = new Map((state.groups || []).map(group => [group.id, group]));
  const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const entries = [];

  for (const item of state.classSchedules || []) {
    if (item.professionalId !== professionalId) continue;
    entries.push(scheduleEntry({
      kind:'class',
      dia:item.dia,
      inicio:item.inicio,
      fin:item.fin,
      title:item.materia || 'Docencia ordinaria',
      detail:item.grupoClase || '',
      location:item.aula || ''
    }));
  }

  for (const session of state.sessions || []) {
    const group = groupMap.get(session.groupId);
    const assignedId = session.professionalId || group?.professionalId;
    if (assignedId !== professionalId) continue;
    entries.push(scheduleEntry({
      kind:group?.tipo === 'PT' ? 'pt' : group?.tipo === 'AL' ? 'al' : 'support',
      dia:session.dia,
      inicio:session.inicio,
      fin:session.fin,
      title:group?.nombre || `${group?.tipo || 'Apoyo'} PT/AL`,
      detail:group?.tipo || 'Apoyo',
      location:session.aula || ''
    }));
  }

  for (const activity of settings.weeklyActivities || []) {
    if (activity.active === false) continue;
    const assigned = new Set(activity.assignedTeacherIds || []);
    for (const slot of activity.scheduledSlots || []) {
      const slotTeachers = new Set(slot.teacherIds || []);
      if (!assigned.has(professionalId) && !slotTeachers.has(professionalId)) continue;
      entries.push(scheduleEntry({
        kind:'activity',
        dia:slot.dia,
        inicio:slot.inicio,
        fin:slot.fin,
        title:activity.name || 'Actividad del centro',
        detail:activity.category || 'Actividad',
        location:''
      }));
    }
  }

  for (const day of DAYS) {
    for (const block of externalBlocksForDay(professional, day.id)) {
      entries.push(scheduleEntry({
        kind:'external',
        dia:day.id,
        inicio:block.inicio,
        fin:block.fin,
        title:block.centro || 'Otro centro',
        detail:'No disponible en este centro',
        location:''
      }));
    }
  }

  entries.sort((a, b) => (DAY_ORDER.get(a.dia) ?? 99) - (DAY_ORDER.get(b.dia) ?? 99)
    || timeToMinutes(a.inicio) - timeToMinutes(b.inicio));

  const scheduled = entries.filter(item => item.kind !== 'external');
  const ordinaryMinutes = sumKind(entries, 'class');
  const supportMinutes = entries.filter(item => ['pt','al','support'].includes(item.kind)).reduce((sum, item) => sum + item.minutes, 0);
  const activityMinutes = sumKind(entries, 'activity');
  const responsibilityMinutes = (professional.responsibilities || []).reduce((sum, item) => sum + Math.max(0, Number(item.weeklyMinutes) || 0), 0);
  const scheduledMinutes = scheduled.reduce((sum, item) => sum + item.minutes, 0);
  const modeledMinutes = scheduledMinutes + responsibilityMinutes;
  const capacity = Math.max(0, Number(professional.maxWeeklyMinutes) || 0);

  return {
    professional,
    entries,
    byDay:Object.fromEntries(DAYS.map(day => [day.id, entries.filter(item => item.dia === day.id)])),
    metrics:{
      ordinaryMinutes,
      supportMinutes,
      activityMinutes,
      responsibilityMinutes,
      scheduledMinutes,
      modeledMinutes,
      capacity,
      remaining:capacity ? capacity - modeledMinutes : null
    }
  };
}

export function renderProfessionalSchedule(root, { state, professionalId, onBack, onEdit }) {
  const model = buildProfessionalSchedule(state, professionalId);
  if (!model) {
    root.innerHTML = '<section class="card"><div class="empty-state"><strong>Profesional no encontrado</strong>Vuelve al listado de profesorado.</div></section>';
    return;
  }
  const { professional, metrics } = model;
  const typeClass = professional.tipo === 'PT' ? 'badge-pt' : professional.tipo === 'AL' ? 'badge-al' : 'badge-neutral';
  const remainingClass = metrics.remaining != null && metrics.remaining < 0 ? 'is-danger' : 'is-ok';
  root.innerHTML = `<div class="professional-schedule-view">
    <section class="card professional-schedule-hero">
      <div>
        <p class="eyebrow">Ficha individual de horario</p>
        <h2>${escapeHtml(professional.nombre || 'Profesional')}</h2>
        <div class="professional-schedule-meta"><span class="badge ${typeClass}">${escapeHtml(professional.tipo)}</span><span>${escapeHtml(professional.especialidad || 'Sin especialidad indicada')}</span><span>Tutoría: <strong>${escapeHtml(professional.tutoriaGrupo || '—')}</strong></span></div>
      </div>
      <div class="button-row"><button class="button" type="button" data-professional-back>← Profesorado</button><button class="button button-primary" type="button" data-professional-edit>Editar perfil</button></div>
    </section>

    <section class="professional-schedule-metrics">
      ${metric('Docencia ordinaria', metrics.ordinaryMinutes)}
      ${metric('PT / AL / apoyo', metrics.supportMinutes)}
      ${metric('Actividades', metrics.activityMinutes)}
      ${metric('Funciones sin franja', metrics.responsibilityMinutes)}
      ${metric('Carga modelada', metrics.modeledMinutes)}
      ${metrics.capacity ? metric('Margen sobre capacidad', metrics.remaining, remainingClass, true) : metric('Capacidad semanal', 0, 'is-warning', false, 'Sin límite configurado')}
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Semana individual</h2><small>Reúne docencia ordinaria, PT/AL, actividades ya colocadas y presencia en otros centros.</small></div><span class="badge badge-neutral">${model.entries.length} bloques</span></div>
      <div class="professional-week-grid">
        ${DAYS.map(day => renderDay(day, model.byDay[day.id])).join('')}
      </div>
    </section>

    <section class="professional-detail-grid">
      <article class="card"><div class="card-header"><div><h2>Asignación y tutoría</h2></div></div><div class="card-body detail-list">
        <div><strong>Tutoría</strong><span>${escapeHtml(professional.tutoriaGrupo || 'Sin tutoría fijada')}</span></div>
        <div><strong>Materias de especialidad</strong><span>${listText(professional.specialtySubjects)}</span></div>
        <div><strong>Puede impartir</strong><span>${listText(professional.allowedSubjects)}</span></div>
        <div><strong>Docencia fijada</strong><span>${professional.teachingAssignments?.length ? professional.teachingAssignments.map(item => `${escapeHtml(item.grupoClase)} · ${escapeHtml(item.materia)}`).join('<br>') : '—'}</span></div>
      </div></article>
      <article class="card"><div class="card-header"><div><h2>Funciones y restricciones</h2></div></div><div class="card-body detail-list">
        <div><strong>Funciones</strong><span>${professional.responsibilities?.length ? professional.responsibilities.map(item => `${escapeHtml(item.nombre)}${item.weeklyMinutes ? ` · ${formatDuration(item.weeklyMinutes)}` : ''}`).join('<br>') : '—'}</span></div>
        <div><strong>Capacidad</strong><span>${professional.maxWeeklyMinutes ? formatDuration(professional.maxWeeklyMinutes) : 'Sin límite explícito'}</span></div>
        <div><strong>Observaciones</strong><span>${escapeHtml(professional.observaciones || '—')}</span></div>
      </div></article>
    </section>
  </div>`;
  root.querySelector('[data-professional-back]')?.addEventListener('click', onBack);
  root.querySelector('[data-professional-edit]')?.addEventListener('click', () => onEdit(professional.id));
}

function scheduleEntry(value) {
  const start = timeToMinutes(value.inicio);
  const end = timeToMinutes(value.fin);
  return { ...value, minutes:Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0 };
}

function renderDay(day, entries) {
  return `<article class="professional-day-card"><header><strong>${escapeHtml(day.label)}</strong><span>${entries.length} bloque${entries.length === 1 ? '' : 's'}</span></header><div class="professional-day-body">${entries.length ? entries.map(renderBlock).join('') : '<span class="professional-day-empty">Sin bloques programados</span>'}</div></article>`;
}

function renderBlock(item) {
  const label = item.kind === 'class' ? 'Clase' : item.kind === 'pt' ? 'PT' : item.kind === 'al' ? 'AL' : item.kind === 'activity' ? 'Actividad' : item.kind === 'external' ? 'Otro centro' : 'Apoyo';
  return `<div class="professional-block kind-${item.kind}"><div><strong>${escapeHtml(item.inicio)}–${escapeHtml(item.fin)}</strong><span class="badge badge-neutral">${escapeHtml(label)}</span></div><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail || '')}${item.location ? ` · ${escapeHtml(item.location)}` : ''}</small></div>`;
}

function sumKind(entries, kind) {
  return entries.filter(item => item.kind === kind).reduce((sum, item) => sum + item.minutes, 0);
}

function metric(label, value, className = '', signed = false, fallback = '') {
  const display = fallback || (signed && value != null ? `${value >= 0 ? '+' : '−'}${formatDuration(Math.abs(value))}` : formatDuration(Math.max(0, Number(value) || 0)));
  return `<div class="professional-metric ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(display)}</strong></div>`;
}

function listText(values) {
  return values?.length ? values.map(escapeHtml).join(', ') : '—';
}
