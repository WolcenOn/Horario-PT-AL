import { loadState } from './repository.js';
import { openProfessionalForm } from './profesionales.js';
import { renderProfessionalSchedule } from './professional-schedule.js';
import { printProfessionalSchedules } from './teacher-print.js';
import { saveProfessional } from './repository.js';
import { showToast } from './ui.js';

const root = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

let openProfessionalId = null;
let enhancing = false;

const observer = new MutationObserver(() => {
  if (openProfessionalId || enhancing || pageTitle?.textContent !== 'Profesorado') return;
  enhancing = true;
  queueMicrotask(() => {
    enhanceProfessionalTable();
    enhancing = false;
  });
});
observer.observe(root, { childList:true, subtree:true });

document.addEventListener('click', event => {
  const scheduleButton = event.target.closest?.('[data-professional-schedule]');
  if (scheduleButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void openSchedule(scheduleButton.dataset.professionalSchedule);
    return;
  }

  const professionalsNav = event.target.closest?.('[data-view="professionals"]');
  if (professionalsNav) {
    openProfessionalId = null;
    setTimeout(enhanceProfessionalTable, 0);
  }
}, true);

function enhanceProfessionalTable() {
  if (pageTitle?.textContent !== 'Profesorado') return;
  root.querySelectorAll('button[data-edit]').forEach(editButton => {
    const id = editButton.dataset.edit;
    const cell = editButton.closest('.table-actions');
    if (!id || !cell || cell.querySelector(`[data-professional-schedule="${cssEscape(id)}"]`)) return;
    const button = document.createElement('button');
    button.className = 'button';
    button.type = 'button';
    button.dataset.professionalSchedule = id;
    button.textContent = 'Horario';
    cell.insertBefore(button, editButton);
  });
}

async function openSchedule(id) {
  const state = await loadState();
  if (!state.professionals.some(item => item.id === id)) {
    showToast('No se encuentra ese profesional.', 'error');
    return;
  }
  openProfessionalId = id;
  pageTitle.textContent = 'Horario individual';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'professionals'));
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');

  renderProfessionalSchedule(root, {
    state,
    professionalId:id,
    onBack:() => document.querySelector('[data-view="professionals"]')?.click(),
    onEdit:professionalId => editProfessional(state, professionalId)
  });
  addPrintButton(state, id);
}

function addPrintButton(state, id) {
  const actions = root.querySelector('.professional-schedule-hero .button-row');
  if (!actions || actions.querySelector('[data-print-professional-schedule]')) return;
  const button = document.createElement('button');
  button.className = 'button';
  button.type = 'button';
  button.dataset.printProfessionalSchedule = id;
  button.textContent = '🖨 Imprimir horario';
  button.addEventListener('click', () => {
    try {
      printProfessionalSchedules(state, [id]);
    } catch (error) {
      showToast(error.message || 'No se pudo abrir la impresión del docente.', 'error');
    }
  });
  actions.insertBefore(button, actions.lastElementChild || null);
}

function editProfessional(state, id) {
  const professional = state.professionals.find(item => item.id === id);
  if (!professional) return;
  openProfessionalForm(professional, {
    state,
    onSave:async value => {
      await saveProfessional(value);
      showToast('Profesorado actualizado.');
      await openSchedule(value.id);
    }
  });
}

function cssEscape(value) {
  return String(value || '').replace(/["\\]/g, '\\$&');
}