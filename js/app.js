import { renderStudents, openStudentForm } from './alumnos.js';
import { renderProfessionals, openProfessionalForm } from './profesionales.js';
import { renderGroups, openGroupForm } from './grupos.js';
import { renderSessions, openSessionForm } from './sesiones.js';
import { renderCalendar } from './calendar.js';
import { renderAlerts } from './alerts.js';
import { calculateStudentHours, deriveStudentStatus, totalsFromHours } from './hours.js';
import { conflictStudentIds, detectConflicts } from './conflicts.js';
import { ensureSeedData, loadDemoData } from './seed.js';
import { deleteGroup, deleteProfessional, deleteSession, deleteStudent, loadState, saveGroup, saveProfessional, saveSession, saveStudent } from './repository.js';
import { put } from './db.js';
import { downloadSharePackage, importShareFile } from './sharing.js';
import { formatDuration } from './utils.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const primaryActionBtn = document.querySelector('#primaryActionBtn');
const summaryStrip = document.querySelector('#summaryStrip');
const appShell = document.querySelector('#appShell');
const sidebarToggleBtn = document.querySelector('#sidebarToggleBtn');
const importDataInput = document.querySelector('#importDataInput');

let currentView = 'calendar';
let serviceFilter = localStorage.getItem('horario-service-filter') || 'ALL';
let state = { students:[], professionals:[], groups:[], sessions:[] };
let derived = {};

const VIEW_TITLES = {
  calendar:'Horario semanal', students:'Alumnos', professionals:'Profesionales', groups:'Grupos', sessions:'Sesiones', alerts:'Conflictos'
};

async function init() {
  try {
    applyInitialSidebarState();
    await ensureSeedData();
    bindGlobalEvents();
    await refresh();
  } catch (error) {
    console.error(error);
    viewRoot.innerHTML = `<section class="card"><div class="empty-state"><strong>No se pudo iniciar la aplicación</strong>Comprueba que el navegador permite IndexedDB y vuelve a cargar la página.</div></section>`;
  }
}

async function refresh({ toast } = {}) {
  state = await loadState();
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
  summaryStrip.innerHTML = `
    <div class="metric ${derived.totals.ptPending > 0 ? 'is-warning':''}"><span>PT pendiente</span><strong>${formatSignedPending(derived.totals.ptPending)}</strong></div>
    <div class="metric ${derived.totals.alPending > 0 ? 'is-warning':''}"><span>AL pendiente</span><strong>${formatSignedPending(derived.totals.alPending)}</strong></div>
    <div class="metric ${derived.conflicts.length ? 'is-danger':''}"><span>Conflictos / avisos</span><strong>${derived.conflicts.length}</strong></div>
    <div class="metric ${incomplete ? 'is-warning':''}"><span>Alumnos no completos</span><strong>${incomplete}</strong></div>`;
}

function renderCurrentView() {
  pageTitle.textContent = VIEW_TITLES[currentView];
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === currentView));
  document.querySelectorAll('[data-service-filter]').forEach(button => button.classList.toggle('is-active', button.dataset.serviceFilter === serviceFilter));
  primaryActionBtn.textContent = ({ students:'+ Nuevo alumno', professionals:'+ Nuevo profesional', groups:'+ Nuevo grupo' }[currentView] || '+ Nueva sesión');

  const common = { state, serviceFilter, ...derived };
  if (currentView === 'calendar') renderCalendar(viewRoot, { ...common, onEditSession: editSession, onMoveSession: moveSession });
  if (currentView === 'students') renderStudents(viewRoot, { ...common, conflictStudentIds: derived.conflictStudents, onEdit: editStudent, onDelete: removeStudent });
  if (currentView === 'professionals') renderProfessionals(viewRoot, { ...common, onEdit: editProfessional, onDelete: removeProfessional });
  if (currentView === 'groups') renderGroups(viewRoot, { ...common, onEdit: editGroup, onDelete: removeGroup });
  if (currentView === 'sessions') renderSessions(viewRoot, { ...common, onEdit: editSession, onDelete: removeSession });
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
    return editSession();
  });

  document.querySelector('#exportDataBtn').addEventListener('click', () => {
    downloadSharePackage(state);
    showToast('Horario exportado. Puedes enviar el archivo JSON a otra persona.');
  });

  document.querySelector('#importDataBtn').addEventListener('click', () => importDataInput.click());
  importDataInput.addEventListener('change', async () => {
    const [file] = importDataInput.files || [];
    importDataInput.value = '';
    if (!file) return;
    if (!confirm('Importar este horario sustituirá los alumnos, profesionales, grupos y sesiones actuales de este navegador. ¿Continuar?')) return;
    try {
      const counts = await importShareFile(file);
      currentView = 'calendar';
      await refresh({ toast:`Horario importado: ${counts.students} alumnos, ${counts.groups} grupos y ${counts.sessions} sesiones.` });
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo importar el horario.', 'error');
    }
  });

  document.querySelector('#resetDemoBtn').addEventListener('click', async () => {
    if (!confirm('Se sustituirán los datos actuales por los datos de ejemplo. ¿Continuar?')) return;
    await loadDemoData();
    await refresh({ toast:'Datos de ejemplo restaurados.' });
  });
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
  openSessionForm(session, { state, onSave: async value => { await saveSession(value); await refresh({ toast: session ? 'Sesión actualizada.' : 'Sesión creada.' }); } });
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
  await deleteSession(id);await refresh({toast:'Sesión eliminada.'});
}

function formatSignedPending(value) {
  if (value < 0) return `Exceso ${formatDuration(Math.abs(value))}`;
  return formatDuration(value);
}

init();
