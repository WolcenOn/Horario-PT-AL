import {
  backendConfigured,
  backendSettingsFromAuth,
  checkBackendHealth,
  createAcademicYear,
  createPlanningScenario,
  fetchCurrentAuth,
  fetchPlanningScenarioSnapshot,
  listAcademicYears,
  listAuthSessions,
  listPlanningScenarios,
  loadBackendSettings,
  loginBackend,
  logoutAllBackend,
  logoutBackend,
  pushAcademicConfiguration,
  registerSchoolBackend,
  revokeAuthSession,
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
let authStatus = null;

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
    const authResolved = await resolveAuthContext(loadBackendSettings());
    const resolved = await resolveAcademicContext(authResolved.settings);
    const settings = resolved.settings;
    applyViewShell({ view:'integration', title:'Cuenta y sincronización' });

    renderIntegrationView(viewRoot, {
      state,
      settings,
      status:connectionStatus,
      authContext:{ ...authResolved.context, status:authStatus },
      academicContext:resolved.context,
      onLogin:async payload => {
        authStatus = { kind:'pending', message:'Comprobando correo y contraseña…' };
        await openIntegration();
        try {
          const auth = await loginBackend(payload);
          const current = loadBackendSettings();
          const next = backendSettingsFromAuth({ ...current, baseUrl:payload.baseUrl }, auth);
          saveBackendSettings(next);
          authStatus = { kind:'ok', message:'Sesión iniciada correctamente.' };
          connectionStatus = null;
          showToast(next.schoolId
            ? 'Sesión iniciada. Ya puedes trabajar con el centro conectado.'
            : 'Sesión iniciada. Selecciona el centro con el que quieres trabajar.');
        } catch (error) {
          const message = loginErrorMessage(error);
          authStatus = { kind:'error', message };
          showToast(message, 'error');
        }
        await openIntegration();
      },
      onRegister:async payload => {
        authStatus = { kind:'pending', message:'Creando la cuenta administradora y el centro…' };
        await openIntegration();
        try {
          const auth = await registerSchoolBackend(payload);
          const current = loadBackendSettings();
          const next = backendSettingsFromAuth({ ...current, baseUrl:payload.baseUrl }, auth);
          saveBackendSettings(next);
          authStatus = { kind:'ok', message:'Centro creado y sesión iniciada.' };
          connectionStatus = null;
          showToast('Centro creado. La sesión administradora ya está activa.');
        } catch (error) {
          authStatus = { kind:'error', message:error.message || 'No se pudo crear el centro.' };
          showToast(authStatus.message, 'error');
        }
        await openIntegration();
      },
      onLogout:async () => {
        const current = loadBackendSettings();
        try {
          if (current.accessToken) await logoutBackend(current);
        } catch (error) {
          console.warn('No se pudo revocar la sesión remota; se cerrará localmente.', error);
        }
        clearLocalAuth(current);
        authStatus = null;
        connectionStatus = null;
        showToast('Sesión cerrada en este navegador.');
        await openIntegration();
      },
      onLogoutAll:async () => {
        const accepted = confirm('Se cerrarán todas las sesiones de esta cuenta, incluida la de este navegador. ¿Continuar?');
        if (!accepted) return;
        const current = loadBackendSettings();
        try {
          await logoutAllBackend(current);
          clearLocalAuth(current);
          authStatus = null;
          connectionStatus = null;
          showToast('Todas las sesiones de la cuenta han sido cerradas.');
        } catch (error) {
          showToast(error.message || 'No se pudieron cerrar todas las sesiones.', 'error');
        }
        await openIntegration();
      },
      onRevokeSession:async sessionId => {
        const accepted = confirm('Se cerrará esa sesión en el otro navegador o dispositivo. ¿Continuar?');
        if (!accepted) return;
        try {
          await revokeAuthSession(loadBackendSettings(), sessionId);
          showToast('Sesión remota cerrada.');
        } catch (error) {
          showToast(error.message || 'No se pudo cerrar la sesión remota.', 'error');
        }
        await openIntegration();
      },
      onSelectMembership:async schoolId => {
        const current = loadBackendSettings();
        const membershipIds = new Set(
          (authResolved.context.session?.memberships || [])
            .map(item => String(item?.school_id || '').trim())
            .filter(Boolean)
        );
        const selected = String(schoolId || '').trim();
        if (selected && !membershipIds.has(selected)) {
          showToast('Ese centro no pertenece a la sesión actual.', 'error');
          return;
        }
        saveBackendSettings({ ...current, schoolId:selected, academicYearId:'', scenarioId:'' });
        await openIntegration();
      },
      onSave:async value => {
        saveBackendSettings(value);
        connectionStatus = null;
        showToast(value.enabled ? 'Conexión avanzada guardada. El modo offline sigue disponible.' : 'Funciones online desactivadas. La aplicación continúa en modo offline.');
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
        saveBackendSettings({ ...current, scenarioId:String(scenarioId || '') });
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
      onSync:async (_value, adapter) => {
        const current = loadBackendSettings();
        if (!adapter.report.ready) {
          showToast('Corrige los errores del adaptador antes de sincronizar.', 'error');
          return;
        }
        const accepted = confirm(`Se enviarán ${adapter.report.counts.teachers} docentes, ${adapter.report.counts.groups} grupos-clase y ${adapter.report.counts.activities} actividades a GestorEscuela. La configuración operativa remota del centro indicado será sustituida. Los datos locales NO se modificarán. ¿Continuar?`);
        if (!accepted) return;
        try {
          await pushAcademicConfiguration(current, toJsonCompatible(adapter.configuration));
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

async function resolveAuthContext(settings) {
  if (!settings.accessToken) {
    return { settings, context:{ session:null, sessions:[], sessionsError:'', error:'' } };
  }
  try {
    const session = await fetchCurrentAuth(settings);
    const nextSettings = backendSettingsFromAuth(settings, { ...session, access_token:settings.accessToken });
    const saved = nextSettings.schoolId !== settings.schoolId ? saveBackendSettings(nextSettings) : nextSettings;
    let sessions = [];
    let sessionsError = '';
    try {
      sessions = await listAuthSessions(saved);
    } catch (error) {
      if (error?.status === 401) throw error;
      sessionsError = error.message || 'No se pudieron consultar las sesiones de la cuenta.';
    }
    return { settings:saved, context:{ session, sessions, sessionsError, error:'' } };
  } catch (error) {
    if (error?.status === 401) {
      const cleared = clearLocalAuth(settings);
      authStatus = { kind:'error', message:'La sesión ha caducado o ha sido cerrada. Vuelve a iniciar sesión.' };
      return { settings:cleared, context:{ session:null, sessions:[], sessionsError:'', error:'' } };
    }
    return { settings, context:{ session:null, sessions:[], sessionsError:'', error:error.message || 'No se pudo verificar la sesión.' } };
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

function clearLocalAuth(settings) {
  return saveBackendSettings({
    ...settings,
    enabled:false,
    accessToken:'',
    actorId:'',
    schoolId:'',
    academicYearId:'',
    scenarioId:''
  });
}

function loginErrorMessage(error) {
  if (error?.status !== 429) return error?.message || 'No se pudo iniciar sesión.';
  const seconds = Number(error?.retryAfter) || 0;
  if (!seconds) return 'Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.';
  if (seconds < 60) return `Demasiados intentos fallidos. Espera ${Math.ceil(seconds)} s antes de volver a intentarlo.`;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `Demasiados intentos fallidos. Espera aproximadamente ${minutes} min antes de volver a intentarlo.`;
}

function escapeText(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
}
