import { backendConfigured, loadBackendSettings, solveStaffingAllocation } from './backend-service.js';
import { renderCapacityStudy } from './capacity-view.js';
import { loadState } from './repository.js';
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
    }
  });
  render();
}
