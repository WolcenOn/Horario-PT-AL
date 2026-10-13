import { COURSE_OPTIONS, configuredClassGroups, schoolStructureConfigured } from './education.js';
import { curriculumCoverage, curriculumForCourse, curriculumSubjectsForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile, PLANNING_MODES, RESPONSIBILITY_TYPES } from './center-planning.js';
import { buildGlobalReadiness } from './global-scheduler.js';
import { correctionForMessage } from './preview-diagnostics.js';
import { saveCenterPlanningSettings } from './repository.js';
import { applyCurriculumProfile, parseCurriculumProfile } from './curriculum-profile-import.js';
import { listCurriculumRegulations,loadCurriculumRegulation,regulationKey } from './curriculum-regulations.js';
import {
  formatRoomResources, parseRoomResources, parseTravelRules, ROOM_FEATURES
} from './weekly-location-rules.js';
import { escapeHtml, formatDuration } from './utils.js';

export function renderCenterPlanning(root, { state, centerPlanningSettings, globalProposal, onSave, onNavigate, onGenerateGlobal, onApplyGlobal, onDiscardGlobal }) {
  const settings = normalizeCenterPlanningSettings(centerPlanningSettings);
  const structureReady = schoolStructureConfigured(state.schoolSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const coverage = curriculumCoverage(state, settings);
  const curriculumCourses = COURSE_OPTIONS;
  const readiness = buildGlobalReadiness(state, settings);

  root.innerHTML = `<form id="centerPlanningForm" class="center-planning-view">
    <section class="card center-mode-card">
      <div class="card-header">
        <div><h2>Alcance de la planificación</h2><small>El modo global amplía la aplicación sin desactivar el funcionamiento PT/AL.</small></div>
        <span class="badge ${settings.mode === 'global' ? 'badge-success' : 'badge-neutral'}">${settings.mode === 'global' ? 'Centro completo' : 'Solo PT / AL'}</span>
      </div>
      <div class="card-body center-mode-grid">
        ${PLANNING_MODES.map(option => `<label class="center-mode-option ${settings.mode === option.value ? 'is-selected' : ''}">
          <input type="radio" name="mode" value="${option.value}" ${settings.mode === option.value ? 'checked' : ''}>
          <span><strong>${escapeHtml(option.label)}</strong><small>${option.value === 'ptal' ? 'Mantiene el flujo actual de apoyos PT y AL.' : 'Añade profesorado ordinario, currículo, cobertura y generación del horario completo.'}</small></span>
        </label>`).join('')}
      </div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Perfil curricular del centro</h2><small>No contiene cifras legales predeterminadas: introduce o importa el perfil oficial que corresponda a tu normativa.</small></div></div>
      <div class="card-body form-grid">
        <div class="form-field"><label for="profileName">Nombre del perfil</label><input id="profileName" name="profileName" value="${escapeHtml(settings.profileName)}" placeholder="Ej.: Currículo Primaria 2026/27"></div>
        <div class="form-field"><label for="territory">Territorio / administración</label><input id="territory" name="territory" value="${escapeHtml(settings.territory)}" placeholder="Comunidad autónoma / administración"></div>
        <div class="form-field"><label for="academicYear">Curso escolar</label><input id="academicYear" name="academicYear" value="${escapeHtml(settings.academicYear)}" placeholder="2026/27"></div>
        <div class="form-field"><label for="legalReference">Referencia normativa</label><input id="legalReference" name="legalReference" value="${escapeHtml(settings.legalReference)}" placeholder="Orden / decreto / resolución"></div>
        <div class="form-field full">
          <strong>Carga normativa de horas</strong>
          <p class="field-hint">Elegir una comunidad o escribir una norma no introduce horas automáticamente: el proyecto no incluye todavía tablas legales verificadas para todos los territorios. Puedes importar un perfil contrastado con el anexo horario oficial y aplicarlo aquí. Las cifras se expresan en horas semanales, con cuartos de hora, y se convierten a minutos exactos.</p>
          <details data-curriculum-import>
            <summary>Importar y aplicar carga curricular de una norma</summary>
            <div class="form-field">
              <label for="curriculumCatalogSelect">Catálogo de normativa versionada</label>
              <select id="curriculumCatalogSelect"><option value="">Consultar las versiones disponibles…</option></select>
              <button type="button" class="button" data-prepare-regulation>Preparar versión para revisión</button>
              <small class="field-hint" data-regulation-catalog-status>Solo perfiles contrastados; ningún cambio se aplica automáticamente.</small>
            </div>
            <div class="form-field">
              <label for="curriculumProfileFile">Seleccionar archivo JSON (opcional)</label>
              <input id="curriculumProfileFile" type="file" accept=".json,application/json">
            </div>
            <div class="form-field">
              <label for="curriculumProfileJson">Perfil JSON: territorio, norma, cursos y horas</label>
              <textarea id="curriculumProfileJson" rows="7" spellcheck="false" placeholder='{"territory":"Andalucía","legalReference":"Indica aquí la norma y anexo consultados","weeklyHours":{"1º":{"Matemáticas":1}}}'></textarea>
              <small class="field-hint">El ejemplo solo muestra el formato; no son horas oficiales. Admite profileName, academicYear y sourceUrl (HTTPS); los perfiles versionados añaden profileId, version y effectiveFrom. Solo se guarda localmente tras pulsar «Aplicar».</small>
            </div>
            <div class="button-row">
              <button type="button" class="button button-primary" data-apply-curriculum-profile>Validar y aplicar perfil</button>
            </div>
            <p data-curriculum-import-error role="alert" aria-live="polite"></p>
          </details>
          ${settings.curriculumSource?.kind==='imported'? `<small class="field-hint">Perfil importado: ${escapeHtml(settings.curriculumSource.territory)} · ${escapeHtml(settings.curriculumSource.legalReference)}${settings.curriculumSource.version ? " · v"+escapeHtml(settings.curriculumSource.version) : ""}${settings.curriculumSource.modified ? " · PERSONALIZADO" : ""}. Puedes editar las horas manualmente; la normativa debe verificarse con su texto oficial.</small>` : ''}
        </div>
      </div>
    </section>

    ${settings.mode === 'global' ? `<section class="card global-generation-settings">
      <div class="card-header"><div><h2>Parámetros de generación global</h2><small>Define la rejilla sobre la que se construirá una propuesta completa de horarios de aula.</small></div></div>
      <div class="card-body form-grid">
        <div class="form-field"><label for="globalStart">Inicio de jornada</label><input id="globalStart" name="globalStart" type="time" value="${escapeHtml(settings.generation.start)}"></div>
        <div class="form-field"><label for="globalEnd">Fin de jornada</label><input id="globalEnd" name="globalEnd" type="time" value="${escapeHtml(settings.generation.end)}"></div>
        <div class="form-field"><label for="lessonMinutes">Duración habitual de tramo</label><select id="lessonMinutes" name="lessonMinutes">${[30,45,60,75,90].map(value => `<option value="${value}" ${settings.generation.lessonMinutes === value ? 'selected' : ''}>${value} minutos</option>`).join('')}</select><span class="field-hint">Las materias pueden sobrescribir esta duración desde Patrones temporales. Si queda un resto menor, el último bloque conserva ese resto en múltiplos de 15 min.</span></div>
        <div class="form-field"><label for="maxSameSubjectPerDay">Máximo de la misma materia al día</label><select id="maxSameSubjectPerDay" name="maxSameSubjectPerDay">${[1,2,3,4].map(value => `<option value="${value}" ${settings.generation.maxSameSubjectPerDay === value ? 'selected' : ''}>${value}</option>`).join('')}</select><span class="field-hint">También puede personalizarse por materia desde Patrones temporales.</span></div>
        <div class="form-field"><label for="travelMinutes">Tiempo entre ubicaciones (vista previa GestorEscuela)</label><select id="travelMinutes" name="travelMinutes">${[0,15,30,45,60].map(value => `<option value="${value}" ${settings.generation.travelMinutes === value ? 'selected' : ''}>${value === 0 ? 'Sin desplazamiento obligatorio' : `${value} minutos`}</option>`).join('')}</select><span class="field-hint">Se aplica cuando un especialista pasa entre ubicaciones distintas conocidas. No se deducen distancias.</span></div>
        <div class="form-field"><label for="supportRoomId">Sala PT/AL compartida (opcional)</label><input id="supportRoomId" name="supportRoomId" maxlength="64" value="${escapeHtml(settings.generation.supportRoomId)}" placeholder="Ej.: Sala de apoyos 1"><span class="field-hint">Si se indica, PT y AL deben respetar la ocupación exclusiva de esta misma sala en la vista previa del motor.</span></div>
        <div class="form-field full"><label><input type="checkbox" name="autoAssignSupportRooms" ${settings.generation.autoAssignSupportRooms?'checked':''}> Permitir que GestorEscuela elija automáticamente una sala para los apoyos sin aula obligatoria</label><small class="field-hint">Usa únicamente las salas cuyo aforo y disponibilidad hayas configurado; respeta cualquier sala asignada al grupo o al profesional. No cambia sesiones existentes.</small></div>
        <div class="form-field full"><label for="roomResources">Salas: aforo, horarios y equipamiento (opcional)</label><textarea id="roomResources" name="roomResources" rows="5" spellcheck="false" placeholder="Sala PT | 1 | mesa_regulable&#10;Sala AL | 4 | lunes | 09:00 | 12:00 | aislamiento_acustico,material_logopedico">${escapeHtml(formatRoomResources(settings.generation.roomResources))}</textarea><span class="field-hint">Sala | aforo [| característica1,característica2], o sala | aforo | día | inicio | fin [| características]. Usa los códigos de las opciones que aparecen debajo. Sin características no se presupone ningún equipo. Las salas no configuradas conservan uso exclusivo.</span></div>
        <div class="form-field full"><strong>Equipamiento exigido para apoyos PT</strong><div class="form-grid">${ROOM_FEATURES.map(item=>`<label><input type="checkbox" name="requiredFeaturePT" value="${item.value}" ${settings.generation.supportRoomRequirements.PT.includes(item.value)?'checked':''}> ${escapeHtml(item.label)}</label>`).join('')}</div><small class="field-hint">Se exige a todos los apoyos PT propuestos; no se extrae del perfil del alumnado.</small></div>
        <div class="form-field full"><strong>Equipamiento exigido para apoyos AL</strong><div class="form-grid">${ROOM_FEATURES.map(item=>`<label><input type="checkbox" name="requiredFeatureAL" value="${item.value}" ${settings.generation.supportRoomRequirements.AL.includes(item.value)?'checked':''}> ${escapeHtml(item.label)}</label>`).join('')}</div><small class="field-hint">Se exige a todos los apoyos AL propuestos; no se envían necesidades individuales.</small></div>
        <div class="form-field full"><label for="travelRules">Trayectos personalizados (opcionales)</label><textarea id="travelRules" name="travelRules" rows="4" spellcheck="false" placeholder="class:1ºA | room:Sala PT | 15&#10;room:Sala PT | class:1ºA | 30">${escapeHtml((settings.generation.travelRules||[]).map(rule=>`${rule.fromLocationId} | ${rule.toLocationId} | ${rule.minutes}`).join('\n'))}</textarea><span class="field-hint">Una ruta por línea: ubicación origen | ubicación destino | minutos (0, 15, 30, 45 o 60). La ruta inversa puede tener otro tiempo. Sin ruta concreta se usa el tiempo general.</span></div>
      </div>
    </section>` : ''}

    ${!structureReady ? `<section class="card warning-box center-planning-warning"><strong>Falta la estructura del colegio.</strong><span>Configura primero las líneas y clases para poder medir la cobertura real del currículo.</span><button class="button" type="button" data-go="classSchedules">Configurar clases</button></section>` : ''}

    <section class="card">
      <div class="card-header"><div><h2>Carga semanal por curso y asignatura</h2><small>Introduce horas semanales objetivo. Los patrones de distribución se configuran después en “Patrones temporales”.</small></div><span class="badge badge-neutral">${curriculumCourses.length} cursos</span></div>
      <div class="curriculum-course-list">
        ${curriculumCourses.map(course => renderCourseCurriculum(course, settings)).join('')}
      </div>
      <div class="button-row" style="padding:0 16px 16px"><button class="button" type="button" data-go="temporalPatterns">🧭 Configurar patrones temporales</button><button class="button" type="button" data-go="centerActivities">🧩 Actividades del centro</button></div>
    </section>

    <section class="card">
      <div class="card-header"><div><h2>Profesorado y funciones</h2><small>Resumen de tutorías, asignaturas y responsabilidades configuradas en cada profesional.</small></div><button class="button" type="button" data-go="professionals">Gestionar profesorado</button></div>
      <div class="teacher-profile-grid">
        ${(state.professionals || []).map(professional => renderTeacherSummary(professional)).join('') || `<div class="empty-state"><strong>No hay profesorado</strong>Utiliza “Gestionar profesorado” para añadirlo.</div>`}
      </div>
    </section>

    ${settings.mode === 'global' ? `<section class="card">
      <div class="card-header"><div><h2>Cobertura curricular</h2><small>Compara el tiempo semanal cargado en los horarios de aula con el objetivo del perfil curricular.</small></div><span class="badge badge-neutral">${classes.length} clases</span></div>
      <div class="curriculum-coverage-grid">
        ${coverage.length ? coverage.map(renderCoverageCard).join('') : `<div class="empty-state"><strong>Sin clases configuradas</strong>Configura la estructura y los horarios de aula para ver la cobertura.</div>`}
      </div>
    </section>

    <section class="card global-proposal-card">
      <div class="card-header">
        <div><h2>Propuesta automática global</h2><small>Construye conjuntamente docencia ordinaria y actividades del centro usando currículo, participantes, patrones temporales, jornada, recreos, centros externos y reglas PT/AL.</small></div>
        <span class="badge ${readiness.ready ? 'badge-success' : 'badge-warning'}">${readiness.ready ? 'Preparado' : `${readiness.items.filter(item => !item.ok).length} pendiente(s)`}</span>
      </div>
      <div class="global-readiness-list">${readiness.items.map(renderReadinessItem).join('')}</div>
      <div class="global-generator-note"><strong>Qué coloca ahora</strong><span>Además de las materias, el generador coloca Biblioteca, Lectura, coordinaciones y demás actividades activas. Si una actividad tiene varios docentes asignados, reserva una única franja común para todos. Si está asociada a clases, también evita solaparla con su docencia.</span></div>
      <div class="button-row global-generator-actions">
        <button class="button button-primary" type="button" data-generate-global ${readiness.ready ? '' : 'disabled'}>⚙ Generar propuesta global</button>
        <button class="button" type="button" data-go="temporalPatterns">Patrones temporales</button>
        <button class="button" type="button" data-go="professionals">Revisar profesorado</button>
        <button class="button" type="button" data-go="classSchedules">Ver horario actual</button>
      </div>
      ${renderGlobalProposal(globalProposal)}
    </section>` : ''}

    <div class="center-planning-actions"><button class="button button-primary" type="submit">Guardar configuración global</button></div>
  </form>`;

  let publishedProfiles=[];
  const catalogSelect=root.querySelector('#curriculumCatalogSelect');
  const catalogStatus=root.querySelector('[data-regulation-catalog-status]');
  const updateCatalogOptions=()=>{
    const territory=root.querySelector('#territory').value.trim();
    const matching=publishedProfiles.filter(item=>!territory||item.territory===territory);
    catalogSelect.innerHTML='<option value="">Seleccionar versión…</option>'+
      matching.map(item=>'<option value="'+escapeHtml(regulationKey(item))+'">'+
        escapeHtml(item.territory)+' · '+escapeHtml(item.legalReference)+
        ' · v'+escapeHtml(item.version)+'</option>').join('');
    catalogStatus.textContent=matching.length
      ?String(matching.length)+' versión(es) disponibles. Se cargarán para revisión sin guardarlas.'
      :'No hay perfiles normativos verificados para esta comunidad. Puedes importar tu JSON.';
  };
  root.querySelector('[data-curriculum-import]')?.addEventListener('toggle',async event=>{
    if(!event.currentTarget.open)return;
    try{
      publishedProfiles=await listCurriculumRegulations();
      if(event.currentTarget.isConnected)updateCatalogOptions();
    }catch(error){
      catalogStatus.textContent=error.message||'No se ha podido leer el catálogo local.';
    }
  });
  root.querySelector('#territory')?.addEventListener('input',()=>{
    if(publishedProfiles.length)updateCatalogOptions();
  });
  root.querySelector('[data-prepare-regulation]')?.addEventListener('click',async()=>{
    const error=root.querySelector('[data-curriculum-import-error]');
    error.textContent='';
    const selected=publishedProfiles.find(item=>regulationKey(item)===catalogSelect.value);
    if(!selected){
      error.textContent='Selecciona primero una versión de la comunidad.';
      return;
    }
    try{
      const {raw,profile}=await loadCurriculumRegulation(selected);
      const territory=root.querySelector('#territory').value.trim();
      if(territory&&profile.territory!==territory)
        throw new Error('La comunidad del perfil no coincide con la del centro.');
      root.querySelector('#curriculumProfileJson').value=raw;
      catalogStatus.textContent='Versión '+profile.version+
        ' preparada. Revisa las horas y la fuente; pulsa «Validar y aplicar perfil» para guardarla.';
    }catch(cause){error.textContent=cause.message||'No se pudo cargar esta versión.';}
  });
  root.querySelector('#curriculumProfileFile')?.addEventListener('change', async event => {
    const file=event.currentTarget.files?.[0];
    if(!file)return;
    const target=root.querySelector('#curriculumProfileJson');
    const error=root.querySelector('[data-curriculum-import-error]');
    if(file.size>60000){
      error.textContent='El archivo supera el límite de 60 KB.';
      return;
    }
    try { target.value=await file.text(); error.textContent=''; }
    catch { error.textContent='No se ha podido leer el archivo seleccionado.'; }
  });
  root.querySelector('[data-apply-curriculum-profile]')?.addEventListener('click',async()=>{
    const form=root.querySelector('#centerPlanningForm');
    const error=root.querySelector('[data-curriculum-import-error]');
    error.textContent='';
    try{
      const current=readSettings(form,settings);
      const profile=parseCurriculumProfile(
        root.querySelector('#curriculumProfileJson').value,current.territory
      );
      const existingCount=Object.values(current.curriculum).reduce(
        (total,subjects)=>total+Object.keys(subjects).length,0
      );
      const message=`Se aplicarán ${profile.subjectCount} cargas de ${profile.courseCount} cursos de ${profile.territory}. ${existingCount?'Se sustituirá toda la carga curricular existente; ':' '}Los horarios de aula y sesiones PT/AL no cambiarán. Verifica la norma y sus cifras. ¿Continuar?`;
      if(!window.confirm(message))return;
      await onSave(normalizeCenterPlanningSettings(applyCurriculumProfile(current,profile)));
    }catch(cause){error.textContent=cause.message||'No se ha podido aplicar el perfil.';}
  });
  root.querySelectorAll('input[name="mode"]').forEach(input => input.addEventListener('change', () => {
    root.querySelectorAll('.center-mode-option').forEach(label => label.classList.toggle('is-selected', label.querySelector('input')?.checked));
  }));
  root.querySelectorAll('[data-go]').forEach(button => button.addEventListener(
    'click', () => onNavigate(button.dataset.go,button.dataset.focusId||'')
  ));
  root.querySelector('[data-generate-global]')?.addEventListener('click', async event => {
    if (event.currentTarget.disabled) return;
    try {
      await onGenerateGlobal(readSettings(root.querySelector('#centerPlanningForm'), settings));
    } catch(error) {
      window.alert(error?.message||'No se pudo validar la configuración del centro.');
    }
  });
  const applyButton = root.querySelector('[data-apply-global]');
  applyButton?.addEventListener('click', async () => {
    await onApplyGlobal();
    if (!applyButton.isConnected && globalProposal?.ok) {
      await persistGeneratedActivitySlots(settings, globalProposal.activitySchedules || []);
    }
  });
  root.querySelector('[data-discard-global]')?.addEventListener('click', () => onDiscardGlobal());
  root.querySelector('#centerPlanningForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      await onSave(readSettings(event.currentTarget, settings));
    } catch(error) {
      const field=error?.message?.startsWith('Sala')
        ? event.currentTarget.elements.roomResources
        : event.currentTarget.elements.travelRules;
      if(field && /^(Trayecto|Sala|Se admiten|Solo se admiten)/.test(error?.message||'')) {
        field.setCustomValidity(error.message);
        field.reportValidity();
        field.addEventListener('input',()=>field.setCustomValidity(''),{once:true});
      } else {
        window.alert(error?.message||'No se pudo guardar la configuración.');
      }
    }
  });
}

function renderCourseCurriculum(course, settings) {
  const subjects = curriculumSubjectsForCourse(course.value);
  const values = curriculumForCourse(settings, course.value);
  return `<details class="curriculum-course-card" ${course.value === '1º' ? 'open' : ''}>
    <summary><strong>${escapeHtml(course.label)}</strong><span>${Object.keys(values).length ? `${Object.keys(values).length} materia(s) configuradas` : 'Sin carga definida'}</span></summary>
    <div class="curriculum-subject-grid">
      ${subjects.map(subject => {
        const minutes = values[subject] || 0;
        const hours = minutes ? trimNumber(minutes / 60) : '';
        return `<label class="curriculum-subject-row"><span>${escapeHtml(subject)}</span><input type="number" min="0" step="0.25" inputmode="decimal" value="${hours}" data-curriculum-course="${escapeHtml(course.value)}" data-curriculum-subject="${escapeHtml(subject)}" aria-label="Horas semanales de ${escapeHtml(subject)} en ${escapeHtml(course.label)}"><small>h/sem.</small></label>`;
      }).join('')}
    </div>
  </details>`;
}

function renderTeacherSummary(professional) {
  const profile = normalizeProfessionalProfile(professional);
  const responsibilities = profile.responsibilities.map(item => {
    const type = RESPONSIBILITY_TYPES.find(option => option.value === item.tipo)?.label || 'Función';
    return `${type}: ${item.nombre}${item.weeklyMinutes ? ` (${formatDuration(item.weeklyMinutes)})` : ''}`;
  });
  const teaching = profile.teachingAssignments.map(item => `${item.grupoClase} · ${item.materia}`);
  const badgeClass = profile.tipo === 'PT' ? 'badge-pt' : profile.tipo === 'AL' ? 'badge-al' : 'badge-neutral';
  return `<article class="teacher-profile-card">
    <header><div><strong>${escapeHtml(profile.nombre || 'Sin nombre')}</strong><small>${escapeHtml(profile.especialidad || (profile.tipo === 'DOCENTE' ? 'Docente' : profile.tipo))}</small></div><span class="badge ${badgeClass}">${escapeHtml(profile.tipo)}</span></header>
    <dl><div><dt>Tutoría</dt><dd>${escapeHtml(profile.tutoriaGrupo || '—')}</dd></div><div><dt>Docencia</dt><dd>${teaching.length ? teaching.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '—'}</dd></div><div><dt>Funciones</dt><dd>${responsibilities.length ? responsibilities.map(item => `<span>${escapeHtml(item)}</span>`).join('') : '—'}</dd></div></dl>
  </article>`;
}

function renderCoverageCard(item) {
  const className = !item.configured ? 'is-unconfigured' : item.complete ? 'is-complete' : 'is-incomplete';
  const status = !item.configured ? 'Sin objetivo' : item.complete ? 'Completo' : 'Revisar';
  const rows = item.rows.filter(row => row.target || row.actual).map(row => `<tr><td>${escapeHtml(row.subject)}</td><td>${formatDuration(row.target)}</td><td>${formatDuration(row.actual)}</td><td>${formatDifference(row.difference)}</td></tr>`).join('');
  return `<article class="curriculum-coverage-card ${className}">
    <header><div><strong>${escapeHtml(item.grupoClase)}</strong><small>${escapeHtml(item.course || '')}</small></div><span class="badge ${item.complete ? 'badge-success' : 'badge-warning'}">${status}</span></header>
    <div class="coverage-totals"><span>Objetivo <b>${formatDuration(item.targetTotal)}</b></span><span>Cargado <b>${formatDuration(item.actualTotal)}</b></span></div>
    ${rows ? `<div class="table-wrap"><table><thead><tr><th>Materia</th><th>Objetivo</th><th>Horario</th><th>Diferencia</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No hay datos curriculares para comparar.</p>'}
  </article>`;
}

function renderReadinessItem(item) {
  const targets={
    mode:{view:'centerPlanning',focusId:'mode',label:'Activar centro completo'},
    structure:{view:'classSchedules',label:'Configurar clases'},
    generation:{view:'centerPlanning',focusId:'globalStart',label:'Revisar jornada'},
    curriculum:{view:'centerPlanning',focusId:'curriculum',label:'Revisar currículo'},
    activities:{view:'centerActivities',label:'Revisar actividades'},
    grid:{view:'temporalPatterns',label:'Revisar duración'},
    patterns:{view:'temporalPatterns',label:'Revisar patrones'},
    teachers:{view:'professionals',label:'Revisar profesorado'},
    availability:{view:'professionals',label:'Revisar disponibilidad'},
    workload:{view:'professionals',label:'Revisar carga docente'},
    capacity:{view:'centerPlanning',focusId:'globalStart',label:'Revisar jornada'}
  };
  const action=item.ok?null:targets[item.id];
  const button=action
    ? `<button class="button" type="button" data-go="${action.view}" data-focus-id="${action.focusId||''}">${action.label} →</button>`
    : '';
  return `<div class="global-readiness-item ${item.ok ? 'is-ready' : 'is-pending'}"><span class="global-readiness-icon">${item.ok ? '✓' : '!'}</span><div><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.message)}</small>${button}</div></div>`;
}

function renderGlobalProposal(proposal) {
  if (!proposal) return '<div class="global-proposal-empty">Todavía no se ha calculado ninguna propuesta global.</div>';
  if (!proposal.ok) {
    const unresolved = proposal.unresolved || [];
    return `<div class="global-proposal-result is-error"><strong>No se ha encontrado una propuesta completa</strong><span>${unresolved.length ? `${unresolved.length} elemento(s) no han podido colocarse.` : 'Revisa los requisitos pendientes antes de generar.'}</span>${unresolved.length ? `<div class="global-unresolved-list">${unresolved.slice(0,12).map(item => `<span>${escapeHtml(item.task ? `${taskLabel(item.task)} (${item.task.duration} min): ${item.reason}` : item.reason || item.conflict?.message || 'Sin hueco')}${(item.reason||item.conflict?.message) && correctionForMessage(item.reason||item.conflict?.message)? ` <button type="button" class="button" data-go="${correctionForMessage(item.reason||item.conflict?.message).view}" data-focus-id="${correctionForMessage(item.reason||item.conflict?.message).focusId||''}">${escapeHtml(correctionForMessage(item.reason||item.conflict?.message).label)} →</button>`:''}</span>`).join('')}${unresolved.length > 12 ? `<span>… y ${unresolved.length - 12} más</span>` : ''}</div>` : ''}<div class="button-row"><button class="button" type="button" data-discard-global>Descartar resultado</button></div></div>`;
  }

  const summary = summarizeGenerated(proposal.classSchedules || []);
  const activities = proposal.activitySchedules || [];
  return `<div class="global-proposal-result is-success">
    <div class="global-proposal-stats">
      <span><b>${proposal.stats.classes}</b> clases</span><span><b>${proposal.stats.subjects}</b> clase/asignatura</span><span><b>${proposal.stats.blocks}</b> bloques lectivos</span><span><b>${formatDuration(proposal.stats.minutes)}</b> docencia</span><span><b>${proposal.stats.activities || 0}</b> actividades</span><span><b>${proposal.stats.activityBlocks || 0}</b> bloques de actividad</span><span><b>${proposal.stats.ptalAligned}</b> bloques coinciden con PT/AL</span>
    </div>
    <div class="global-proposal-warning"><strong>Vista previa conjunta</strong><span>Aplicar sustituirá los horarios ordinarios de las clases participantes y guardará las franjas propuestas de las actividades. Las sesiones PT/AL no se modifican.</span></div>
    <details open><summary><strong>Docencia ordinaria</strong></summary><div class="table-wrap"><table><thead><tr><th>Clase</th><th>Asignatura</th><th>Propuesta semanal</th><th>Docente</th></tr></thead><tbody>${summary.slice(0,80).map(row => `<tr><td><strong>${escapeHtml(row.grupoClase)}</strong></td><td>${escapeHtml(row.materia)}</td><td>${row.slots.map(slot => `<span class="weekly-summary-slot"><b>${escapeHtml(slot.dia.slice(0,3))}</b> ${escapeHtml(slot.inicio)}–${escapeHtml(slot.fin)}</span>`).join(' ')}</td><td>${escapeHtml(row.docente || '—')}</td></tr>`).join('')}</tbody></table></div></details>
    <details ${activities.length ? 'open' : ''}><summary><strong>Actividades del centro · ${activities.length} bloque(s)</strong></summary><div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Día</th><th>Hora</th><th>Docentes simultáneos</th><th>Clases relacionadas</th></tr></thead><tbody>${activities.map(entry => `<tr><td><strong>${escapeHtml(entry.activityName)}</strong></td><td>${escapeHtml(entry.dia)}</td><td>${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</td><td>${(entry.teacherNames || []).map(escapeHtml).join(', ') || '—'}</td><td>${(entry.classGroupIds || []).map(escapeHtml).join(', ') || '—'}</td></tr>`).join('') || '<tr><td colspan="5">No hay actividades activas que colocar.</td></tr>'}</tbody></table></div></details>
    <div class="button-row global-proposal-buttons"><button class="button button-primary" type="button" data-apply-global>Aplicar propuesta global</button><button class="button" type="button" data-discard-global>Descartar</button></div>
  </div>`;
}

function summarizeGenerated(entries) {
  const map = new Map();
  for (const entry of entries) {
    const key = `${entry.grupoClase}\u0000${entry.materia}`;
    if (!map.has(key)) map.set(key, { grupoClase:entry.grupoClase, materia:entry.materia, docente:entry.docente || '', slots:[] });
    map.get(key).slots.push({ dia:entry.dia, inicio:entry.inicio, fin:entry.fin });
  }
  const dayOrder = new Map(['lunes','martes','miercoles','jueves','viernes'].map((day, index) => [day,index]));
  return [...map.values()].map(item => ({ ...item, slots:item.slots.sort((a,b) => (dayOrder.get(a.dia) ?? 99) - (dayOrder.get(b.dia) ?? 99) || a.inicio.localeCompare(b.inicio)) }))
    .sort((a,b) => a.grupoClase.localeCompare(b.grupoClase, 'es', { numeric:true }) || a.materia.localeCompare(b.materia, 'es'));
}

function readSettings(form, settings) {
  const data = new FormData(form);
  const next=normalizeCenterPlanningSettings({
    ...settings,
    mode:data.get('mode'),
    profileName:data.get('profileName'),
    territory:data.get('territory'),
    academicYear:data.get('academicYear'),
    legalReference:data.get('legalReference'),
    generation:{
      ...settings.generation,
      start:data.get('globalStart') || settings.generation.start,
      end:data.get('globalEnd') || settings.generation.end,
      lessonMinutes:Number(data.get('lessonMinutes') || settings.generation.lessonMinutes),
      maxSameSubjectPerDay:Number(data.get('maxSameSubjectPerDay') || settings.generation.maxSameSubjectPerDay),
      travelMinutes:Number(data.get('travelMinutes') ?? settings.generation.travelMinutes),
      supportRoomId:String(data.get('supportRoomId') ?? settings.generation.supportRoomId),
      travelRules:data.get('travelRules') === null
        ? settings.generation.travelRules
        : parseTravelRules(data.get('travelRules')),
      roomResources:data.get('roomResources') === null
        ? settings.generation.roomResources
        : parseRoomResources(data.get('roomResources')),
      autoAssignSupportRooms:data.get('autoAssignSupportRooms') === null
        ? (form.elements.autoAssignSupportRooms
            ? false : settings.generation.autoAssignSupportRooms)
        : true,
      supportRoomRequirements:data.get('roomResources')===null
        ? settings.generation.supportRoomRequirements
        : {
          PT:data.getAll('requiredFeaturePT'),
          AL:data.getAll('requiredFeatureAL')
        }
    },
    curriculum:readCurriculumInputs(form)
  });
  // Keep the version's provenance but flag local changes; updating catalog.json
  // can never update the minutes of a previously saved school.
  if(next.curriculumSource?.kind==='imported'&&(
    JSON.stringify(next.curriculum)!==JSON.stringify(settings.curriculum)||
    next.territory!==settings.territory||next.legalReference!==settings.legalReference
  ))next.curriculumSource={...next.curriculumSource,modified:true};
  return next;
}

function readCurriculumInputs(form) {
  const curriculum = {};
  form.querySelectorAll('[data-curriculum-course][data-curriculum-subject]').forEach(input => {
    const hours = Number(String(input.value || '').replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0) return;
    const course = input.dataset.curriculumCourse;
    const subject = input.dataset.curriculumSubject;
    curriculum[course] ||= {};
    curriculum[course][subject] = Math.round(hours * 60);
  });
  return curriculum;
}

async function persistGeneratedActivitySlots(settings, schedules) {
  const byActivity = new Map();
  for (const entry of schedules) {
    if (!byActivity.has(entry.activityId)) byActivity.set(entry.activityId, []);
    byActivity.get(entry.activityId).push({
      dia:entry.dia,
      inicio:entry.inicio,
      fin:entry.fin,
      teacherIds:[...(entry.teacherIds || [])]
    });
  }
  const weeklyActivities = settings.weeklyActivities.map(activity => activity.active === false
    ? activity
    : { ...activity, scheduledSlots:byActivity.get(activity.id) || [] });
  await saveCenterPlanningSettings({ ...settings, weeklyActivities });
}

function taskLabel(task) {
  return task.kind === 'activity' ? `Actividad · ${task.activityName}` : `${task.grupoClase} · ${task.materia}`;
}

function formatDifference(minutes) {
  if (!minutes) return '0 min';
  return `${minutes > 0 ? '+' : '−'}${formatDuration(Math.abs(minutes))}`;
}

function trimNumber(value) {
  return Number(value.toFixed(2)).toString();
}
