import { loadState } from './repository.js';
import { renderCombinedSchedule } from './combined-schedule-view.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

let opened = false;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="combinedCalendar"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCombinedSchedule();
}, true);

async function openCombinedSchedule() {
  const state = await loadState();
  opened = true;
  pageTitle.textContent = 'Horario combinado';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'combinedCalendar'));
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');
  renderCombinedSchedule(viewRoot, { state });
}

window.addEventListener('focus', () => {
  if (opened && document.querySelector('.combined-schedule-view')) void openCombinedSchedule();
});

document.addEventListener('click', event => {
  const nav = event.target.closest?.('.nav-item');
  if (nav && nav.dataset.view !== 'combinedCalendar') opened = false;
}, true);
