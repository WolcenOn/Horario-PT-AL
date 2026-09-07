import { configuredClassGroups, courseForClassGroup, schoolStructureConfigured } from './education.js';
import { normalizeProfessionalProfile } from './center-planning.js';
import { studentServiceKey, studentServices } from './student-services.js';
import { escapeHtml, fullName, uid } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

export function renderClassRosters(root, {
  state,
  onConfigureStructure,
  onAddStudent,
  onEditStudent,
  onBulkCreate
}) {
  const classes = configuredClassGroups(state.schoolSettings);
  const activeStudents = (state.students || []).filter(student => student.activo !== false);
  const tutorByClass = new Map((state.professionals || [])
    .filter(item => item.activo !== false)
    .map(normalizeProfessionalProfile)
    .filter(item => item.tutoriaGrupo)
    .map(item => [normalize(item.tutoriaGrupo), item.nombre]));

  const ptCount = activeStudents.filter(student => studentServices(student, state.groups).includes('PT')).length;
  const alCount = activeStudents.filter(student => studentServices(student, state.groups).includes('AL')).length;
  const bothCount = activeStudents.filter(student => studentServiceKey(student, state.groups) === 'PT+AL').length;
  const noSupportCount = activeStudents.filter(student => studentServiceKey(student, state.groups) === 'NONE').length;

  if (!schoolStructureConfigured(state.schoolSettings)) {
    root.innerHTML = `<section class="card"><div class="empty-state"><strong>Primero configura las clases del centro</strong>La matrícula completa se organiza a partir de la estructura ordinaria de Infantil y Primaria.<button class="button button-primary" data-configure-classes type="button">Configurar clases</button></div></section>`;
    root.querySelector('[data-configure-classes]')?.addEventListener('click', onConfigureStructure);
    return;
  }

  const cards = classes.map(grupoClase => {
    const course = courseForClassGroup(state.schoolSettings, grupoClase) || '';
    const students = activeStudents
      .filter(student => normalize(student.grupoClase) === normalize(grupoClase))
      .sort((a,b) => fullName(a).localeCompare(fullName(b), 'es'));
    const support = students.reduce((acc, student) => {
      const key = studentServiceKey(student, state.groups);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const tutor = tutorByClass.get(normalize(grupoClase)) || students.find(item => item.tutor)?.tutor || 'Sin tutor fijado';
    return `<section class="card roster-class-card" data-roster-class="${escapeHtml(grupoClase)}">
      <div class="card-header roster-class-header">
        <div><h2>${escapeHtml(grupoClase)}</h2><small>${escapeHtml(course)} · ${escapeHtml(tutor)}</small></div>
        <div class="roster-class-actions">
          <span class="badge badge-neutral">${students.length} alumnos</span>
          <button class="button" data-add-to-class="${escapeHtml(grupoClase)}" type="button">+ Alumno</button>
          <button class="button" data-bulk-to-class="${escapeHtml(grupoClase)}" type="button">Alta masiva</button>
        </div>
      </div>
      <div class="roster-service-summary">
        <span>Sin apoyo <strong>${support.NONE || 0}</strong></span>
        <span>PT <strong>${(support.PT || 0) + (support['PT+AL'] || 0)}</strong></span>
        <span>AL <strong>${(support.AL || 0) + (support['PT+AL'] || 0)}</strong></span>
        <span>PT+AL <strong>${support['PT+AL'] || 0}</strong></span>
      </div>
      <div class="roster-student-list">
        ${students.length ? students.map(student => studentRow(student, state.groups)).join('') : `<div class="empty-state roster-empty"><strong>Clase sin alumnado cargado</strong>Añade alumnos individualmente o pega la lista completa con “Alta masiva”.</div>`}
      </div>
    </section>`;
  }).join('');

  root.innerHTML = `<div class="class-rosters">
    <section class="card roster-hero">
      <div><p class="eyebrow">Matrícula del centro</p><h2>Clases y alumnado</h2><p>La clase ordinaria contiene a todo el alumnado. PT y AL son apoyos opcionales sobre esos mismos alumnos, por lo que un alumno puede no tener apoyo, recibir PT, AL o ambos.</p></div>
      <button class="button" data-configure-classes type="button">Configurar estructura</button>
    </section>
    <section class="capacity-metrics roster-metrics">
      ${metric('Clases', classes.length)}
      ${metric('Alumnos activos', activeStudents.length)}
      ${metric('Sin PT/AL', noSupportCount)}
      ${metric('PT', ptCount)}
      ${metric('AL', alCount)}
      ${metric('PT + AL', bothCount)}
    </section>
    <div class="roster-class-grid">${cards}</div>
  </div>`;

  root.querySelector('[data-configure-classes]')?.addEventListener('click', onConfigureStructure);
  root.querySelectorAll('[data-add-to-class]').forEach(button => button.addEventListener('click', () => onAddStudent(button.dataset.addToClass)));
  root.querySelectorAll('[data-bulk-to-class]').forEach(button => button.addEventListener('click', () => openBulkStudentForm(button.dataset.bulkToClass, state, onBulkCreate)));
  root.querySelectorAll('[data-edit-roster-student]').forEach(button => button.addEventListener('click', () => onEditStudent(button.dataset.editRosterStudent)));
}

export function openBulkStudentForm(grupoClase, state, onSave) {
  const course = courseForClassGroup(state.schoolSettings, grupoClase) || '';
  const tutor = (state.professionals || [])
    .map(normalizeProfessionalProfile)
    .find(item => item.activo !== false && normalize(item.tutoriaGrupo) === normalize(grupoClase))?.nombre || '';
  showModal({
    title:`Alta masiva · ${grupoClase}`,
    submitLabel:'Crear alumnos',
    bodyHtml:`<div class="form-grid">
      <div class="form-field full"><label for="bulkStudents">Listado de alumnos</label><textarea id="bulkStudents" name="bulkStudents" rows="12" placeholder="García López, Ana\nMartín Ruiz, Pablo\n\no pega dos columnas desde una hoja de cálculo: Nombre [TAB] Apellidos"></textarea><span class="field-hint">Formatos admitidos: “Apellidos, Nombre”, “Nombre;Apellidos” o dos columnas pegadas desde Excel/Sheets. Los alumnos se crean sin PT/AL; después puedes activar el apoyo que corresponda.</span></div>
      <div class="capacity-note full"><strong>Destino</strong><span>${escapeHtml(grupoClase)} · ${escapeHtml(course)}${tutor ? ` · Tutor/a: ${escapeHtml(tutor)}` : ''}</span></div>
    </div>`,
    onSubmit: async (data, _form, message) => {
      const parsed = parseStudentList(data.get('bulkStudents'));
      if (!parsed.length) {
        setModalMessage(message, 'Pega al menos un alumno válido.');
        return false;
      }
      const existing = new Set((state.students || [])
        .filter(item => normalize(item.grupoClase) === normalize(grupoClase))
        .map(item => normalize(`${item.nombre} ${item.apellidos}`)));
      const unique = [];
      const seen = new Set();
      const duplicates = [];
      for (const item of parsed) {
        const key = normalize(`${item.nombre} ${item.apellidos}`);
        if (existing.has(key) || seen.has(key)) {
          duplicates.push(`${item.nombre} ${item.apellidos}`);
          continue;
        }
        seen.add(key);
        unique.push(item);
      }
      if (!unique.length) {
        setModalMessage(message, 'Todos los nombres pegados ya existen en esta clase o están repetidos.');
        return false;
      }
      const students = unique.map(item => ({
        id:uid('alu'),
        nombre:item.nombre,
        apellidos:item.apellidos,
        curso:course,
        grupoClase,
        tutor,
        horasPTObjetivoMin:0,
        horasALObjetivoMin:0,
        observaciones:'',
        restricciones:[],
        activo:true
      }));
      await onSave(students, { grupoClase, duplicates });
      return true;
    }
  });
}

export function parseStudentList(value) {
  const lines = String(value || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const result = [];
  for (const line of lines) {
    let nombre = '';
    let apellidos = '';
    if (line.includes('\t')) {
      const [first, ...rest] = line.split('\t').map(part => part.trim()).filter(Boolean);
      nombre = first || '';
      apellidos = rest.join(' ');
    } else if (line.includes(';')) {
      const [first, ...rest] = line.split(';').map(part => part.trim());
      nombre = first || '';
      apellidos = rest.join(' ').trim();
    } else if (line.includes(',')) {
      const [first, ...rest] = line.split(',').map(part => part.trim());
      apellidos = first || '';
      nombre = rest.join(' ').trim();
    } else {
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      nombre = parts.shift() || '';
      apellidos = parts.join(' ');
    }
    if (nombre && apellidos) result.push({ nombre, apellidos });
  }
  return result;
}

function studentRow(student, groups) {
  const services = studentServices(student, groups);
  return `<div class="roster-student-row">
    <div><strong>${escapeHtml(fullName(student))}</strong>${student.activo === false ? '<small>Inactivo</small>' : ''}</div>
    <div class="roster-student-services">${services.length ? services.map(service => `<span class="badge badge-${service.toLowerCase()}">${service}</span>`).join('') : '<span class="badge badge-neutral">Sin apoyo</span>'}</div>
    <button class="button button-ghost" data-edit-roster-student="${student.id}" type="button">Editar</button>
  </div>`;
}

function metric(label, value) {
  return `<div class="capacity-metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
