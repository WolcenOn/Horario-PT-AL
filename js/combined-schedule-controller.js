import { loadState } from './repository.js';
import { renderCombinedSchedule } from './combined-schedule-view.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');

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
  applyViewShell({ view:'combinedCalendar', title:'Horario combinado' });
  renderCombinedSchedule(viewRoot, { state });
}

window.addEventListener('focus', () => {
  if (opened && document.querySelector('.combined-schedule-view')) void openCombinedSchedule();
});

document.addEventListener('click', event => {
  const nav = event.target.closest?.('.nav-item');
  if (nav && nav.dataset.view !== 'combinedCalendar') opened = false;
}, true);
