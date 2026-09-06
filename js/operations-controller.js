import { createDayPlan, listDayPlans, loadBackendSettings, pushAcademicConfiguration, solveAcademicDay } from './backend-service.js';
import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { toJsonCompatible } from './gestor-serialization.js';
import { renderOperationsView } from './operations-view.js';
import { loadState } from './repository.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');
let operationStatus = null;
let latestResult = null;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="operations"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openOperations();
}, true);

async function openOperations() {
  try {
    const state = await loadState();
    const settings = loadBackendSettings();
    const adapter = buildGestorEscuelaConfiguration(state);
    pageTitle.textContent = 'Operativa diaria';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'operations'));
    summaryStrip?.classList.add('hidden');
    serviceFilter?.classList.add('hidden');
    primaryAction?.classList.add('hidden');
    printActions?.classList.add('hidden');

    renderOperationsView(viewRoot, {
      state,
      settings,
      adapter,
      status:operationStatus,
      result:latestResult,
      onSolve:async request => solveAbsence({ state, settings, adapter, request })
    });
  } catch (error) {
    console.error(error);
    viewRoot.innerHTML = `<section class="card"><div class="empty-state"><strong>No se pudo abrir Operativa diaria</strong>${escapeText(error.message || 'Error inesperado.')}</div></section>`;
  }
}

async function solveAbsence({ settings, adapter, request }) {
  operationStatus = { kind:'pending', message:'Sincronizando horario y preparando el plan diario…' };
  latestResult = null;
  await openOperations();
  try {
    if (!request.date) throw new Error('Selecciona la fecha de la ausencia.');
    const teacherId = adapter.report.mappings.teachers?.[request.professionalId];
    if (!teacherId) throw new Error('No se pudo traducir el docente seleccionado al backend.');
    if (!request.slotIds?.length) throw new Error('Selecciona al menos una franja.');

    // Cada cálculo usa la fotografía local actual para que el solver no trabaje con una
    // configuración remota obsoleta. Esto nunca escribe de vuelta en IndexedDB.
    await pushAcademicConfiguration(settings, toJsonCompatible(adapter.configuration));

    const existing = await listDayPlans(settings, request.date);
    let plan = Array.isArray(existing) ? existing[0] : null;
    if (!plan) {
      plan = await createDayPlan(settings, {
        plan_date:request.date,
        source_hash:null,
        notes:'Creado desde Horario PT / AL · rama de integración',
        payload:{ source:'horario-pt-al' }
      });
    }
    if (String(plan.status || '').toUpperCase() === 'CONFIRMED') {
      throw new Error('El plan de ese día está confirmado en GestorEscuela. Debe reabrirse antes de recalcularlo.');
    }

    operationStatus = { kind:'pending', message:'GestorEscuela está buscando la mejor cobertura global…' };
    await openOperations();
    latestResult = await solveAcademicDay(settings, plan.id, {
      absences:[{ teacher_id:teacherId, slot_ids:request.slotIds }],
      locked_substitutions:[],
      expected_version:Number(plan.version) || undefined
    });
    const solution = latestResult?.payload?.solution || {};
    const substitutions = solution.substitutions?.length || 0;
    const uncovered = solution.uncovered?.length || 0;
    operationStatus = { kind:'ok', message:`${substitutions} sustitución(es) propuesta(s) y ${uncovered} necesidad(es) sin cubrir.` };
    showToast('GestorEscuela ha calculado la propuesta de sustituciones.');
  } catch (error) {
    console.error(error);
    operationStatus = { kind:'error', message:error.message || 'No se pudo calcular la sustitución.' };
    showToast(operationStatus.message, 'error');
  }
  await openOperations();
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
