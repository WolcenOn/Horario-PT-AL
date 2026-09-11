import { detectConflicts } from './conflicts.js';
import { renderCenterDashboard } from './dashboard-view.js';
import { calculateStudentHours } from './hours.js';
import { loadState } from './repository.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const dashboardNav = document.querySelector('[data-view="dashboard"]');
let rendering = false;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="dashboard"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openDashboard();
}, true);

void openAsInitialView();

async function openAsInitialView() {
  if (!dashboardNav) return;
  await waitForInitialCalendarRender();
  await openDashboard();
}

function waitForInitialCalendarRender() {
  if (initialCalendarRendered()) return Promise.resolve();
  return new Promise(resolve => {
    const target = document.querySelector('#mainContent') || document.body;
    const observer = new MutationObserver(() => {
      if (!initialCalendarRendered()) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(target, { childList:true, subtree:true, characterData:true });
  });
}

function initialCalendarRendered() {
  return Boolean(viewRoot?.children.length && pageTitle?.textContent?.trim() === 'Horario semanal');
}

async function openDashboard() {
  if (rendering) return;
  rendering = true;
  try {
    const state = await loadState();
    const conflicts = detectConflicts(state);
    const hoursMap = calculateStudentHours(state.students, state.groups, state.sessions);
    applyViewShell({ view:'dashboard', title:'Resumen del centro' });
    renderCenterDashboard(viewRoot, {
      state,
      conflicts,
      hoursMap,
      onNavigate:target => document.querySelector(`.nav-item[data-view="${CSS.escape(target)}"]`)?.click()
    });
  } finally {
    rendering = false;
  }
}
