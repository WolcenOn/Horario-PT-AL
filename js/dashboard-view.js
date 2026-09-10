import { configuredClassGroups } from './education.js';
import { normalizeCenterPlanningSettings } from './center-planning.js';
import { escapeHtml, formatDuration } from './utils.js';

export function renderCenterDashboard(root, { state, conflicts = [], hoursMap = new Map(), onNavigate }) {
  const planning = normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const configuredClasses = configuredClassGroups(state.schoolSettings);
  const scheduledClasses = [...new Set((state.classSchedules || [])
    .map(entry => String(entry.grupoClase || '').trim())
    .filter(Boolean))];
  const knownClasses = new Set([...configuredClasses, ...scheduledClasses]);
  const classTotal = knownClasses.size;
  const activeProfessionals = (state.professionals || []).filter(item => item.activo !== false);
  const activeTeachers = activeProfessionals.filter(item => item.tipo === 'DOCENTE');
  const activeSupportProfessionals = activeProfessionals.filter(item => item.tipo === 'PT' || item.tipo === 'AL');
  const pendingStudents = [...hoursMap.values()].filter(hours => hours.ptPending > 0 || hours.alPending > 0);
  const ptSessions = (state.sessions || []).filter(session => supportType(state, session) === 'PT').length;
  const alSessions = (state.sessions || []).filter(session => supportType(state, session) === 'AL').length;
  const curriculumCourses = Object.keys(planning.curriculum || {}).filter(course => Object.keys(planning.curriculum[course] || {}).length).length;
  const next = nextStep({
    classTotal,
    scheduledClasses:scheduledClasses.length,
    planning,
    curriculumCourses,
    conflicts:conflicts.length,
    pendingStudents:pendingStudents.length,
    groups:(state.groups || []).filter(group => group.activo !== false).length
  });
  const academicYear = planning.academicYear || 'Curso sin indicar';
  const profile = planning.profileName || 'Centro educativo';

  root.innerHTML = `<div class="center-dashboard">
    <section class="card dashboard-hero">
      <div>
        <p class="eyebrow">Resumen del centro</p>
        <h2>${escapeHtml(profile)}</h2>
        <p>${escapeHtml(academicYear)} · ${planning.mode === 'global' ? 'Planificación de centro completo' : 'Planificación centrada en apoyos PT/AL'}</p>
      </div>
      <button class="button button-primary" type="button" data-dashboard-target="${escapeHtml(next.target)}">${escapeHtml(next.action)}</button>
    </section>

    <section class="dashboard-metrics" aria-label="Estado general del centro">
      ${metric('Clases con horario', classTotal ? `${scheduledClasses.length}/${classTotal}` : scheduledClasses.length, scheduledClasses.length < classTotal ? 'warning' : 'ok')}
      ${metric('Profesorado activo', activeProfessionals.length, activeProfessionals.length ? 'ok' : 'warning')}
      ${metric('Conflictos / avisos', conflicts.length, conflicts.length ? 'danger' : 'ok')}
      ${metric('Apoyos pendientes', pendingStudents.length, pendingStudents.length ? 'warning' : 'ok')}
    </section>

    <section class="dashboard-grid">
      <article class="card dashboard-next-step">
        <div class="card-header"><div><h2>Siguiente paso recomendado</h2><small>La aplicación prioriza el primer bloqueo que impide avanzar con seguridad.</small></div></div>
        <div class="card-body">
          <span class="dashboard-step-state ${next.kind}">${escapeHtml(next.label)}</span>
          <h3>${escapeHtml(next.title)}</h3>
          <p>${escapeHtml(next.detail)}</p>
          <button class="button button-primary" type="button" data-dashboard-target="${escapeHtml(next.target)}">${escapeHtml(next.action)}</button>
        </div>
      </article>

      <article class="card">
        <div class="card-header"><div><h2>Las tres capas del horario</h2><small>El horario ordinario es la base; PT y AL pueden superponerse solo cuando la extracción está permitida.</small></div></div>
        <div class="card-body dashboard-layers">
          ${layer('Centro', `${scheduledClasses.length} clase(s) con horario`, classTotal ? `${Math.max(0, classTotal - scheduledClasses.length)} por completar` : 'Configura la estructura del centro', 'classSchedules')}
          ${layer('PT', `${ptSessions} sesión(es)`, supportPending(hoursMap, 'PT'), 'calendar')}
          ${layer('AL', `${alSessions} sesión(es)`, supportPending(hoursMap, 'AL'), 'calendar')}
          <button class="button" type="button" data-dashboard-target="combinedCalendar">Abrir vista combinada</button>
        </div>
      </article>

      <article class="card">
        <div class="card-header"><div><h2>Preparación académica</h2><small>Una sola fuente para estructura, currículo, plantilla y restricciones.</small></div></div>
        <div class="card-body dashboard-checks">
          ${check('Estructura de clases', classTotal > 0, classTotal ? `${classTotal} clase(s) conocidas` : 'Pendiente')}
          ${check('Currículo del centro', curriculumCourses > 0, curriculumCourses ? `${curriculumCourses} curso(s) configurados` : 'Pendiente')}
          ${check('Profesorado ordinario', activeTeachers.length > 0, activeTeachers.length ? `${activeTeachers.length} docente(s)` : 'Pendiente')}
          ${check('Profesionales PT/AL', activeSupportProfessionals.length > 0, activeSupportProfessionals.length ? `${activeSupportProfessionals.length} profesional(es)` : 'Sin configurar')}
        </div>
      </article>

      <article class="card">
        <div class="card-header"><div><h2>Accesos rápidos</h2><small>Las tareas de configuración avanzada quedan fuera del flujo principal.</small></div></div>
        <div class="card-body dashboard-actions">
          ${quick('🏛️', 'Planificación académica', 'Currículo, jornada y generación global', 'centerPlanning')}
          ${quick('🧭', 'Horario combinado', 'Centro + capas PT y AL', 'combinedCalendar')}
          ${quick('⚙️', 'Optimización PT/AL', 'Recolocar apoyos respetando extracción', 'automation')}
          ${quick('🔌', 'Cuenta y sincronización', 'Escenarios y funciones online', 'integration')}
        </div>
      </article>
    </section>
  </div>`;

  root.querySelectorAll('[data-dashboard-target]').forEach(button => button.addEventListener('click', () => {
    onNavigate?.(button.dataset.dashboardTarget);
  }));
}

function nextStep({ classTotal, scheduledClasses, planning, curriculumCourses, conflicts, pendingStudents, groups }) {
  if (!classTotal) return {
    kind:'warning', label:'Configuración inicial', title:'Define las clases del centro',
    detail:'Indica las líneas y grupos antes de repartir currículo, profesorado y horarios.',
    action:'Configurar clases', target:'classRosters'
  };
  if (planning.mode !== 'global' || !curriculumCourses) return {
    kind:'warning', label:'Planificación académica', title:'Completa el currículo y la jornada',
    detail:'El horario ordinario necesita una carga curricular y una jornada común antes de poder generarse desde cero.',
    action:'Abrir planificación académica', target:'centerPlanning'
  };
  if (scheduledClasses < classTotal) return {
    kind:'warning', label:'Horario académico', title:'Genera o completa el horario del centro',
    detail:`Hay ${classTotal - scheduledClasses} clase(s) todavía sin horario ordinario completo.`,
    action:'Generar propuesta global', target:'centerPlanning'
  };
  if (conflicts) return {
    kind:'danger', label:'Revisión necesaria', title:'Resuelve las incidencias del horario',
    detail:`Hay ${conflicts} conflicto(s) o aviso(s) que conviene revisar antes de continuar optimizando apoyos.`,
    action:'Revisar conflictos', target:'alerts'
  };
  if (!groups) return {
    kind:'neutral', label:'Apoyos PT/AL', title:'Configura los apoyos que necesita el centro',
    detail:'El horario académico está preparado. Puedes añadir necesidades y grupos PT/AL cuando corresponda.',
    action:'Configurar necesidades de apoyo', target:'students'
  };
  if (pendingStudents) return {
    kind:'warning', label:'Apoyos PT/AL', title:'Completa la distribución de apoyos',
    detail:`Quedan ${pendingStudents} alumno(s) con minutos PT o AL pendientes de colocar.`,
    action:'Optimizar apoyos', target:'automation'
  };
  return {
    kind:'ok', label:'Centro preparado', title:'Revisa el horario combinado',
    detail:'El horario académico y las necesidades de apoyo no muestran tareas pendientes prioritarias.',
    action:'Abrir horario combinado', target:'combinedCalendar'
  };
}

function metric(label, value, kind) {
  return `<article class="card dashboard-metric is-${kind}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function layer(name, value, detail, target) {
  return `<button class="dashboard-layer" type="button" data-dashboard-target="${target}"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></button>`;
}

function check(label, ok, detail) {
  return `<div class="dashboard-check ${ok ? 'is-ok' : 'is-pending'}"><span aria-hidden="true">${ok ? '✓' : '!'}</span><div><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></div></div>`;
}

function quick(icon, title, detail, target) {
  return `<button class="dashboard-quick" type="button" data-dashboard-target="${target}"><span aria-hidden="true">${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div><b aria-hidden="true">→</b></button>`;
}

function supportType(state, session) {
  const group = (state.groups || []).find(item => item.id === session.groupId);
  const professional = (state.professionals || []).find(item => item.id === (session.professionalId || group?.professionalId));
  return group?.tipo || professional?.tipo || '';
}

function supportPending(hoursMap, type) {
  const key = type === 'PT' ? 'ptPending' : 'alPending';
  const minutes = [...hoursMap.values()].reduce((sum, hours) => sum + Math.max(0, Number(hours?.[key]) || 0), 0);
  return minutes > 0 ? `${formatDuration(minutes)} pendientes` : 'Sin minutos pendientes';
}
