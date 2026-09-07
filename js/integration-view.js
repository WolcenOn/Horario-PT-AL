import { backendConfigured, normalizeBackendSettings } from './backend-service.js';
import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { escapeHtml } from './utils.js';

export function renderIntegrationView(root, { state, settings, status, onSave, onTest, onBootstrap, onSync }) {
  const normalized = normalizeBackendSettings(settings);
  const adapter = buildGestorEscuelaConfiguration(state);
  const configured = backendConfigured(normalized);
  const canSync = configured && adapter.report.ready;

  root.innerHTML = `<div class="integration-view">
    <section class="card integration-hero">
      <div>
        <p class="eyebrow">Integración experimental</p>
        <h2>GestorEscuela</h2>
        <p>La aplicación continúa guardando y trabajando con IndexedDB. El backend es opcional y solo recibe datos cuando tú pulsas “Sincronizar” o solicitas un cálculo en Operativa diaria.</p>
      </div>
      <span class="integration-mode ${normalized.enabled ? 'is-hybrid' : 'is-offline'}">${normalized.enabled ? 'Híbrido' : 'Offline'}</span>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Conexión</h2><small>Estos datos se guardan únicamente en este navegador y no forman parte del JSON de horario.</small></div></div>
      <form id="backendSettingsForm" class="card-body integration-form">
        <label class="integration-toggle"><input name="enabled" type="checkbox" ${normalized.enabled ? 'checked' : ''}><span><strong>Activar funciones online</strong><small>Desactivado por defecto. El horario local sigue funcionando aunque GestorEscuela no responda.</small></span></label>
        <div class="form-grid">
          <div class="form-field integration-wide"><label for="backendBaseUrl">URL del backend</label><input id="backendBaseUrl" name="baseUrl" type="url" value="${escapeHtml(normalized.baseUrl)}" placeholder="https://mi-backend.up.railway.app"></div>
          <div class="form-field"><label for="backendSchoolId">School ID</label><input id="backendSchoolId" name="schoolId" value="${escapeHtml(normalized.schoolId)}" placeholder="UUID del centro"></div>
          <div class="form-field"><label for="backendActorId">Actor ID</label><input id="backendActorId" name="actorId" value="${escapeHtml(normalized.actorId)}" placeholder="UUID del usuario ADMIN"></div>
        </div>
        <div class="button-row">
          <button class="button button-primary" type="submit">Guardar conexión</button>
          <button class="button" type="button" data-test-backend>Probar servidor</button>
        </div>
        ${renderConnectionStatus(status)}
      </form>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Vincular un centro nuevo</h2><small>Úsalo solo si GestorEscuela todavía no tiene centro y administrador creados. El asistente guardará automáticamente los UUID.</small></div></div>
      <form id="backendBootstrapForm" class="card-body integration-form">
        <div class="integration-note"><strong>Bootstrap inicial</strong><span>Se crea un usuario, un centro y la pertenencia ADMIN. No modifica ningún alumno, horario o sesión local.</span></div>
        <div class="form-grid">
          <div class="form-field integration-wide"><label for="bootstrapSchoolName">Nombre del centro</label><input id="bootstrapSchoolName" name="schoolName" maxlength="160" placeholder="CEIP / centro educativo"></div>
          <div class="form-field"><label for="bootstrapDisplayName">Nombre del administrador</label><input id="bootstrapDisplayName" name="displayName" maxlength="160" placeholder="Nombre para GestorEscuela"></div>
          <div class="form-field"><label for="bootstrapEmail">Correo del administrador</label><input id="bootstrapEmail" name="email" type="email" maxlength="320" placeholder="correo@centro.es"></div>
        </div>
        <div class="button-row">
          <button class="button" type="submit">Crear y vincular centro</button>
          <span class="field-hint">Si ya tienes School ID y Actor ID, no necesitas este asistente.</span>
        </div>
      </form>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Adaptador local → GestorEscuela</h2><small>Vista previa de lo que se enviaría. No realiza ninguna escritura remota.</small></div><span class="badge ${adapter.report.ready ? 'badge-success' : 'badge-warning'}">${adapter.report.ready ? 'Preparado' : `${adapter.report.errors.length} error(es)`}</span></div>
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
          <button class="button button-primary" type="button" data-sync-backend ${canSync ? '' : 'disabled'}>Sincronizar configuración académica</button>
          <span class="field-hint">La sincronización sustituye la configuración académica del centro indicado en GestorEscuela; nunca borra los datos IndexedDB de esta aplicación.</span>
        </div>
      </div>
    </section>

    <section class="card integration-roadmap">
      <div class="card-header"><div><h2>Estado de la integración</h2><small>La conexión se activa de forma progresiva y mantiene el modo offline.</small></div></div>
      <div class="card-body integration-roadmap-grid">
        <div class="is-done"><b>1</b><span><strong>Adaptador y conexión opcional</strong><small>Configuración local, bootstrap, prueba de salud y sincronización manual.</small></span></div>
        <div class="is-done"><b>2</b><span><strong>Operativa diaria básica</strong><small>Ausencia de un docente y propuesta de sustituciones usando CP-SAT.</small></span></div>
        <div><b>3</b><span><strong>Actividades y vigilancias</strong><small>Coordinaciones, reuniones y turnos de recreo.</small></span></div>
        <div><b>4</b><span><strong>Sincronización segura</strong><small>Autenticación real y control de cambios entre dispositivos.</small></span></div>
      </div>
    </section>
  </div>`;

  const form = root.querySelector('#backendSettingsForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    await onSave(readSettings(form));
  });
  root.querySelector('[data-test-backend]')?.addEventListener('click', async () => onTest(readSettings(form)));
  root.querySelector('[data-sync-backend]')?.addEventListener('click', async () => onSync(readSettings(form), adapter));

  const bootstrapForm = root.querySelector('#backendBootstrapForm');
  bootstrapForm?.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(bootstrapForm);
    await onBootstrap({
      baseUrl:form?.elements?.baseUrl?.value || normalized.baseUrl,
      schoolName:data.get('schoolName'),
      displayName:data.get('displayName'),
      email:data.get('email')
    });
  });
}

function readSettings(form) {
  const data = new FormData(form);
  return normalizeBackendSettings({
    enabled:data.get('enabled') === 'on',
    baseUrl:data.get('baseUrl'),
    schoolId:data.get('schoolId'),
    actorId:data.get('actorId')
  });
}

function metric(label, value) {
  return `<div class="integration-metric"><span>${escapeHtml(label)}</span><strong>${Number(value) || 0}</strong></div>`;
}

function renderConnectionStatus(status) {
  if (!status) return '<div class="integration-status">Todavía no se ha probado la conexión en esta sesión.</div>';
  if (status.kind === 'pending') return `<div class="integration-status"><strong>Probando conexión…</strong><span>${escapeHtml(status.message || '')}</span></div>`;
  const ok = status.kind === 'ok';
  return `<div class="integration-status ${ok ? 'is-ok' : 'is-error'}"><strong>${ok ? '✓ Conexión correcta' : '⚠ No se pudo conectar'}</strong><span>${escapeHtml(status.message || '')}</span></div>`;
}

function renderIssues(title, items, kind) {
  if (!items?.length) return '';
  return `<div class="integration-issues is-${kind}"><strong>${escapeHtml(title)}</strong>${items.slice(0, 12).map(item => `<span>• ${escapeHtml(item)}</span>`).join('')}${items.length > 12 ? `<span>… y ${items.length - 12} más</span>` : ''}</div>`;
}
