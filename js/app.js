import { renderStudents, openStudentForm } from './alumnos.js';
import { renderProfessionals, openProfessionalForm } from './profesionales.js';
import { renderGroups, openGroupForm } from './grupos.js';
import { renderSessions, openSessionForm } from './sesiones.js';
import { renderClassSchedules, openClassScheduleForm } from './class-schedules.js';
import { openRecessSettingsForm } from './recess-settings.js';
import { renderCalendar } from './calendar.js';
import { renderAlerts } from './alerts.js';
import { calculateStudentHours, deriveStudentStatus, totalsFromHours } from './hours.js';
import { conflictStudentIds, detectConflicts } from './conflicts.js';
import { ensureSeedData, loadDemoData } from './seed.js';
import { deleteClassSchedule, deleteGroup, deleteProfessional, deleteSession, deleteStudent, loadState, saveClassSchedule, saveGroup, saveProfessional, saveSchoolSettings, saveSession, saveStudent } from './repository.js';
import { put, resetDatabase } from './db.js';
import { downloadSharePackage, importShareFile } from './sharing.js';
import { printCalendar } from './print.js';
import { escapeHtml, formatDuration } from './utils.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const primaryActionBtn = document.querySelector('#primaryActionBtn');
const summaryStrip = document.querySelector('#summaryStrip');
const appShell = document.querySelector('#appShell');
const sidebarToggleBtn = document.querySelector('#sidebarToggleBtn');
const importDataInput = document.querySelector('#importDataInput');
const calendarPrintActions = document.querySelector('#calendarPrintActions');

let currentView = 'calendar';
let serviceFilter = localStorage.getItem('horario-service-filter') || 'ALL';
let state = { students:[], professionals:[], groups:[], sessions:[], classSchedules:[], schoolSettings:null };
let derived = {};
let selectedSessionId = null;

const VIEW_TITLES = {
  calendar:'Horario semanal',
  students:'Alumnos',
  professionals:'Profesionales',
  groups:'Grupos',
  sessions:'Sesiones',
  classSchedules:'Horarios de aula',
  alerts:'Conflictos'
};

async function init() {
  try {
    applyInitialSidebarState();
    if (localStorage.getItem('horario-user-cleared') !== 'true') await ensureSeedData();
    bindGlobalEvents();
    await refresh();
  } catch (error) {
    console.error(error);
    viewRoot.innerHTML = `<section class="card"><div class="empty-state"><strong>No se pudo iniciar la aplicación</strong>Comprueba que el navegador permite IndexedDB y vuelve a cargar la página.</div></section>`;
  }
}

async function refresh({ toast } = {}) {
  state = await loadState();
  if (selectedSessionId && !state.sessions.some(session => session.id === selectedSessionId)) selectedSessionId = null;
  const hoursMap = calculateStudentHours(state.students, state.groups, state.sessions);
  const conflicts = detectConflicts(state);
  const conflictStudents = conflictStudentIds(conflicts);
  const totals = totalsFromHours(hoursMap);
  derived = { hoursMap, conflicts, conflictStudents, totals };
  renderSummary();
  renderCurrentView();
  if (toast) showToast(toast);
}

function renderSummary() {
  const incomplete = [...derived.hoursMap.values()].filter(hours => deriveStudentStatus(hours, derived.conflictStudents.has(hours.studentId)) !== 'Completo').length;
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const pendingStudents = [...derived.hoursMap.values()]
    .filter(hours => hours.ptPending > 0 || hours.alPending > 0)
    .map(hours => ({ hours, student: studentMap.get(hours.studentId) }))
    .filter(item => item.student)
    .sort((a, b) => {
      const pendingA = Math.max(0, a.hours.ptPending) + Math.max(0, a.hours.alPending);
      const pendingB = Math.max(0, b.hours.ptPending) + Math.max(0, b.hours.alPending);
      return pendingB - pendingA || `${a.student.apellidos || ''} ${a.student.nombre || ''}`.localeCompare(`${b.student.apellidos || ''} ${b.student.nombre || ''}`, 'es');
    });

  const pendingMarkup = pendingStudents.length
    ? `<div class="pending-student-list" aria-label="Alumnos con horas pendientes">
        ${pendingStudents.map(({ student, hours }) => `
          <div class="pending-student-chip">
            <span class="pending-student-name">${escapeHtml(`${student.nombre || ''} ${student.apellidos || ''}`.trim())}</span>
            <span class="pending-values">
              ${hours.ptPending > 0 ? `<span class="pending-service pt"><b>PT</b> ${formatDuration(hours.ptPending)}</span>` : ''}
              ${hours.alPending > 0 ? `<span class="pending-service al"><b>AL</b> ${formatDuration(hours.alPending)}</span>` : ''}
            </span>
          </div>`).join('')}
      </div>`
    : `<div class="pending-all-complete">✓ No hay alumnos con horas PT/AL pendientes.</div>`;

  summaryStrip.innerHTML = `
    <div class="metric ${derived.totals.ptPending > 0 ? 'is-warning':''}"><span>PT pendiente</span><strong>${formatSignedPending(derived.totals.ptPending)}</strong></div>
    <div class="metric ${derived.totals.alPending > 0 ? 'is-warning':''}"><span>AL pendiente</span><strong>${formatSignedPending(derived.totals.alPending)}</strong></div>
    <div class="metric ${derived.conflicts.length ? 'is-danger':''}"><span>Conflictos / avisos</span><strong>${derived.conflicts.length}</strong></div>
    <div class="metric ${incomplete ? 'is-warning':''}"><span>Alumnos no completos</span><strong>${incomplete}</strong></div>
    <div class="pending-overview">
      <div class="pending-overview-heading">
        <div>
          <strong>Horas pendientes por alumno</strong>
          <small>Ordenado por mayor necesidad pendiente. Se actualiza al mover o editar sesiones.</small>
        </div>
        <span class="badge ${pendingStudents.length ? 'badge-warning' : 'badge-success'}">${pendingStudents.length} pendiente${pendingStudents.length === 1 ? '' : 's'}</span>
      </div>
      ${pendingMarkup}
    </div>`;
}

function renderCurrentView() {
  pageTitle.textContent = VIEW_TITLES[currentView];
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === currentView));
  document.querySelectorAll('[data-service-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.serviceFilter === serviceFilter));
  calendarPrintActions?.classList.toggle('hidden', currentView !== 'calendar');

  const actionLabels = {
    students:'+ Nuevo alumno',
    professionals:'+ Nuevo profesional',
    groups:'+ Nuevo grupo',
    classSchedules:'+ Nueva franja'
  };
  primaryActionBtn.textContent = actionLabels[currentView] || '+ Nueva sesión';

  const common = { state, serviceFilter, ...derived };
  if (currentView === 'calendar') renderCalendar(viewRoot, {
    ...common,
    selectedSessionId,
    onSelectSession: selectSession,
    onEditSession: editSession,
    onMoveSession: moveSession,
    onOpenClassSchedules: openClassSchedulesView
  });
  if (currentView === 'students') renderStudents(viewRoot, { ...common, conflictStudentIds: derived.conflictStudents, onEdit: editStudent, onDelete: removeStudent });
  if (currentView === 'professionals') renderProfessionals(viewRoot, { ...common, onEdit: editProfessional, onDelete: removeProfessional });
  if (currentView === 'groups') renderGroups(viewRoot, { ...common, onEdit: editGroup, onDelete: removeGroup });
  if (currentView === 'sessions') renderSessions(viewRoot, { ...common, onEdit: editSession, onDelete: removeSession });
  if (currentView === 'classSchedules') renderClassSchedules(viewRoot, { ...common, onEdit: editClassSchedule, onDelete: removeClassSchedule });
  if (currentView === 'alerts') renderAlerts(viewRoot, common);
}

function bindGlobalEvents() {
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
    currentView = button.dataset.view;
    renderCurrentView();
    if (window.matchMedia('(max-width: 820px)').matches) setSidebarCollapsed(true);
  }));

  document.querySelectorAll('[data-service-filter]').forEach(button => button.addEventListener('click', () => {
    serviceFilter = button.dataset.serviceFilter;
    localStorage.setItem('horario-service-filter', serviceFilter);
    renderCurrentView();
  }));

  sidebarToggleBtn.addEventListener('click', () => setSidebarCollapsed(!appShell.classList.contains('is-sidebar-collapsed')));

  primaryActionBtn.addEventListener('click', () => {
    if (currentView === 'students') return editStudent();
    if (currentView === 'professionals') return editProfessional();
    if (currentView === 'groups') return editGroup();
    if (currentView === 'classSchedules') return editClassSchedule();
    return editSession();
  });

  document.querySelector('#printPTBtn').addEventListener('click', () => printServiceCalendar('PT'));
  document.querySelector('#printALBtn').addEventListener('click', () => printServiceCalendar('AL'));
  document.querySelector('#recessSettingsBtn').addEventListener('click', editRecessSettings);

  document.querySelector('#exportDataBtn').addEventListener('click', () => {
    downloadSharePackage(state);
    showToast('Horario exportado. Incluye horarios de aula y recreos del centro.');
  });

  document.querySelector('#importDataBtn').addEventListener('click', () => importDataInput.click());
  importDataInput.addEventListener('change', async () => {
    const [file] = importDataInput.files || [];
    importDataInput.value = '';
    if (!file) return;
    if (!confirm('Importar este horario sustituirá los alumnos, profesionales, grupos, sesiones, horarios de aula y recreos actuales de este navegador. ¿Continuar?')) return;
    try {
      const counts = await importShareFile(file);
      localStorage.setItem('horario-user-cleared', 'true');
      selectedSessionId = null;
      currentView = 'calendar';
      await refresh({ toast:`Horario importado: ${counts.students} alumnos, ${counts.groups} grupos, ${counts.sessions} sesiones y ${counts.classSchedules} franjas de aula.` });
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo importar el horario.', 'error');
    }
  });

  document.querySelector('#resetDemoBtn').addEventListener('click', async () => {
    if (!confirm('Se sustituirán los datos actuales por los datos de ejemplo. También se borrarán los recreos configurados. ¿Continuar?')) return;
    localStorage.removeItem('horario-user-cleared');
    selectedSessionId = null;
    await loadDemoData();
    await refresh({ toast:'Datos de ejemplo restaurados.' });
  });

  document.querySelector('#clearAllDataBtn').addEventListener('click', async () => {
    const accepted = confirm('Se eliminarán TODOS los alumnos, profesionales, grupos, sesiones, horarios de aula y recreos de este navegador. Esta acción no se puede deshacer. Si quieres conservar una copia, cancela y usa “Exportar / compartir”. ¿Vaciar ahora?');
    if (!accepted) return;
    await resetDatabase();
    localStorage.setItem('horario-user-cleared', 'true');
    selectedSessionId = null;
    currentView = 'calendar';
    await refresh({ toast:'Todos los datos han sido eliminados. La aplicación está lista para empezar desde cero.' });
  });
}

function printServiceCalendar(serviceType) {
  try {
    printCalendar(state, serviceType);
  } catch (error) {
    showToast(error.message || 'No se pudo abrir la impresión.', 'error');
  }
}

function editRecessSettings() {
  openRecessSettingsForm(state.schoolSettings, { onSave: async value => {
    await saveSchoolSettings(value);
    await refresh({ toast:'Recreos de Infantil y Primaria actualizados.' });
  } });
}

function applyInitialSidebarState() {
  const stored = localStorage.getItem('horario-sidebar-collapsed');
  const collapsed = stored === null ? window.matchMedia('(max-width: 820px)').matches : stored === 'true';
  setSidebarCollapsed(collapsed, false);
}

function setSidebarCollapsed(collapsed, persist = true) {
  appShell.classList.toggle('is-sidebar-collapsed', collapsed);
  sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
  sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Mostrar menú lateral' : 'Ocultar menú lateral');
  if (persist) localStorage.setItem('horario-sidebar-collapsed', String(collapsed));
}

function selectSession(id) {
  selectedSessionId = id;
  renderCurrentView();
}

function openClassSchedulesView() {
  currentView = 'classSchedules';
  renderCurrentView();
}

function editStudent(id) {
  const student = id ? state.students.find(item => item.id === id) : null;
  openStudentForm(student, { onSave: async value => { await saveStudent(value); await refresh({ toast: student ? 'Alumno actualizado.' : 'Alumno creado.' }); } });
}

function editProfessional(id) {
  const professional = id ? state.professionals.find(item => item.id === id) : null;
  openProfessionalForm(professional, { onSave: async value => { await saveProfessional(value); await refresh({ toast: professional ? 'Profesional actualizado.' : 'Profesional creado.' }); } });
}

function editGroup(id) {
  const group = id ? state.groups.find(item => item.id === id) : null;
  openGroupForm(group, { state, onSave: async value => {
    await saveGroup(value);
    const linked = state.sessions.filter(session => session.groupId === value.id);
    await Promise.all(linked.map(session => put('sessions', { ...session, professionalId:value.professionalId })));
    await refresh({ toast: group ? 'Grupo actualizado.' : 'Grupo creado.' });
  } });
}

function editSession(id) {
  const session = id ? state.sessions.find(item => item.id === id) : null;
  openSessionForm(session, { state, onSave: async value => {
    await saveSession(value);
    selectedSessionId = value.id;
    await refresh({ toast: session ? 'Sesión actualizada.' : 'Sesión creada.' });
  } });
}

function editClassSchedule(id) {
  const entry = id ? state.classSchedules.find(item => item.id === id) : null;
  openClassScheduleForm(entry, { state, onSave: async value => {
    await saveClassSchedule(value);
    await refresh({ toast: entry ? 'Franja de aula actualizada.' : 'Franja de aula creada.' });
  } });
}

async function moveSession(id, patch) {
  const session = state.sessions.find(item => item.id === id);
  if (!session) return;
  const candidate = { ...session, ...patch };
  const beforeForSession = derived.conflicts.filter(conflict => conflict.sessionIds.includes(id));
  const beforeIds = new Set(beforeForSession.map(conflict => conflict.id));
  const candidateState = {
    ...state,
    sessions: state.sessions.map(item => item.id === id ? candidate : item)
  };
  const afterForSession = detectConflicts(candidateState).filter(conflict => conflict.sessionIds.includes(id));
  const newConflicts = afterForSession.filter(conflict => !beforeIds.has(conflict.id));
  const severe = newConflicts.filter(conflict => conflict.severity === 'grave');

  if (severe.length) {
    const details = severe.slice(0, 3).map(conflict => `• ${conflict.message}`).join('\n');
    const more = severe.length > 3 ? `\n• Y ${severe.length - 3} conflicto(s) más.` : '';
    if (!confirm(`Este movimiento genera ${severe.length} conflicto(s) grave(s):\n\n${details}${more}\n\n¿Quieres guardar el cambio de todas formas?`)) {
      renderCurrentView();
      showToast('Movimiento cancelado.');
      return;
    }
  }

  await saveSession(candidate);
  selectedSessionId = id;
  const warnings = newConflicts.filter(conflict => conflict.severity !== 'grave').length;
  const conflictCount = newConflicts.length;
  const toast = conflictCount
    ? `Sesión movida. Se han detectado ${conflictCount} nuevo(s) conflicto(s) o aviso(s)${warnings ? ` (${warnings} aviso(s))` : ''}.`
    : `Sesión movida a ${candidate.dia}, ${candidate.inicio}–${candidate.fin}.`;
  await refresh({ toast });
}

async function removeStudent(id) {
  const student = state.students.find(item => item.id === id); if(!student)return;
  if(!confirm(`¿Eliminar a ${student.nombre} ${student.apellidos}? También se retirará de los grupos en los que participa.`))return;
  await deleteStudent(id,state); await refresh({toast:'Alumno eliminado.'});
}

async function removeProfessional(id) {
  const professional = state.professionals.find(item => item.id === id);if(!professional)return;
  if(!confirm(`¿Eliminar al profesional ${professional.nombre}?`))return;
  try{await deleteProfessional(id,state);await refresh({toast:'Profesional eliminado.'});}catch(error){showToast(error.message,'error');}
}

async function removeGroup(id) {
  const group = state.groups.find(item => item.id === id);if(!group)return;
  const count = state.sessions.filter(session => session.groupId === id).length;
  if(!confirm(`¿Eliminar el grupo ${group.nombre}? Se eliminarán también ${count} sesión(es) asociadas.`))return;
  await deleteGroup(id,state);await refresh({toast:'Grupo y sesiones asociadas eliminados.'});
}

async function removeSession(id) {
  const session = state.sessions.find(item => item.id === id);if(!session)return;
  if(!confirm(`¿Eliminar la sesión del ${session.dia} ${session.inicio}–${session.fin}?`))return;
  await deleteSession(id);
  if (selectedSessionId === id) selectedSessionId = null;
  await refresh({toast:'Sesión eliminada.'});
}

async function removeClassSchedule(id) {
  const entry = state.classSchedules.find(item => item.id === id);
  if (!entry) return;
  if (!confirm(`¿Eliminar ${entry.materia} de ${entry.grupoClase} (${entry.inicio}–${entry.fin})?`)) return;
  await deleteClassSchedule(id);
  await refresh({ toast:'Franja de aula eliminada.' });
}

function formatSignedPending(value) {
  if (value < 0) return `Exceso ${formatDuration(Math.abs(value))}`;
  return formatDuration(value);
}

init();