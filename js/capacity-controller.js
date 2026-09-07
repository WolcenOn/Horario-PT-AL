import { backendConfigured, loadBackendSettings, solveStaffingAllocation } from './backend-service.js';
import { renderCapacityStudy } from './capacity-view.js';
import { loadState, saveProfessional } from './repository.js';
import { normalizeProfessionalProfile } from './center-planning.js';
import { buildStaffingSolverPayload } from './staffing-adapter.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');
let optimizerStatus = null;
let optimizerResult = null;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="capacityStudy"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCapacityStudy();
}, true);

async function openCapacityStudy() {
  const state = await loadState();
  const settings = loadBackendSettings();
  const staffing = buildStaffingSolverPayload(state);
  pageTitle.textContent = 'Estudio de plantilla';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'capacityStudy'));
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');

  const render = () => renderCapacityStudy(viewRoot, {
    state,
    backendReady:backendConfigured(settings),
    optimizerStatus,
    optimizerResult,
    onOpenProfessionals:() => document.querySelector('[data-view="professionals"]')?.click(),
    onOpenCenterPlanning:() => document.querySelector('[data-view="centerPlanning"]')?.click(),
    onOptimize:async () => {
      if (!backendConfigured(settings)) {
        showToast('Activa y vincula GestorEscuela antes de optimizar el reparto.', 'error');
        return;
      }
      if (!staffing.payload.teachers.length || !staffing.payload.group_ids.length) {
        showToast('Configura primero la plantilla y la estructura del centro.', 'error');
        return;
      }
      optimizerStatus = { kind:'pending', message:'Calculando reparto docente con CP-SAT…' };
      optimizerResult = null;
      render();
      try {
        optimizerResult = await solveStaffingAllocation(settings, staffing.payload);
        optimizerStatus = {
          kind:optimizerResult.complete ? 'ok' : 'warning',
          message:optimizerResult.complete ? 'Se ha encontrado un reparto completo.' : 'Se ha encontrado una propuesta parcial; quedan necesidades sin cubrir.'
        };
        showToast(optimizerStatus.message);
      } catch (error) {
        optimizerStatus = { kind:'error', message:error.message || 'No se pudo calcular el reparto docente.' };
        showToast(optimizerStatus.message, 'error');
      }
      render();
    },
    onApply:async () => {
      if (!optimizerResult?.complete) {
        showToast('Solo se puede aplicar una propuesta completa.', 'error');
        return;
      }
      const accepted = confirm('Se guardará este reparto como nueva base de planificación: las tutorías y materias propuestas quedarán fijadas en los perfiles docentes. No se modifica todavía ninguna hora del calendario. ¿Aplicar?');
      if (!accepted) return;

      const requirementKeys = new Set(staffing.study.requirements.map(item => pairKey(item.grupoClase, item.subject)));
      const assignmentsByTeacher = new Map(state.professionals.map(item => [item.id, []]));
      for (const assignment of optimizerResult.assignments || []) {
        if (!assignmentsByTeacher.has(assignment.teacher_id)) assignmentsByTeacher.set(assignment.teacher_id, []);
        assignmentsByTeacher.get(assignment.teacher_id).push({ grupoClase:assignment.group_id, materia:assignment.subject });
      }
      const tutorByTeacher = new Map((optimizerResult.tutors || []).map(item => [item.teacher_id, item.group_id]));
      const plannedGroups = new Set(staffing.study.classes);

      for (const raw of state.professionals) {
        const current = normalizeProfessionalProfile(raw);
        const preservedAssignments = current.teachingAssignments.filter(item => !requirementKeys.has(pairKey(item.grupoClase, item.materia)));
        const proposedAssignments = assignmentsByTeacher.get(current.id) || [];
        const proposedTutor = tutorByTeacher.get(current.id);
        const tutoriaGrupo = proposedTutor || (current.tutoriaGrupo && !plannedGroups.has(current.tutoriaGrupo) ? current.tutoriaGrupo : '');
        await saveProfessional(normalizeProfessionalProfile({
          ...current,
          tutoriaGrupo,
          teachingAssignments:[...preservedAssignments, ...proposedAssignments]
        }));
      }

      optimizerStatus = null;
      optimizerResult = null;
      showToast('Reparto docente aplicado. Estas decisiones serán la base bloqueada de los siguientes cálculos.');
      await openCapacityStudy();
    }
  });
  render();
}

function pairKey(group, subject) {
  return `${String(group || '').trim().toLocaleLowerCase('es')}\u0000${String(subject || '').trim().toLocaleLowerCase('es')}`;
}
