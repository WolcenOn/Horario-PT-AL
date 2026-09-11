import { detectConflicts } from './conflicts.js';
import { renderCenterDashboard } from './dashboard-view.js';
import { calculateStudentHours } from './hours.js';
import { loadState } from './repository.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');
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
  if (!viewRoot.children.length) {
    await new Promise(resolve => {
      const observer = new MutationObserver(() => {
        if (!viewRoot.children.length) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(viewRoot, { childList:true });
    });
  }
  await openDashboard();
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
