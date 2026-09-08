import { backendConfigured, normalizeBackendSettings } from './backend-service.js';
import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { escapeHtml } from './utils.js';

export function renderIntegrationView(root, {
  state,
  settings,
  status,
  academicContext,
  onSave,
  onTest,
  onBootstrap,
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

  root.innerHTML = `<div class="integration-view">
    <section class="card integration-hero">
      <div>
        <p class="eyebrow">Integración experimental</p>
        <h2>GestorEscuela</h2>
        <p>La aplicación continúa guardando y trabajando con IndexedDB. El backend es opcional y los cambios remotos requieren acciones explícitas.</p>
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

    ${renderAcademicContextCard(normalized, configured, context)}

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
      <div class="card-header"><div><h2>Adaptador local → GestorEscuela</h2><small>Vista previa de la configuración operativa que usa el solver de sustituciones.</small></div><span class="badge ${adapter.report.ready ? 'badge-success' : 'badge-warning'}">${adapter.report.ready ? 'Preparado' : `${adapter.report.errors.length} error(es)`}</span></div>
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
          <span class="field-hint">Esta sincronización operativa sigue siendo de centro completo. La copia del escenario, en cambio, conserva el proyecto completo y está separada por curso y escenario.</span>
        </div>
      </div>
    </section>

    <section class="card integration-roadmap">
      <div class="card-header"><div><h2>Estado de la integración</h2><small>La conexión se activa de forma progresiva y mantiene el modo offline.</small></div></div>
      <div class="card-body integration-roadmap-grid">
        <div class="is-done"><b>1</b><span><strong>Adaptador y conexión opcional</strong><small>Configuración local, bootstrap, prueba de salud y sincronización manual.</small></span></div>
        <div class="is-done"><b>2</b><span><strong>Operativa diaria básica</strong><small>Ausencia de un docente y propuesta de sustituciones usando CP-SAT.</small></span></div>
        <div class="is-done"><b>3</b><span><strong>Curso, escenario y copia compartida</strong><small>El proyecto completo puede persistirse por escenario sin eliminar el modo offline.</small></span></div>
        <div><b>4</b><span><strong>Concurrencia y sincronización segura</strong><small>Versionado esperado, detección de conflictos y autorización fina.</small></span></div>
      </div>
    </section>
  </div>`;

  const form = root.querySelector('#backendSettingsForm');
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    await onSave(readSettings(form, normalized));
  });
  root.querySelector('[data-test-backend]')?.addEventListener('click', async () => onTest(readSettings(form, normalized)));
  root.querySelector('[data-sync-backend]')?.addEventListener('click', async () => onSync(readSettings(form, normalized), adapter));
  root.querySelector('[data-save-scenario-snapshot]')?.addEventListener('click', async () => onSaveScenarioSnapshot());
  root.querySelector('[data-restore-scenario-snapshot]')?.addEventListener('click', async () => onRestoreScenarioSnapshot(context.snapshot));

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

function renderAcademicContextCard(settings, configured, context) {
  if (!configured) {
    return `<section class="card">
      <div class="card-header"><div><h2>Curso académico y escenario</h2><small>Permitirá separar cada curso y preparar varias alternativas de planificación.</small></div></div>
      <div class="card-body"><div class="integration-note"><strong>Conexión necesaria</strong><span>Activa y guarda primero la conexión con GestorEscuela. El modo offline no necesita curso remoto ni escenario.</span></div></div>
    </section>`;
  }

  const years = Array.isArray(context.years) ? context.years : [];
  const scenarios = Array.isArray(context.scenarios) ? context.scenarios : [];
  const selectedYearId = years.some(item => item.id === settings.academicYearId) ? settings.academicYearId : '';
  const selectedScenarioId = scenarios.some(item => item.id === settings.scenarioId) ? settings.scenarioId : '';
  const yearOptions = years.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedYearId ? 'selected' : ''}>${escapeHtml(item.label)}${item.start_date && item.end_date ? ` · ${escapeHtml(item.start_date)}–${escapeHtml(item.end_date)}` : ''}</option>`).join('');
  const scenarioOptions = scenarios.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === selectedScenarioId ? 'selected' : ''}>${escapeHtml(item.name)} · ${escapeHtml(scenarioStatusLabel(item.status))}</option>`).join('');
  const snapshot = context.snapshot;

  return `<section class="card">
    <div class="card-header"><div><h2>Curso académico y escenario</h2><small>El escenario puede guardar una copia completa y versionada del proyecto para compartirla entre dispositivos.</small></div><span class="badge ${selectedYearId && selectedScenarioId ? 'badge-success' : 'badge-neutral'}">${selectedYearId && selectedScenarioId ? 'Contexto completo' : 'Pendiente'}</span></div>
    <div class="card-body integration-form">
      ${context.error ? `<div class="integration-status is-error"><strong>⚠ No se pudo cargar el contexto académico</strong><span>${escapeHtml(context.error)}</span></div>` : ''}
      <div class="form-grid">
        <div class="form-field">
          <label for="academicYearSelect">Curso académico activo</label>
          <select id="academicYearSelect" data-academic-year-select>
            <option value="">Selecciona un curso…</option>${yearOptions}
          </select>
          <span class="field-hint">Cambiar de curso limpia el escenario seleccionado para evitar mezclar contextos.</span>
        </div>
        <div class="form-field">
          <label for="planningScenarioSelect">Escenario activo</label>
          <select id="planningScenarioSelect" data-scenario-select ${selectedYearId ? '' : 'disabled'}>
            <option value="">Selecciona un escenario…</option>${scenarioOptions}
          </select>
          <span class="field-hint">Los escenarios permiten comparar alternativas antes de publicar un horario.</span>
        </div>
      </div>

      <div class="form-grid">
        <form id="academicYearForm" class="integration-note">
          <strong>Crear curso académico</strong>
          <div class="form-grid">
            <div class="form-field"><label for="academicYearLabel">Etiqueta</label><input id="academicYearLabel" name="label" required maxlength="32" placeholder="2026/27"></div>
            <div class="form-field"><label for="academicYearStart">Inicio</label><input id="academicYearStart" name="startDate" type="date"></div>
            <div class="form-field"><label for="academicYearEnd">Fin</label><input id="academicYearEnd" name="endDate" type="date"></div>
          </div>
          <button class="button" type="submit">+ Crear curso</button>
        </form>

        <form id="planningScenarioForm" class="integration-note">
          <strong>Crear escenario</strong>
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

function readSettings(form, current) {
  const data = new FormData(form);
  return normalizeBackendSettings({
    ...current,
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

function scenarioStatusLabel(value) {
  const labels = { DRAFT:'Borrador', VALIDATED:'Validado', PUBLISHED:'Publicado', ARCHIVED:'Archivado' };
  return labels[String(value || '').toUpperCase()] || String(value || 'Borrador');
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('es-ES');
}
