import { loadState } from './repository.js';
import { analyzeGlobalDistributionLimits, describeDistributionIssue } from './global-recovery.js';
import { renderSetupWizard } from './setup-wizard.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');

let opened = false;
let enhancingFailure = false;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="setupWizard"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openSetupWizard();
}, true);

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-global-recovery-action]');
  if (!button) return;
  const action = button.dataset.globalRecoveryAction;
  if (action === 'adjust-max') {
    const select = document.querySelector('#maxSameSubjectPerDay');
    const suggested = String(button.dataset.suggestedMax || '');
    if (select && suggested && [...select.options].some(option => option.value === suggested)) {
      select.value = suggested;
      select.dispatchEvent(new Event('change', { bubbles:true }));
      document.querySelector('[data-generate-global]')?.click();
    }
    return;
  }
  if (action === 'recalculate') {
    document.querySelector('[data-generate-global]')?.click();
    return;
  }
  if (action) navigateTo(action);
}, true);

const failureObserver = new MutationObserver(() => void enhanceGlobalFailure());
failureObserver.observe(viewRoot, { childList:true, subtree:true });

async function openSetupWizard() {
  opened = true;
  const state = await loadState();
  applyViewShell({ view:'setupWizard', title:'Asistente de configuración' });

  renderSetupWizard(viewRoot, {
    state,
    onNavigate:target => navigateTo(target),
    onEditRecesses:() => {
      const button = document.querySelector('#recessSettingsBtn');
      if (button) button.click();
    }
  });
}

async function enhanceGlobalFailure() {
  if (enhancingFailure) return;
  const result = viewRoot.querySelector('.global-proposal-result.is-error');
  if (!result || result.querySelector('[data-global-recovery]')) return;

  enhancingFailure = true;
  try {
    const state = await loadState();
    if (!result.isConnected || result.querySelector('[data-global-recovery]')) return;
    const analysis = analyzeGlobalDistributionLimits(state.centerPlanningSettings);
    const panel = document.createElement('div');
    panel.className = 'global-generator-note global-recovery-panel';
    panel.dataset.globalRecovery = 'true';

    const issueMarkup = analysis.issues.length
      ? `<div class="global-recovery-diagnostics"><strong>He detectado ${analysis.issues.length} límite(s) de distribución imposible(s):</strong>${analysis.issues.slice(0,6).map(issue => `<span>• ${escapeRecoveryText(describeDistributionIssue(issue))}</span>`).join('')}${analysis.issues.length > 6 ? `<span>… y ${analysis.issues.length - 6} más.</span>` : ''}</div>`
      : '<span>La configuración básica es compatible. El bloqueo se ha producido durante la construcción de la propuesta; revisa primero las restricciones más ajustadas.</span>';

    const suggested = analysis.suggestedGlobalMax;
    const canQuickFix = analysis.canFixWithGlobalMax && suggested <= 4;
    panel.innerHTML = `
      <strong>Cómo continuar sin empezar de nuevo</strong>
      <span>El horario que ya tengas aplicado no se borra. Puedes cambiar solo lo necesario y volver a calcular.</span>
      ${issueMarkup}
      <div class="button-row global-recovery-actions">
        ${canQuickFix ? `<button class="button button-primary" type="button" data-global-recovery-action="adjust-max" data-suggested-max="${suggested}">Ajustar máximo a ${suggested}/día y recalcular</button>` : ''}
        <button class="button" type="button" data-global-recovery-action="recalculate">↻ Recalcular tras los cambios</button>
        <button class="button" type="button" data-global-recovery-action="temporalPatterns">Patrones temporales</button>
        <button class="button" type="button" data-global-recovery-action="professionals">Profesorado</button>
        <button class="button" type="button" data-global-recovery-action="centerActivities">Actividades</button>
        <button class="button" type="button" data-global-recovery-action="setupWizard">Asistente inicial</button>
      </div>`;

    const buttons = result.querySelector('.button-row');
    result.insertBefore(panel, buttons || null);
  } finally {
    enhancingFailure = false;
  }
}

function navigateTo(target) {
  opened = false;
  const button = document.querySelector(`.nav-item[data-view="${CSS.escape(target)}"]`);
  if (button) button.click();
}

function escapeRecoveryText(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

window.addEventListener('focus', () => {
  if (opened && document.querySelector('.setup-wizard-view')) void openSetupWizard();
});
