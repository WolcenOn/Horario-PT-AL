import { buildReadinessReport } from './automation-core.js';
import { normalizeCenterPlanningSettings } from './center-planning.js';
import { buildGlobalReadiness } from './global-scheduler.js';
import { configuredClassGroups, courseForClassGroup, recessForStage, schoolStructureConfigured, stageForCourse } from './education.js';
import { TERRITORY_OPTIONS } from './setup-presets.js';
import { escapeHtml } from './utils.js';

export function buildSetupWizardProgress(state) {
  const centerSettings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const global = buildGlobalReadiness(state, centerSettings);
  const automatic = buildReadinessReport(state, state.automationSettings);
  const structureReady = schoolStructureConfigured(state.schoolSettings) && classes.length > 0;
  const curriculumItem = global.items.find(item => item.id === 'curriculum');
  const generationItem = global.items.find(item => item.id === 'generation');
  const modeItem = global.items.find(item => item.id === 'mode');
  const teachersItem = global.items.find(item => item.id === 'teachers');
  const availabilityItem = global.items.find(item => item.id === 'availability');
  const activitiesItem = global.items.find(item => item.id === 'activities');
  const gridItem = global.items.find(item => item.id === 'grid');
  const patternsItem = global.items.find(item => item.id === 'patterns');

  const planReady = Boolean(modeItem?.ok && curriculumItem?.ok && generationItem?.ok);
  const teachersReady = Boolean(planReady && teachersItem?.ok && availabilityItem?.ok);
  const stages = [...new Set(classes.map(group => stageForCourse(courseForClassGroup(state.schoolSettings, group))).filter(Boolean))];
  const missingRecesses = stages.filter(stage => !recessForStage(state.schoolSettings, stage));
  const recessesReady = structureReady && stages.length > 0 && missingRecesses.length === 0;
  const advancedReady = Boolean(activitiesItem?.ok && gridItem?.ok && patternsItem?.ok);
  const globalReady = Boolean(global.ready && recessesReady);
  const ordinarySchedulePresent = (state.classSchedules || []).length > 0;

  const activeSupportGroups = (state.groups || []).filter(group => group.activo !== false);
  const supportStudents = (state.students || []).filter(student => student.activo !== false && ((student.horasPTObjetivoMin || 0) > 0 || (student.horasALObjetivoMin || 0) > 0));
  const supportBaseReady = supportStudents.length > 0 && activeSupportGroups.length > 0;
  const rulesItem = automatic.items.find(item => item.id === 'courseRules');
  const sessionsItem = automatic.items.find(item => item.id === 'sessions');
  const ptalRulesReady = supportBaseReady && Boolean(rulesItem?.ok);
  const ptalAutomaticReady = supportBaseReady && automatic.ready;

  const steps = [
    {
      id:'structure', phase:'essential', number:1, title:'Estructura del centro y clases',
      ok:structureReady, target:'classRosters', actionLabel:structureReady ? 'Revisar clases' : 'Configurar clases',
      description:'Indica cuántas líneas tiene cada curso. Con esto la aplicación conoce las clases que debe organizar.',
      detail:structureReady ? `${classes.length} clase(s) definidas.` : 'Es el primer dato necesario. No hace falta introducir aún ningún horario.'
    },
    {
      id:'plan', phase:'essential', number:2, title:'Jornada y carga curricular',
      ok:planReady, target:'centerPlanning', actionLabel:planReady ? 'Revisar plan' : 'Configurar plan del centro',
      description:'Activa Centro completo, revisa la jornada y define las horas semanales de cada materia por curso.',
      detail:planReady ? `${global.participatingClasses.length} clase(s) entrarán en la generación.` : firstMissingMessage([modeItem, generationItem, curriculumItem])
    },
    {
      id:'teachers', phase:'essential', number:3, title:'Profesorado, asignaturas y disponibilidad',
      ok:teachersReady, target:'professionals', actionLabel:teachersReady ? 'Revisar profesorado' : 'Completar profesorado',
      description:'Asigna quién imparte cada materia y cuándo puede trabajar. No necesitas crear su horario manualmente.',
      detail:teachersReady ? `${global.teacherMap.size} asignación(es) clase/asignatura resueltas.` : firstMissingMessage([teachersItem, availabilityItem], 'Completa primero el paso anterior para poder comprobar las asignaciones.')
    },
    {
      id:'recesses', phase:'essential', number:4, title:'Recreos',
      ok:recessesReady, target:'recesses', actionLabel:recessesReady ? 'Revisar recreos' : 'Configurar recreos',
      description:'Marca las franjas de recreo de Infantil y Primaria para que el generador no coloque docencia encima.',
      detail:recessesReady ? `Recreos configurados para ${stages.map(stageLabel).join(' y ')}.` : structureReady ? `Falta configurar: ${missingRecesses.map(stageLabel).join(', ') || 'las etapas utilizadas'}.` : 'Se comprobará cuando hayas definido las clases.'
    },
    {
      id:'advanced', phase:'essential', number:5, title:'Opcional · restricciones especiales',
      ok:advancedReady, target:advancedTarget(activitiesItem, patternsItem, gridItem), actionLabel:advancedReady ? 'Revisar ajustes' : 'Resolver ajustes',
      description:'Solo necesitas entrar aquí si usas actividades, días obligatorios, duraciones especiales u otras restricciones.',
      detail:advancedReady ? 'No hay ajustes avanzados incompatibles.' : firstMissingMessage([activitiesItem, patternsItem, gridItem])
    },
    {
      id:'generate', phase:'essential', number:6, title:ordinarySchedulePresent ? 'Revisar y recalcular el horario' : 'Generar el horario ordinario',
      ok:globalReady, target:'centerPlanning', actionLabel:globalReady ? (ordinarySchedulePresent ? 'Recalcular horario' : 'Generar primer horario') : 'Ver qué falta',
      description:ordinarySchedulePresent
        ? 'Si detectas que falta algo, corrige solo ese dato y vuelve a calcular. El horario actual se conserva hasta que apliques la nueva propuesta.'
        : 'Cuando los pasos anteriores estén listos, genera una propuesta completa y revísala antes de aplicarla.',
      detail:globalReady ? (ordinarySchedulePresent ? `${state.classSchedules.length} bloque(s) ordinarios cargados. Puedes recalcularlos sin borrar el horario actual.` : 'Todo listo: ya puedes pulsar “Generar propuesta global”.') : `${global.items.filter(item => !item.ok).length + (recessesReady ? 0 : 1)} comprobación(es) pendientes.`
    },
    {
      id:'support', phase:'support', number:7, title:'Necesidades y grupos PT/AL',
      ok:supportBaseReady, target:'groups', actionLabel:supportBaseReady ? 'Revisar grupos PT/AL' : 'Configurar apoyos',
      description:'Añade las necesidades de PT/AL del alumnado y agrúpalas. Esta fase no es necesaria para generar el horario ordinario del centro.',
      detail:supportBaseReady ? `${supportStudents.length} alumno(s) con necesidad y ${activeSupportGroups.length} grupo(s) de apoyo.` : 'Puedes omitir este paso si todavía solo quieres construir el horario ordinario.'
    },
    {
      id:'ptalRules', phase:'support', number:8, title:'Prioridades y horas permitidas PT/AL',
      ok:ptalRulesReady, target:'automation', actionLabel:ptalRulesReady ? 'Revisar prioridades' : 'Configurar prioridades',
      description:'Define de qué materias conviene sacar menos al alumnado y en qué horario puede recibir apoyo. La jornada se copia automáticamente como punto de partida.',
      detail:ptalRulesReady ? rulesItem.detail : supportBaseReady ? (rulesItem?.detail || 'Guarda las reglas de los cursos implicados.') : 'Se activa cuando haya alumnado y grupos PT/AL.'
    },
    {
      id:'ptalAutomatic', phase:'support', number:9, title:'Ajuste automático PT/AL',
      ok:ptalAutomaticReady, target:'automation', actionLabel:ptalAutomaticReady ? 'Optimizar PT/AL' : 'Preparar optimización PT/AL',
      description:'Recoloca los apoyos respetando disponibilidad, recreos, alumnado y prioridades. Es una optimización posterior, no un requisito para crear el horario del centro.',
      detail:ptalAutomaticReady ? 'El optimizador PT/AL está preparado.' : supportBaseReady && !sessionsItem?.ok ? 'Por ahora este optimizador usa las sesiones existentes para conocer frecuencia y duración. Este requisito se sustituirá por una distribución de apoyo más sencilla.' : (sessionsItem?.detail || 'Completa antes los datos de apoyo.')
    }
  ];

  const progressSteps = steps.filter(step => ['structure','plan','teachers','recesses'].includes(step.id));
  const essentialCompleted = progressSteps.filter(step => step.ok).length;
  const nextEssential = steps.filter(step => step.phase === 'essential' && step.id !== 'generate').find(step => !step.ok) || steps.find(step => step.id === 'generate');

  return {
    steps,
    essentialCompleted,
    essentialTotal:progressSteps.length,
    globalReady,
    ordinarySchedulePresent,
    nextEssential,
    supportConfigured:supportBaseReady,
    ptalAutomaticReady,
    structureReady
  };
}

export function renderSetupWizard(root, { state, onNavigate, onEditRecesses, onApplyQuickStart }) {
  const progress = buildSetupWizardProgress(state);
  const essential = progress.steps.filter(step => step.phase === 'essential');
  const support = progress.steps.filter(step => step.phase === 'support');
  const percent = Math.round((progress.essentialCompleted / progress.essentialTotal) * 100);
  const selectedTerritory = TERRITORY_OPTIONS.includes(state.centerPlanningSettings?.territory) ? state.centerPlanningSettings.territory : '';
  const currentLines = state.schoolSettings?.structure?.defaultLines || 1;

  root.innerHTML = `<div class="setup-wizard-view">
    <section class="card setup-wizard-hero">
      <div class="setup-wizard-hero-copy">
        <p class="eyebrow">Asistente de puesta en marcha</p>
        <h2>Configura, calcula y corrige sin empezar de nuevo</h2>
        <p>Empieza por lo imprescindible y deja los ajustes finos para después. <strong>No necesitas cargar horarios ordinarios ni sesiones PT/AL para generar el primer horario completo.</strong></p>
        <div class="setup-wizard-progress" aria-label="Progreso de configuración esencial">
          <div><span>Configuración esencial</span><strong>${progress.essentialCompleted}/${progress.essentialTotal}</strong></div>
          <progress max="100" value="${percent}">${percent}%</progress>
        </div>
        <div class="button-row">
          <button class="button button-primary" type="button" data-wizard-go="${escapeHtml(progress.nextEssential.target)}">${escapeHtml(progress.globalReady ? (progress.ordinarySchedulePresent ? 'Revisar / recalcular horario' : 'Ir a generar horario') : `Continuar: ${progress.nextEssential.title}`)}</button>
          <button class="button" type="button" data-wizard-go="automation">Ir a ajustes PT/AL</button>
        </div>
      </div>
      <div class="setup-wizard-result ${progress.globalReady ? 'is-ready' : ''}">
        <span>${progress.globalReady ? '✓' : '→'}</span>
        <strong>${progress.globalReady ? (progress.ordinarySchedulePresent ? 'Puedes recalcular cuando quieras' : 'Ya puedes calcular') : 'Sigue el siguiente paso'}</strong>
        <small>${progress.globalReady ? (progress.ordinarySchedulePresent ? 'Cambia solo lo necesario y genera otra propuesta. El horario actual no se borra automáticamente.' : 'El generador global tiene los datos básicos necesarios.') : 'El asistente te llevará siempre al primer requisito pendiente.'}</small>
      </div>
    </section>

    <section class="setup-wizard-intro-grid">
      <article class="card"><strong>1 · Lo imprescindible</strong><span>Clases, jornada, currículo, profesorado y recreos.</span></article>
      <article class="card"><strong>2 · Calcular y revisar</strong><span>La aplicación propone un horario y tú decides si aplicarlo.</span></article>
      <article class="card"><strong>3 · Corregir y recalcular</strong><span>Si falta algo, modifica solo ese dato y vuelve a calcular.</span></article>
    </section>

    <form class="card setup-quick-start" data-quick-start-form>
      <div class="setup-quick-start-copy">
        <p class="eyebrow">Configuración inicial rápida</p>
        <h2>Comunidad y líneas del colegio</h2>
        <p>Genera una base editable: guarda el territorio, activa la planificación de centro completo y, si todavía no has configurado clases, crea Infantil y Primaria con el número general de líneas indicado.</p>
        <small>La jornada, el currículo, los recreos y la referencia normativa quedan marcados para revisión. No se presentan como datos legales de la comunidad hasta disponer de un pack territorial versionado y verificado.</small>
      </div>
      <div class="setup-quick-start-fields">
        <label><span>Comunidad / territorio</span><select name="territory" required><option value="">Seleccionar…</option>${TERRITORY_OPTIONS.map(option => `<option value="${escapeHtml(option)}" ${option === selectedTerritory ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>
        <label><span>Líneas generales</span><select name="defaultLines" ${progress.structureReady ? 'disabled' : ''}>${[1,2,3,4,5,6].map(value => `<option value="${value}" ${value === currentLines ? 'selected' : ''}>${value} ${value === 1 ? 'línea' : 'líneas'}</option>`).join('')}</select></label>
        <button class="button button-primary" type="submit">${progress.structureReady ? 'Guardar comunidad' : 'Crear base editable'}</button>
      </div>
      ${progress.structureReady ? '<div class="setup-quick-start-existing">✓ La estructura de clases ya existe: esta acción no modificará desdobles ni líneas configuradas.</div>' : ''}
    </form>

    ${progress.ordinarySchedulePresent ? renderRecalculationCard(state) : ''}

    ${renderPhase('Configuración esencial', 'Completa esta parte para construir un horario del centro desde cero.', essential)}
    ${renderPhase('Apoyos PT/AL', 'Esta segunda fase mejora y coordina los apoyos. No bloquea la creación del horario ordinario.', support)}

    <section class="card setup-wizard-note">
      <div><strong>¿Ya tienes parte del centro configurada?</strong><span>No hace falta empezar de nuevo. El asistente detecta lo que ya existe y marca automáticamente cada paso como completado.</span></div>
    </section>
  </div>`;

  root.querySelectorAll('[data-wizard-go]').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.wizardGo;
    if (target === 'recesses') onEditRecesses();
    else onNavigate(target);
  }));

  root.querySelector('[data-quick-start-form]')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const territory = form.elements.territory.value;
    const defaultLines = progress.structureReady ? currentLines : Number(form.elements.defaultLines.value);
    await onApplyQuickStart?.({ territory, defaultLines });
  });
}

function renderRecalculationCard(state) {
  const blocks = (state.classSchedules || []).length;
  return `<section class="card setup-recalculation-card" data-wizard-recalculation>
    <div class="setup-recalculation-copy">
      <p class="eyebrow">Ciclo de revisión</p>
      <h2>¿Has visto algo que falta o quieres cambiar?</h2>
      <p>No borres el horario. Corrige únicamente el dato necesario y vuelve a calcular. <strong>La propuesta nueva no sustituye los ${blocks} bloques actuales hasta que pulses “Aplicar propuesta”.</strong></p>
    </div>
    <div class="setup-recalculation-actions">
      <button class="button" type="button" data-wizard-go="centerPlanning">Jornada / currículo</button>
      <button class="button" type="button" data-wizard-go="professionals">Profesorado</button>
      <button class="button" type="button" data-wizard-go="temporalPatterns">Restricciones</button>
      <button class="button button-primary" type="button" data-wizard-go="centerPlanning">⚙ Recalcular horario</button>
    </div>
    <div class="setup-recalculation-flow" aria-label="Flujo para recalcular">
      <span>1 · Corrige</span><b>→</b><span>2 · Recalcula</span><b>→</b><span>3 · Revisa</span><b>→</b><span>4 · Aplica si mejora</span>
    </div>
  </section>`;
}

function renderPhase(title, subtitle, steps) {
  return `<section class="card setup-wizard-phase">
    <div class="card-header"><div><h2>${escapeHtml(title)}</h2><small>${escapeHtml(subtitle)}</small></div></div>
    <div class="setup-wizard-step-list">${steps.map(renderStep).join('')}</div>
  </section>`;
}

function renderStep(step) {
  return `<article class="setup-wizard-step ${step.ok ? 'is-complete' : 'is-pending'}" data-wizard-step="${escapeHtml(step.id)}">
    <div class="setup-wizard-step-number">${step.ok ? '✓' : step.number}</div>
    <div class="setup-wizard-step-copy">
      <div class="setup-wizard-step-title"><strong>${escapeHtml(step.title)}</strong><span class="badge ${step.ok ? 'badge-success' : 'badge-warning'}">${step.ok ? 'Listo' : 'Pendiente'}</span></div>
      <p>${escapeHtml(step.description)}</p>
      <small>${escapeHtml(step.detail || '')}</small>
    </div>
    <button class="button" type="button" data-wizard-go="${escapeHtml(step.target)}">${escapeHtml(step.actionLabel)}</button>
  </article>`;
}

function firstMissingMessage(items, fallback = 'Completa este paso para continuar.') {
  const missing = items.find(item => item && !item.ok);
  return missing?.message || missing?.detail || fallback;
}

function advancedTarget(activitiesItem, patternsItem, gridItem) {
  if (activitiesItem && !activitiesItem.ok) return 'centerActivities';
  if (patternsItem && !patternsItem.ok) return 'temporalPatterns';
  if (gridItem && !gridItem.ok) return 'centerPlanning';
  return 'temporalPatterns';
}

function stageLabel(stage) {
  return stage === 'infantil' ? 'Infantil' : stage === 'primaria' ? 'Primaria' : stage;
}
