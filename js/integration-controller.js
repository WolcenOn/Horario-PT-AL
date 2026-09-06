import { checkBackendHealth, loadBackendSettings, pushAcademicConfiguration, saveBackendSettings } from './backend-service.js';
import { renderIntegrationView } from './integration-view.js';
import { loadState } from './repository.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');
let connectionStatus = null;

// Captura únicamente la entrada de integración. El resto de la navegación continúa
// gestionada por app.js y, por tanto, conserva exactamente el comportamiento offline.
document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="integration"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openIntegration();
}, true);

async function openIntegration() {
  try {
    const state = await loadState();
    const settings = loadBackendSettings();
    pageTitle.textContent = 'Integración GestorEscuela';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'integration'));
    summaryStrip?.classList.add('hidden');
    serviceFilter?.classList.add('hidden');
    primaryAction?.classList.add('hidden');
    printActions?.classList.add('hidden');

    renderIntegrationView(viewRoot, {
      state,
      settings,
      status:connectionStatus,
      onSave:async value => {
        saveBackendSettings(value);
        connectionStatus = null;
        showToast(value.enabled ? 'Conexión GestorEscuela guardada. El modo offline sigue disponible.' : 'Funciones online desactivadas. La aplicación continúa en modo offline.');
        await openIntegration();
      },
      onTest:async value => {
        saveBackendSettings(value);
        connectionStatus = { kind:'pending', message:'Probando conexión…' };
        await openIntegration();
        try {
          const response = await checkBackendHealth(value);
          connectionStatus = { kind:'ok', message:response?.status === 'ok' ? 'GestorEscuela respondió correctamente.' : 'El servidor respondió.' };
        } catch (error) {
          connectionStatus = { kind:'error', message:error.message || 'No se pudo conectar.' };
        }
        await openIntegration();
      },
      onSync:async (value, adapter) => {
        const saved = saveBackendSettings(value);
        if (!adapter.report.ready) {
          showToast('Corrige los errores del adaptador antes de sincronizar.', 'error');
          return;
        }
        const accepted = confirm(`Se enviarán ${adapter.report.counts.teachers} docentes, ${adapter.report.counts.groups} grupos-clase y ${adapter.report.counts.activities} actividades a GestorEscuela. La configuración académica remota del centro indicado será sustituida. Los datos locales NO se modificarán. ¿Continuar?`);
        if (!accepted) return;
        try {
          await pushAcademicConfiguration(saved, adapter.configuration);
          connectionStatus = { kind:'ok', message:'Configuración académica sincronizada correctamente.' };
          showToast('Configuración enviada a GestorEscuela. Los datos locales permanecen intactos.');
        } catch (error) {
          connectionStatus = { kind:'error', message:error.message || 'No se pudo sincronizar.' };
          showToast(connectionStatus.message, 'error');
        }
        await openIntegration();
      }
    });
  } catch (error) {
    console.error(error);
    viewRoot.innerHTML = `<section class="card"><div class="empty-state"><strong>No se pudo abrir la integración</strong>${escapeText(error.message || 'Error inesperado.')}</div></section>`;
  }
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
