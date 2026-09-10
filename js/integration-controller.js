import {
  backendConfigured,
  bootstrapBackendConnection,
  checkBackendHealth,
  createAcademicYear,
  createPlanningScenario,
  fetchPlanningScenarioSnapshot,
  listAcademicYears,
  listPlanningScenarios,
  loadBackendSettings,
  pushAcademicConfiguration,
  saveBackendSettings,
  savePlanningScenarioSnapshot
} from './backend-service.js';
import { renderIntegrationView } from './integration-view.js';
import { toJsonCompatible } from './gestor-serialization.js';
import { loadState } from './repository.js';
import { applySharePackage, createSharePackage } from './sharing.js';
import { showToast } from './ui.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');
let connectionStatus = null;

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
    const resolved = await resolveAcademicContext(loadBackendSettings());
    const settings = resolved.settings;
    applyViewShell({ view:'integration', title:'Cuenta y sincronización' });

    renderIntegrationView(viewRoot, {
      state,
      settings,
      status:connectionStatus,
      academicContext:resolved.context,
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
      onBootstrap:async value => {
        const accepted = confirm('Se crearán en GestorEscuela un usuario administrador, un centro y su pertenencia ADMIN. No se modificará ningún dato local. ¿Continuar?');
        if (!accepted) return;
        connectionStatus = { kind:'pending', message:'Creando centro y administrador…' };
        await openIntegration();
        try {
          const result = await bootstrapBackendConnection(value);
          saveBackendSettings(result.settings);
          connectionStatus = { kind:'ok', message:`Centro vinculado: ${result.school.name}. School ID y Actor ID guardados en este navegador.` };
          showToast('Centro y administrador vinculados con GestorEscuela.');
        } catch (error) {
          connectionStatus = { kind:'error', message:error.message || 'No se pudo crear el vínculo inicial.' };
          showToast(connectionStatus.message, 'error');
        }
        await openIntegration();
      },
      onCreateAcademicYear:async payload => {
        const current = loadBackendSettings();
        const label = String(payload?.label || '').trim();
        if (!label) {
          showToast('Indica la etiqueta del curso académico.', 'error');
          return;
        }
        try {
          const academicYear = await createAcademicYear(current, {
            label,
            start_date:payload?.start_date || null,
            end_date:payload?.end_date || null
          });
          saveBackendSettings({ ...current, academicYearId:academicYear.id, scenarioId:'' });
          showToast(`Curso ${academicYear.label} creado y seleccionado.`);
        } catch (error) {
          showToast(error.message || 'No se pudo crear el curso académico.', 'error');
        }
        await openIntegration();
      },
      onSelectAcademicYear:async academicYearId => {
        const current = loadBackendSettings();
        saveBackendSettings({ ...current, academicYearId:String(academicYearId || ''), scenarioId:'' });
        await openIntegration();
      },
      onCreateScenario:async payload => {
        const current = loadBackendSettings();
        const name = String(payload?.name || '').trim();
        if (!current.academicYearId) {
          showToast('Selecciona primero un curso académico.', 'error');
          return;
        }
        if (!name) {
          showToast('Indica el nombre del escenario.', 'error');
          return;
        }
        try {
          const scenario = await createPlanningScenario(current, current.academicYearId, { name });
          saveBackendSettings({ ...current, scenarioId:scenario.id });
          showToast(`Escenario “${scenario.name}” creado y seleccionado.`);
        } catch (error) {
          showToast(error.message || 'No se pudo crear el escenario.', 'error');
        }
        await openIntegration();
      },
      onSelectScenario:async scenarioId => {
        const current = loadBackendSettings();
        saveBackendSettings({ ...current, scenarioId:String(scenarioId || ''), scenarioId:String(scenarioId || '') });
        await openIntegration();
      },
      onSaveScenarioSnapshot:async () => {
        const current = loadBackendSettings();
        if (!current.academicYearId || !current.scenarioId) {
          showToast('Selecciona un curso académico y un escenario.', 'error');
          return;
        }
        const accepted = confirm(`Se guardará en el escenario seleccionado una copia completa del proyecto local: ${state.students.length} alumnos, ${state.professionals.length} profesionales, ${state.groups.length} grupos PT/AL, ${state.sessions.length} sesiones y ${state.classSchedules.length} franjas de aula. IndexedDB no se modificará. ¿Continuar?`);
        if (!accepted) return;
        try {
          const snapshot = await savePlanningScenarioSnapshot(current, createSharePackage(state));
          showToast(`Copia guardada en GestorEscuela · versión ${snapshot.version}.`);
        } catch (error) {
          showToast(error.message || 'No se pudo guardar la copia del escenario.', 'error');
        }
        await openIntegration();
      },
      onRestoreScenarioSnapshot:async snapshot => {
        if (!snapshot?.payload) {
          showToast('Este escenario no contiene todavía una copia del proyecto.', 'error');
          return;
        }
        const accepted = confirm(`Se sustituirán los datos de ESTE navegador por la versión ${snapshot.version} guardada en el escenario. Si quieres conservar el estado local actual, cancela y usa “Exportar / compartir” antes de continuar. ¿Cargar escenario?`);
        if (!accepted) return;
        try {
          const counts = await applySharePackage(snapshot.payload);
          localStorage.setItem('horario-user-cleared', 'true');
          showToast(`Escenario cargado: ${counts.students} alumnos, ${counts.professionals} profesionales, ${counts.groups} grupos y ${counts.sessions} sesiones.`);
        } catch (error) {
          showToast(error.message || 'La copia remota no es válida y no se ha aplicado.', 'error');
        }
        await openIntegration();
      },
      onSync:async (value, adapter) => {
        const saved = saveBackendSettings(value);
        if (!adapter.report.ready) {
          showToast('Corrige los errores del adaptador antes de sincronizar.', 'error');
          return;
        }
        const accepted = confirm(`Se enviarán ${adapter.report.counts.teachers} docentes, ${adapter.report.counts.groups} grupos-clase y ${adapter.report.counts.activities} actividades a GestorEscuela. La configuración operativa remota del centro indicado será sustituida. Los datos locales NO se modificarán. ¿Continuar?`);
        if (!accepted) return;
        try {
          await pushAcademicConfiguration(saved, toJsonCompatible(adapter.configuration));
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
    viewRoot.innerHTML = `<section class="card"><div class="empty-state"><strong>No se pudo abrir la sincronización</strong>${escapeText(error.message || 'Error inesperado.')}</div></section>`;
  }
}

async function resolveAcademicContext(settings) {
  if (!backendConfigured(settings)) {
    return {
      settings,
      context:{ years:[], scenarios:[], snapshot:null, error:'', snapshotError:'' }
    };
  }

  try {
    const years = await listAcademicYears(settings);
    let nextSettings = { ...settings };
    if (nextSettings.academicYearId && !years.some(item => item.id === nextSettings.academicYearId)) {
      nextSettings = saveBackendSettings({ ...nextSettings, academicYearId:'', scenarioId:'' });
    }

    let scenarios = [];
    let snapshot = null;
    let snapshotError = '';
    if (nextSettings.academicYearId) {
      scenarios = await listPlanningScenarios(nextSettings, nextSettings.academicYearId);
      if (nextSettings.scenarioId && !scenarios.some(item => item.id === nextSettings.scenarioId)) {
        nextSettings = saveBackendSettings({ ...nextSettings, scenarioId:'' });
      }
    }
    if (nextSettings.academicYearId && nextSettings.scenarioId) {
      try {
        snapshot = await fetchPlanningScenarioSnapshot(nextSettings);
      } catch (error) {
        if (error?.status !== 404) snapshotError = error.message || 'No se pudo consultar la copia del escenario.';
      }
    }

    return {
      settings:nextSettings,
      context:{ years, scenarios, snapshot, error:'', snapshotError }
    };
  } catch (error) {
    return {
      settings,
      context:{
        years:[], scenarios:[], snapshot:null,
        error:error.message || 'No se pudo cargar el contexto académico.',
        snapshotError:''
      }
    };
  }
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
