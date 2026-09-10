import { loadState } from './repository.js';
import { renderSetupWizard } from './setup-wizard.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

let opened = false;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="setupWizard"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openSetupWizard();
}, true);

async function openSetupWizard() {
  opened = true;
  const state = await loadState();
  pageTitle.textContent = 'Asistente de configuración';
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'setupWizard'));
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');

  renderSetupWizard(viewRoot, {
    state,
    onNavigate:target => navigateTo(target),
    onEditRecesses:() => {
      const button = document.querySelector('#recessSettingsBtn');
      if (button) button.click();
    }
  });
}

function navigateTo(target) {
  opened = false;
  const button = document.querySelector(`.nav-item[data-view="${CSS.escape(target)}"]`);
  if (button) button.click();
}

window.addEventListener('focus', () => {
  if (opened && document.querySelector('.setup-wizard-view')) void openSetupWizard();
});
