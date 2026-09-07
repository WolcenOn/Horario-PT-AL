import { renderCapacityStudy } from './capacity-view.js';
import { loadState } from './repository.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="capacityStudy"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCapacityStudy();
}, true);

async function openCapacityStudy() {
  const state = await loadState();
  pageTitle.textContent = 'Estudio de plantilla';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'capacityStudy'));
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');
  renderCapacityStudy(viewRoot, {
    state,
    onOpenProfessionals:() => document.querySelector('[data-view="professionals"]')?.click(),
    onOpenCenterPlanning:() => document.querySelector('[data-view="centerPlanning"]')?.click()
  });
}
