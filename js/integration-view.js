import {
  changeBackendPassword,
  confirmBackendPasswordReset,
  requestBackendPasswordReset
} from './account-auth-service.js';
import { backendConfigured, normalizeBackendSettings } from './backend-service.js';
import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { escapeHtml } from './utils.js';

export function renderIntegrationView(root, {
  state,
  settings,
  status,
  authContext,
  academicContext,
  onSave,
  onTest,
  onLogin,
  onRegister,
  onLogout,
  onLogoutAll,
  onRevokeSession,
  onSelectMembership,
  onCreateAcademicYear,
  onSelectAcademicYear,
  onCreateScenario,
  onSelectScenario,
  onSaveScenarioSnapshot,
  onRestoreScenarioSnapshot,
  onSync
}) {
  const normalized = normalizeBackendSettings(settings);
  const adapter = buildGestorEscuelaConfiguration(state);
  const configured = backendConfigured(normalized);
  const canSync = configured && adapter.report.ready;
  const context = academicContext && typeof academicContext === 'object'
    ? academicContext
    : { years:[], scenarios:[], snapshot:null, error:'', snapshotError:'' };
  const auth = authContext && typeof authContext === 'object'
    ? authContext
    : { session:null, sessions:[], sessionsError:'', error:'', status:null };
  const hasBearerSession = Boolean(normalized.accessToken);
  const legacyConfigured = Boolean(!hasBearerSession && normalized.actorId && normalized.schoolId);
  const modeLabel = hasBearerSession ? 'Sesión activa' : legacyConfigured ? 'Compatibilidad' : normalized.enabled ? 'Online pendiente' : 'Offline';
  const localAcademicYear = String(state.centerPlanningSettings?.academicYear || '').trim();
  const resetToken = readResetToken();

  root.innerHTML = `<div class="integration-view">
    <section class="card integration-hero">
      <div>
        <p class="eyebrow">Cuenta y sincronización</p>
        <h2>${hasBearerSession ? 'Tu centro conectado' : 'Trabaja localmente o conecta tu centro'}</h2>
        <p>El horario sigue funcionando en este navegador con IndexedDB. Iniciar sesión permite compartir escenarios y usar la operativa de GestorEscuela sin introducir identificadores técnicos.</p>
      </div>
      <span class="integration-mode ${hasBearerSession || legacyConfigured ? 'is-hybrid' : 'is-offline'}">${escapeHtml(modeLabel)}</span>
    </section>

    ${renderAccountCard(normalized, auth, { hasBearerSession, legacyConfigured, resetToken })}

    ${renderAcademicContextCard(normalized, configured, context, localAcademicYear)}

    <section class="card">
      <div class="card-header"><div><h2>Sincronización operativa</h2><small>Vista previa de los datos académicos que utiliza GestorEscuela para sustituciones y cálculos de centro.</small></div><span class="badge ${adapter.report.ready ? 'badge-success' : 'badge-warning'}">${adapter.report.ready ? 'Preparado' : `${adapter.report.errors.length} error(es)`}</span></div>
      <div class="card-body">
        <div class="integration-metrics">
          ${metric('Grupos-clase', adapter.report.counts.groups)}
          ${metric('Docentes', adapter.report.counts.teachers)}
          ${metric('Asignaturas', adapter.report.counts.subjects)}
          ${metric('Franjas atómicas', adapter.report.counts.timeSlots)}
          ${metric('Actividades', adapter.report.counts.activities)}
        </div>
        <div class="integration-note"><strong>Cómo se preservan las restricciones</strong><span>Las clases y sesiones se dividen en franjas compatibles con el backend. Las horas fuera de disponibilidad, descansos y presencia en otros centros se convierten en ocupaciones críticas no desplazables para que el solver no utilice al docente.</span></div>
        ${renderIssues('Errores que impiden sincronizar', adapter.report.errors, 'error')}
        ${renderIssues('Avisos para revisar', adapter.report.warnings, 'warning')}
        <details class="integration-details"><summary>Ver franjas que utilizará GestorEscuela</summary><div class="integration-slot-list">${adapter.report.slots.map(slot => `<span>${escapeHtml(slot.id)} · ${escapeHtml(slot.label)}</span>`).join('') || '<span>Sin franjas</span>'}</div></details>
        <div class="button-row integration-sync-actions">
          <button class="button button-primary" type="button" data-sync-backend ${canSync ? '' : 'disabled'}>Sincronizar configuración para operativa diaria</button>
          <span class="field-hint">La sincronización requiere una sesión activa. Las conexiones Actor ID ya existentes se mantienen solo durante la transición y no se pueden crear desde esta pantalla.</span>
        </div>
      </div>
    </section>

    ${renderAdvancedConnection(normalized, status, { hasBearerSession, legacyConfigured })}

    <section class="card integration-roadmap">
      <div class="card-header"><div><h2>Estado de la integración</h2><small>La conexión se activa de forma progresiva y mantiene el modo offline.</small></div></div>
      <div class="card-body integration-roadmap-grid">
        <div class="is-done"><b>1</b><span><strong>Planificación local</strong><small>IndexedDB continúa funcionando sin cuenta ni conexión.</small></span></div>
        <div class="is-done"><b>2</b><span><strong>Operativa y escenarios</strong><small>CP-SAT, cursos, escenarios y copias compartidas.</small></span></div>
        <div class="is-done"><b>3</b><span><strong>Sesiones Bearer</strong><small>Correo y contraseña son la vía normal de acceso. Actor ID queda solo para migraciones existentes.</small></span></div>
        <div><b>4</b><span><strong>Identidad institucional</strong><small>Google Workspace y Microsoft 365 podrán reutilizar la misma cuenta, centro y permisos.</small></span></div>
      </div>
    </section>
  </div>`;

  const form = root.querySelector('#backendSettingsForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    await onSave(readSettings(form, normalized));
  });
  root.querySelector('[data-test-backend]')?.addEventListener('click', async () => onTest(readSettings(form, normalized)));
  root.querySelector('[data-sync-backend]')?.addEventListener('click', async () => onSync(normalized, adapter));
  root.querySelector('[data-save-scenario-snapshot]')?.addEventListener('click', async () => onSaveScenarioSnapshot());
  root.querySelector('[data-restore-scenario-snapshot]')?.addEventListener('click', async () => onRestoreScenarioSnapshot(context.snapshot));
  root.querySelector('[data-logout-backend]')?.addEventListener('click', async () => onLogout());
  root.querySelector('[data-logout-all-backend]')?.addEventListener('click', async () => onLogoutAll());
  root.querySelectorAll('[data-revoke-auth-session]').forEach(button => {
    button.addEventListener('click', async () => onRevokeSession(button.dataset.revokeAuthSession));
  });

  const membershipSelect = root.querySelector('[data-auth-school-select]');
  membershipSelect?.addEventListener('change', async () => onSelectMembership(membershipSelect.value));

  const loginForm = root.querySelector('#backendLoginForm');
  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(loginForm);
    await onLogin({
      baseUrl:normalized.baseUrl,
      email:data.get('email'),
      password:data.get('password')
    });
  });

  const registerForm = root.querySelector('#backendRegisterForm');
  registerForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(registerForm);
    await onRegister({
      baseUrl:normalized.baseUrl,
      schoolName:data.get('schoolName'),
      displayName:data.get('displayName'),
      email:data.get('email'),
      password:data.get('password')
    });
  });

  const changePasswordForm = root.querySelector('#backendChangePasswordForm');
  changePasswordForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(changePasswordForm);
    const statusNode = root.querySelector('[data-change-password-status]');
    setInlineStatus(statusNode, 'Guardando la contraseña nueva…');
    try {
      await changeBackendPassword(normalized, {
        currentPassword:data.get('currentPassword'),
        newPassword:data.get('newPassword')
      });
      changePasswordForm.reset();
      setInlineStatus(statusNode, 'Contraseña actualizada. Las otras sesiones se han cerrado.', 'ok');
    } catch (error) {
      setInlineStatus(statusNode, error.message || 'No se pudo cambiar la contraseña.', 'error');
    }
  });

  const resetRequestForm = root.querySelector('#backendPasswordResetRequestForm');
  resetRequestForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(resetRequestForm);
    const statusNode = root.querySelector('[data-password-reset-request-status]');
    setInlineStatus(statusNode, 'Preparando la recuperación…');
    try {
      await requestBackendPasswordReset({ baseUrl:normalized.baseUrl, email:data.get('email') });
      setInlineStatus(statusNode, 'Si existe una cuenta con ese correo, recibirás un enlace para elegir una contraseña nueva.', 'ok');
    } catch (error) {
      setInlineStatus(statusNode, error.message || 'No se pudo solicitar la recuperación.', 'error');
    }
  });

  const resetConfirmForm = root.querySelector('#backendPasswordResetConfirmForm');
  resetConfirmForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(resetConfirmForm);
    const statusNode = root.querySelector('[data-password-reset-confirm-status]');
    setInlineStatus(statusNode, 'Actualizando la contraseña…');
    try {
      await confirmBackendPasswordReset({
        baseUrl:normalized.baseUrl,
        token:resetToken,
        newPassword:data.get('newPassword')
      });
      resetConfirmForm.reset();
      removeResetTokenFromUrl();
      setInlineStatus(statusNode, 'Contraseña restablecida. Ya puedes iniciar sesión con la contraseña nueva.', 'ok');
    } catch (error) {
      setInlineStatus(statusNode, error.message || 'El enlace de recuperación no es válido o ha caducado.', 'error');
    }
  });

  const academicYearSelect = root.querySelector('[data-academic-year-select]');
  academicYearSelect?.addEventListener('change', async () => onSelectAcademicYear(academicYearSelect.value));
  const scenarioSelect = root.querySelector('[data-scenario-select]');
  scenarioSelect?.addEventListener('change', async () => onSelectScenario(scenarioSelect.value));

  const academicYearForm = root.querySelector('#academicYearForm');
  academicYearForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(academicYearForm);
    await onCreateAcademicYear({
      label:data.get('label'),
      start_date:data.get('startDate') || null,
      end_date:data.get('endDate') || null
    });
  });

  const scenarioForm = root.querySelector('#planningScenarioForm');
  scenarioForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(scenarioForm);
    await onCreateScenario({ name:data.get('name') });
  });
}

function renderAccountCard(settings, auth, { hasBearerSession, legacyConfigured, resetToken }) {
  if (hasBearerSession) {
    const session = auth.session;
    const memberships = Array.isArray(session?.memberships) ? session.memberships : [];
    const selectedMembership = memberships.find(item => String(item.school_id) === settings.schoolId);
    const userName = session?.user?.display_name || session?.user?.email || 'Usuario conectado';
    const email = session?.user?.email || '';
    const selectedSchoolName = selectedMembership?.school_name || (settings.schoolId ? shortId(settings.schoolId) : 'Selecciona un centro');
    return `<section class="card integration-account-card">
      <div class="card-header"><div><h2>Sesión</h2><small>La credencial Bearer vive solo en esta pestaña/sesión del navegador; no se incluye al exportar el horario.</small></div><span class="badge badge-success">Conectado</span></div>
      <div class="card-body integration-form">
        ${auth.error ? `<div class="integration-status is-error"><strong>⚠ Sesión no verificada</strong><span>${escapeHtml(auth.error)}</span></div>` : ''}
        <div class="integration-session-summary">
          <div><span>Usuario</span><strong>${escapeHtml(userName)}</strong>${email && email !== userName ? `<small>${escapeHtml(email)}</small>` : ''}</div>
          <div><span>Centro activo</span><strong>${escapeHtml(selectedSchoolName)}</strong><small>${selectedMembership ? escapeHtml(selectedMembership.role || '') : 'La sesión puede pertenecer a más de un centro.'}</small></div>
        </div>
        ${memberships.length > 1 ? `<div class="form-field"><label for="authSchoolSelect">Centro de trabajo</label><select id="authSchoolSelect" data-auth-school-select><option value="">Selecciona un centro…</option>${memberships.map(item => `<option value="${escapeHtml(item.school_id)}" ${String(item.school_id) === settings.schoolId ? 'selected' : ''}>${escapeHtml(item.school_name || shortId(item.school_id))} · ${escapeHtml(item.role || 'Miembro')}</option>`).join('')}</select><span class="field-hint">Solo puedes seleccionar centros incluidos en la sesión autenticada.</span></div>` : ''}
        <details class="integration-details">
          <summary>Seguridad de la cuenta</summary>
          <form id="backendChangePasswordForm" class="integration-note">
            <strong>Cambiar contraseña</strong>
            <span>Al cambiarla se cerrarán las demás sesiones de la cuenta; esta sesión seguirá activa.</span>
            <div class="form-grid">
              <div class="form-field"><label for="currentAccountPassword">Contraseña actual</label><input id="currentAccountPassword" name="currentPassword" type="password" autocomplete="current-password" required maxlength="128"></div>
              <div class="form-field"><label for="newAccountPassword">Contraseña nueva</label><input id="newAccountPassword" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128"><span class="field-hint">Mínimo 10 caracteres.</span></div>
            </div>
            <button class="button" type="submit">Cambiar contraseña</button>
            <div class="integration-status" data-change-password-status>Sin cambios pendientes.</div>
          </form>
        </details>
        ${renderSessionManagement(auth)}
        <div class="button-row"><button class="button" type="button" data-logout-backend>Cerrar esta sesión</button><button class="button button-danger" type="button" data-logout-all-backend>Cerrar todas las sesiones</button></div>
      </div>
    </section>`;
  }

  return `<section class="card integration-account-card">
    <div class="card-header"><div><h2>Acceso al centro</h2><small>Usa una cuenta para compartir escenarios entre dispositivos y acceder a las funciones online.</small></div>${legacyConfigured ? '<span class="badge badge-warning">Modo compatible</span>' : ''}</div>
    <div class="card-body integration-auth-grid">
      <form id="backendLoginForm" class="integration-auth-panel">
        <div><strong>Iniciar sesión</strong><small>Para centros y usuarios que ya tienen cuenta.</small></div>
        <div class="form-field"><label for="loginEmail">Correo</label><input id="loginEmail" name="email" type="email" autocomplete="username" required maxlength="320" placeholder="correo@centro.es"></div>
        <div class="form-field"><label for="loginPassword">Contraseña</label><input id="loginPassword" name="password" type="password" autocomplete="current-password" required maxlength="128"></div>
        <button class="button button-primary" type="submit">Iniciar sesión</button>
      </form>
      <form id="backendRegisterForm" class="integration-auth-panel">
        <div><strong>Crear un centro</strong><small>Crea la primera cuenta administradora y deja el centro vinculado.</small></div>
        <div class="form-field"><label for="registerSchoolName">Centro</label><input id="registerSchoolName" name="schoolName" required maxlength="160" placeholder="CEIP / centro educativo"></div>
        <div class="form-field"><label for="registerDisplayName">Nombre</label><input id="registerDisplayName" name="displayName" required maxlength="160" autocomplete="name"></div>
        <div class="form-field"><label for="registerEmail">Correo</label><input id="registerEmail" name="email" type="email" autocomplete="username" required maxlength="320"></div>
        <div class="form-field"><label for="registerPassword">Contraseña</label><input id="registerPassword" name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="128"><span class="field-hint">Mínimo 10 caracteres.</span></div>
        <button class="button" type="submit">Crear centro y entrar</button>
      </form>
      <form id="backendPasswordResetRequestForm" class="integration-auth-panel">
        <div><strong>Recuperar contraseña</strong><small>Te enviaremos un enlace de un solo uso si el correo corresponde a una cuenta.</small></div>
        <div class="form-field"><label for="resetRequestEmail">Correo</label><input id="resetRequestEmail" name="email" type="email" autocomplete="email" required maxlength="320" placeholder="correo@centro.es"></div>
        <button class="button" type="submit">Enviar enlace de recuperación</button>
        <div class="integration-status" data-password-reset-request-status>La respuesta no revelará si el correo existe.</div>
      </form>
      ${resetToken ? `<form id="backendPasswordResetConfirmForm" class="integration-auth-panel integration-wide">
        <div><strong>Elegir contraseña nueva</strong><small>El enlace de recuperación es de un solo uso y caduca.</small></div>
        <div class="form-field"><label for="resetNewPassword">Contraseña nueva</label><input id="resetNewPassword" name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="128"><span class="field-hint">Mínimo 10 caracteres.</span></div>
        <button class="button button-primary" type="submit">Guardar contraseña nueva</button>
        <div class="integration-status" data-password-reset-confirm-status>Enlace de recuperación detectado.</div>
      </form>` : ''}
      ${auth.status ? renderAuthStatus(auth.status) : ''}
      ${legacyConfigured ? '<div class="integration-note integration-wide"><strong>Conexión de transición activa</strong><span>Este navegador conserva una conexión Actor ID creada anteriormente. Puede seguir utilizándose durante la migración, pero las altas nuevas ya requieren una cuenta con contraseña.</span></div>' : ''}
    </div>
  </section>`;
}

function renderSessionManagement(auth) {
  const sessions = Array.isArray(auth.sessions) ? auth.sessions : [];
  if (auth.sessionsError) {
    return `<div class="integration-status is-error"><strong>⚠ No se pudieron consultar tus sesiones</strong><span>${escapeHtml(auth.sessionsError)}</span></div>`;
  }
  if (!sessions.length) {
    return '<div class="integration-note"><strong>Sesiones de la cuenta</strong><span>No hay información de sesiones disponible todavía.</span></div>';
  }
  const visible = sessions.slice(0, 8);
  return `<div class="integration-auth-sessions">
    <div class="section-title"><div><strong>Sesiones de la cuenta</strong><small>Puedes cerrar sesiones de otros navegadores sin afectar a esta.</small></div><span class="badge badge-neutral">${sessions.length}</span></div>
    <div class="integration-auth-session-list">
      ${visible.map(item => renderAuthSession(item)).join('')}
    </div>
    ${sessions.length > visible.length ? `<span class="field-hint">Se muestran las ${visible.length} sesiones más recientes de ${sessions.length}.</span>` : ''}
  </div>`;
}

function renderAuthSession(item) {
  const revoked = Boolean(item?.revoked_at);
  const current = item?.current === true;
  const statusLabel = current ? 'Esta sesión' : revoked ? 'Revocada' : 'Activa';
  const statusClass = current ? 'badge-success' : revoked ? 'badge-neutral' : 'badge-warning';
  return `<div class="integration-auth-session ${revoked ? 'is-revoked' : ''}">
    <div><div class="integration-auth-session-title"><strong>${escapeHtml(statusLabel)}</strong><span class="badge ${statusClass}">${escapeHtml(statusLabel)}</span></div><small>Última actividad: ${escapeHtml(formatTimestamp(item?.last_seen_at))} · Caduca: ${escapeHtml(formatTimestamp(item?.expires_at))}</small></div>
    ${!current && !revoked ? `<button class="button" type="button" data-revoke-auth-session="${escapeHtml(item?.id || '')}">Cerrar sesión</button>` : ''}
  </div>`;
}

function renderAcademicContextCard(settings, configured, context, localAcademicYear) {
  const localYear = String(localAcademicYear || '').trim();
  if (!configured) {
    return `<section class="card">
      <div class="card-header"><div><h2>Curso del proyecto y sincronización</h2><small>El curso del proyecto pertenece a la planificación local. La vinculación online es opcional y no lo sustituye.</small></div></div>
      <div class="card-body integration-form">
        <div class="integration-session-summary">
          <div><span>Curso del proyecto</span><strong>${localYear ? escapeHtml(localYear) : 'Sin indicar'}</strong><small>Se edita en Planificación académica y se conserva al exportar el proyecto.</small></div>
          <div><span>Curso online vinculado</span><strong>No conectado</strong><small>Inicia sesión si quieres guardar escenarios compartidos.</small></div>
        </div>
        <div class="integration-note"><strong>Una sola fuente local</strong><span>El modo offline no necesita crear otro curso aquí. El curso escolar del proyecto se configura una sola vez en Planificación académica.</span></div>
      </div>
    </section>`;
  }

  const years = Array.isArray(context.years) ? context.years : [];
  const scenarios = Array.isArray(context.scenarios) ? context.scenarios : [];
  const selectedYearId = years.some(item => item.id === settings.academicYearId) ? settings.academicYearId : '';
  const selectedYear = years.find(item => item.id === selectedYearId) || null;
  const selectedScenarioId = scenarios.some(item => item.id === settings.scenarioId) ? settings.scenarioId : '';
  const remoteLabel = String(selectedYear?.label || '').trim();
  const mismatch = Boolean(localYear && remoteLabel && !academicYearMatches(localYear, remoteLabel));
  const missingLocalYear = Boolean(remoteLabel && !localYear);
  const bindingReady = Boolean(selectedYearId && selectedScenarioId && !mismatch && !missingLocalYear);
  const yearOptions = years.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedYearId ? 'selected' : ''}>${escapeHtml(item.label)}${item.start_date && item.end_date ? ` · ${escapeHtml(item.start_date)}–${escapeHtml(item.end_date)}` : ''}</option>`).join('');
  const scenarioOptions = scenarios.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedScenarioId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(scenarioStatusLabel(item.status))}</option>`).join('');
  const snapshot = context.snapshot;
  const bindingBadge = mismatch || missingLocalYear
    ? '<span class="badge badge-warning">Revisar vinculación</span>'
    : `<span class="badge ${bindingReady ? 'badge-success' : 'badge-neutral'}">${bindingReady ? 'Contexto completo' : 'Pendiente'}</span>`;

  return `<section class="card">
    <div class="card-header"><div><h2>Curso del proyecto y escenario online</h2><small>El proyecto conserva su curso local; aquí eliges únicamente a qué curso y escenario remotos se vincula.</small></div>${bindingBadge}</div>
    <div class="card-body integration-form">
      ${context.error ? `<div class="integration-status is-error"><strong>⚠ No se pudo cargar el contexto académico</strong><span>${escapeHtml(context.error)}</span></div>` : ''}
      <div class="integration-session-summary">
        <div><span>Curso del proyecto</span><strong>${localYear ? escapeHtml(localYear) : 'Sin indicar'}</strong><small>Fuente local · Planificación académica · incluido en el JSON exportado.</small></div>
        <div><span>Curso online vinculado</span><strong>${remoteLabel ? escapeHtml(remoteLabel) : 'Sin vincular'}</strong><small>Referencia remota para escenarios y sincronización; no cambia el curso del proyecto.</small></div>
      </div>
      ${mismatch ? `<div class="integration-issues is-warning"><strong>Los cursos no coinciden</strong><span>El proyecto indica “${escapeHtml(localYear)}” y la vinculación online “${escapeHtml(remoteLabel)}”. Revisa cuál debe usarse antes de compartir el escenario.</span></div>` : ''}
      ${missingLocalYear ? `<div class="integration-issues is-warning"><strong>Falta el curso del proyecto</strong><span>Has vinculado “${escapeHtml(remoteLabel)}” online, pero el proyecto local no tiene curso escolar. Indícalo en Planificación académica para mantener una referencia consistente también offline.</span></div>` : ''}
      <div class="form-grid">
        <div class="form-field">
          <label for="academicYearSelect">Curso online vinculado</label>
          <select id="academicYearSelect" data-academic-year-select>
            <option value="">Sin vinculación online</option>${yearOptions}
          </select>
          <span class="field-hint">Cambiar esta vinculación no modifica el Curso del proyecto. También limpia el escenario seleccionado para evitar mezclar contextos.</span>
        </div>
        <div class="form-field">
          <label for="planningScenarioSelect">Escenario online activo</label>
          <select id="planningScenarioSelect" data-scenario-select ${selectedYearId ? '' : 'disabled'}>
            <option value="">Selecciona un escenario…</option>${scenarioOptions}
          </select>
          <span class="field-hint">Los escenarios permiten compartir o comparar alternativas del mismo proyecto.</span>
        </div>
      </div>

      <div class="form-grid">
        <form id="academicYearForm" class="integration-note">
          <strong>Crear curso online</strong>
          <span>Solo es necesario si GestorEscuela todavía no contiene el curso al que quieres vincular este proyecto.</span>
          <div class="form-grid">
            <div class="form-field"><label for="academicYearLabel">Etiqueta</label><input id="academicYearLabel" name="label" required maxlength="32" value="${escapeHtml(localYear)}" placeholder="2026/27"></div>
            <div class="form-field"><label for="academicYearStart">Inicio</label><input id="academicYearStart" name="startDate" type="date"></div>
            <div class="form-field"><label for="academicYearEnd">Fin</label><input id="academicYearEnd" name="endDate" type="date"></div>
          </div>
          <button class="button" type="submit">+ Crear y vincular curso online</button>
        </form>

        <form id="planningScenarioForm" class="integration-note">
          <strong>Crear escenario online</strong>
          <div class="form-field"><label for="planningScenarioName">Nombre</label><input id="planningScenarioName" name="name" required maxlength="160" placeholder="Planificación inicial" ${selectedYearId ? '' : 'disabled'}></div>
          <button class="button" type="submit" ${selectedYearId ? '' : 'disabled'}>+ Crear escenario</button>
          <span class="field-hint">Los escenarios nuevos empiezan como borrador.</span>
        </form>
      </div>

      ${selectedScenarioId ? `<div class="integration-note">
        <strong>Copia compartida del escenario</strong>
        <span>${snapshot ? `Versión ${Number(snapshot.version) || 1} guardada en PostgreSQL${snapshot.updated_at ? ` · ${escapeHtml(formatTimestamp(snapshot.updated_at))}` : ''}.` : 'Este escenario todavía no tiene una copia del proyecto guardada.'}</span>
        ${context.snapshotError ? `<span class="integration-status is-error">${escapeHtml(context.snapshotError)}</span>` : ''}
        <div class="button-row">
          <button class="button button-primary" type="button" data-save-scenario-snapshot>☁ Guardar copia local en el escenario</button>
          <button class="button" type="button" data-restore-scenario-snapshot ${snapshot ? '' : 'disabled'}>↓ Cargar escenario en este navegador</button>
        </div>
        <span class="field-hint">Guardar no modifica IndexedDB. Cargar sí sustituye los datos locales, pero solo después de una confirmación y de validar el paquete remoto.</span>
      </div>` : ''}
    </div>
  </section>`;
}

function renderAdvancedConnection(settings, status, { hasBearerSession, legacyConfigured }) {
  const legacyFields = legacyConfigured ? `
    <div class="integration-note">
      <strong>Compatibilidad con una instalación anterior</strong>
      <span>Estos identificadores se conservan solo porque este navegador ya tenía una conexión Actor ID. No se ofrecen para altas nuevas.</span>
      <div class="form-grid">
        <div class="form-field"><label for="backendSchoolId">School ID</label><input id="backendSchoolId" name="schoolId" value="${escapeHtml(settings.schoolId)}" placeholder="UUID del centro"></div>
        <div class="form-field"><label for="backendActorId">Actor ID · transición</label><input id="backendActorId" name="actorId" value="${escapeHtml(settings.actorId)}" placeholder="UUID legacy"></div>
      </div>
    </div>` : '';
  const authHint = hasBearerSession
    ? 'El centro activo procede de las membresías de tu sesión y no se puede sustituir manualmente aquí.'
    : legacyConfigured
      ? 'La conexión Actor ID se mantiene temporalmente para facilitar la migración a una cuenta.'
      : 'Para conectar un centro nuevo usa Iniciar sesión o Crear un centro; no necesitas identificadores técnicos.';

  return `<section class="card">
    <details class="integration-advanced" ${legacyConfigured ? 'open' : ''}>
      <summary><span><strong>Conexión avanzada</strong><small>URL del backend y compatibilidad temporal para instalaciones ya existentes.</small></span></summary>
      <div class="card-body integration-form">
        <form id="backendSettingsForm" class="integration-form">
          <label class="integration-toggle"><input name="enabled" type="checkbox" ${settings.enabled ? 'checked' : ''}><span><strong>Activar funciones online</strong><small>El horario local sigue funcionando aunque el servidor no responda.</small></span></label>
          <div class="form-grid">
            <div class="form-field integration-wide"><label for="backendBaseUrl">URL del backend</label><input id="backendBaseUrl" name="baseUrl" type="url" value="${escapeHtml(settings.baseUrl)}" placeholder="https://mi-backend.up.railway.app"><span class="field-hint">${escapeHtml(authHint)}</span></div>
          </div>
          ${legacyFields}
          <div class="button-row">
            <button class="button" type="submit">Guardar configuración avanzada</button>
            <button class="button" type="button" data-test-backend>Probar servidor</button>
          </div>
          ${renderConnectionStatus(status)}
        </form>
      </div>
    </details>
  </section>`;
}

function readSettings(form, current) {
  const data = new FormData(form);
  return normalizeBackendSettings({
    ...current,
    enabled:data.get('enabled') === 'on',
    baseUrl:data.get('baseUrl'),
    schoolId:data.has('schoolId') ? data.get('schoolId') : current.schoolId,
    actorId:data.has('actorId') ? data.get('actorId') : current.actorId
  });
}

function metric(label, value) {
  return `<div class="integration-metric"><span>${escapeHtml(label)}</span><strong>${Number(value) || 0}</strong></div>`;
}

function renderConnectionStatus(status) {
  if (!status) return '<div class="integration-status">Servidor no probado en esta sesión.</div>';
  if (status.kind === 'pending') return `<div class="integration-status"><strong>Probando conexión…</strong><span>${escapeHtml(status.message || '')}</span></div>`;
  const ok = status.kind === 'ok';
  return `<div class="integration-status ${ok ? 'is-ok' : 'is-error'}"><strong>${ok ? '✓ Conexión correcta' : '⚠ No se pudo conectar'}</strong><span>${escapeHtml(status.message || '')}</span></div>`;
}

function renderAuthStatus(status) {
  if (!status) return '';
  if (status.kind === 'pending') return `<div class="integration-status integration-wide"><strong>Conectando…</strong><span>${escapeHtml(status.message || '')}</span></div>`;
  const ok = status.kind === 'ok';
  return `<div class="integration-status integration-wide ${ok ? 'is-ok' : 'is-error'}"><strong>${ok ? '✓ Acceso correcto' : '⚠ No se pudo iniciar sesión'}</strong><span>${escapeHtml(status.message || '')}</span></div>`;
}

function renderIssues(title, items, kind) {
  if (!items?.length) return '';
  return `<div class="integration-issues is-${kind}"><strong>${escapeHtml(title)}</strong>${items.slice(0, 12).map(item => `<span>• ${escapeHtml(item)}</span>`).join('')}${items.length > 12 ? `<span>… y ${items.length - 12} más</span>` : ''}</div>`;
}

function scenarioStatusLabel(value) {
  const labels = { DRAFT:'Borrador', VALIDATED:'Validado', PUBLISHED:'Publicado', ARCHIVED:'Archivado' };
  return labels[String(value || '').toUpperCase()] || String(value || 'Borrador');
}

function formatTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('es-ES');
}

function academicYearMatches(left, right) {
  return String(left || '').trim().toLocaleLowerCase('es') === String(right || '').trim().toLocaleLowerCase('es');
}

function shortId(value) {
  const text = String(value || '');
  return text.length > 12 ? `${text.slice(0, 8)}…${text.slice(-4)}` : text;
}

function readResetToken() {
  try {
    if (typeof location === 'undefined') return '';
    return String(new URLSearchParams(location.search).get('reset_token') || '').trim();
  } catch {
    return '';
  }
}

function removeResetTokenFromUrl() {
  try {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    const url = new URL(location.href);
    url.searchParams.delete('reset_token');
    history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // La contraseña ya se cambió; limpiar la URL es solo una mejora de privacidad visual.
  }
}

function setInlineStatus(node, message, kind = '') {
  if (!node) return;
  node.textContent = String(message || '');
  node.className = `integration-status${kind === 'ok' ? ' is-ok' : kind === 'error' ? ' is-error' : ''}`;
}
