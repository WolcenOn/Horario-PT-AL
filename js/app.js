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
import { formatDuration } from './utils.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const primaryActionBtn = document.querySelector('#primaryActionBtn');
const summaryStrip = document.querySelector('#summaryStrip');

let currentView = 'calendar';
let serviceFilter = localStorage.getItem('horario-service-filter') || 'ALL';
let state = { students:[], professionals:[], groups:[], sessions:[] };
let derived = {};

const VIEW_TITLES = {
  calendar:'Horario semanal', students:'Alumnos', professionals:'Profesionales', groups:'Grupos', sessions:'Sesiones', alerts:'Conflictos'
};

async function init() {
  try {
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
  const incomplete = [...derived.hoursMap.values()].filter(h => deriveStudentStatus(h, derived.conflictStudents.has(h.studentId)) !== 'Completo').length;
  summaryStrip.innerHTML = `
    <div class="metric ${derived.totals.ptPending > 0 ? 'is-warning':''}"><span>PT pendiente</span><strong>${formatSignedPending(derived.totals.ptPending)}</strong></div>
    <div class="metric ${derived.totals.alPending > 0 ? 'is-warning':''}"><span>AL pendiente</span><strong>${formatSignedPending(derived.totals.alPending)}</strong></div>
    <div class="metric ${derived.conflicts.length ? 'is-danger':''}"><span>Conflictos / avisos</span><strong>${derived.conflicts.length}</strong></div>
    <div class="metric ${incomplete ? 'is-warning':''}"><span>Alumnos no completos</span><strong>${incomplete}</strong></div>`;
}

function renderCurrentView() {
  pageTitle.textContent = VIEW_TITLES[currentView];
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === currentView));
  document.querySelectorAll('[data-service-filter]').forEach(btn => btn.classList.toggle('is-active', btn.dataset.serviceFilter === serviceFilter));
  primaryActionBtn.textContent = ({ students:'+ Nuevo alumno', professionals:'+ Nuevo profesional', groups:'+ Nuevo grupo' }[currentView] || '+ Nueva sesión');

  const common = { state, serviceFilter, ...derived };
  if (currentView === 'calendar') renderCalendar(viewRoot, { ...common, onEditSession: editSession });
  if (currentView === 'students') renderStudents(viewRoot, { ...common, conflictStudentIds: derived.conflictStudents, onEdit: editStudent, onDelete: removeStudent });
  if (currentView === 'professionals') renderProfessionals(viewRoot, { ...common, onEdit: editProfessional, onDelete: removeProfessional });
  if (currentView === 'groups') renderGroups(viewRoot, { ...common, onEdit: editGroup, onDelete: removeGroup });
  if (currentView === 'sessions') renderSessions(viewRoot, { ...common, onEdit: editSession, onDelete: removeSession });
  if (currentView === 'alerts') renderAlerts(viewRoot, common);
}

function bindGlobalEvents() {
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    renderCurrentView();
  }));
  document.querySelectorAll('[data-service-filter]').forEach(btn => btn.addEventListener('click', () => {
    serviceFilter = btn.dataset.serviceFilter;
    localStorage.setItem('horario-service-filter', serviceFilter);
    renderCurrentView();
  }));
  primaryActionBtn.addEventListener('click', () => {
    if (currentView === 'students') return editStudent();
    if (currentView === 'professionals') return editProfessional();
    if (currentView === 'groups') return editGroup();
    return editSession();
  });
  document.querySelector('#resetDemoBtn').addEventListener('click', async () => {
    if (!confirm('Se sustituirán los datos actuales por los datos de ejemplo. ¿Continuar?')) return;
    await loadDemoData();
    await refresh({ toast:'Datos de ejemplo restaurados.' });
  });
}

function editStudent(id) {
  const student = id ? state.students.find(s => s.id === id) : null;
  openStudentForm(student, { onSave: async value => { await saveStudent(value); await refresh({ toast: student ? 'Alumno actualizado.' : 'Alumno creado.' }); } });
}

function editProfessional(id) {
  const professional = id ? state.professionals.find(p => p.id === id) : null;
  openProfessionalForm(professional, { onSave: async value => { await saveProfessional(value); await refresh({ toast: professional ? 'Profesional actualizado.' : 'Profesional creado.' }); } });
}

function editGroup(id) {
  const group = id ? state.groups.find(g => g.id === id) : null;
  openGroupForm(group, { state, onSave: async value => {
    await saveGroup(value);
    const linked = state.sessions.filter(s => s.groupId === value.id);
    await Promise.all(linked.map(session => put('sessions', { ...session, professionalId:value.professionalId })));
    await refresh({ toast: group ? 'Grupo actualizado.' : 'Grupo creado.' });
  } });
}

function editSession(id) {
  const session = id ? state.sessions.find(s => s.id === id) : null;
  openSessionForm(session, { state, onSave: async value => { await saveSession(value); await refresh({ toast: session ? 'Sesión actualizada.' : 'Sesión creada.' }); } });
}

async function removeStudent(id) {
  const student = state.students.find(s=>s.id===id); if(!student)return;
  if(!confirm(`¿Eliminar a ${student.nombre} ${student.apellidos}? También se retirará de los grupos en los que participa.`))return;
  await deleteStudent(id,state); await refresh({toast:'Alumno eliminado.'});
}
async function removeProfessional(id) {
  const prof=state.professionals.find(p=>p.id===id);if(!prof)return;
  if(!confirm(`¿Eliminar al profesional ${prof.nombre}?`))return;
  try{await deleteProfessional(id,state);await refresh({toast:'Profesional eliminado.'});}catch(error){showToast(error.message,'error');}
}
async function removeGroup(id) {
  const group=state.groups.find(g=>g.id===id);if(!group)return;
  const count=state.sessions.filter(s=>s.groupId===id).length;
  if(!confirm(`¿Eliminar el grupo ${group.nombre}? Se eliminarán también ${count} sesión(es) asociadas.`))return;
  await deleteGroup(id,state);await refresh({toast:'Grupo y sesiones asociadas eliminados.'});
}
async function removeSession(id) {
  const session=state.sessions.find(s=>s.id===id);if(!session)return;
  if(!confirm(`¿Eliminar la sesión del ${session.dia} ${session.inicio}–${session.fin}?`))return;
  await deleteSession(id);await refresh({toast:'Sesión eliminada.'});
}

function formatSignedPending(value) {
  if (value < 0) return `Exceso ${formatDuration(Math.abs(value))}`;
  return formatDuration(value);
}

init();
