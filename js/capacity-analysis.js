import { configuredClassGroups, courseForClassGroup } from './education.js';
import { curriculumForCourse, normalizeCenterPlanningSettings, normalizeProfessionalProfile } from './center-planning.js';
import { timeToMinutes } from './utils.js';

const TIGHT_MARGIN_MINUTES = 120;

export function buildCapacityStudy(state, rawSettings = state.centerPlanningSettings) {
  const settings = normalizeCenterPlanningSettings(rawSettings);
  const classes = configuredClassGroups(state.schoolSettings);
  const professionals = (state.professionals || [])
    .filter(item => item.activo !== false)
    .map(normalizeProfessionalProfile);
  const requirements = buildRequirements(classes, state.schoolSettings, settings, professionals);
  const issues = [];

  for (const requirement of requirements) {
    if (requirement.fixedTeacherIds.length > 1) {
      issues.push({
        severity:'error',
        type:'duplicate-fixed-assignment',
        message:`${requirement.grupoClase} · ${requirement.subject}: hay ${requirement.fixedTeacherIds.length} docentes fijados para la misma necesidad.`
      });
    }
  }

  const teacherRows = professionals.map(professional => buildTeacherRow(professional, state, requirements));
  const teacherById = new Map(teacherRows.map(row => [row.id, row]));

  for (const requirement of requirements) {
    if (requirement.fixedTeacherIds.length !== 1) continue;
    const row = teacherById.get(requirement.fixedTeacherIds[0]);
    if (!row) {
      issues.push({ severity:'error', type:'missing-fixed-teacher', message:`${requirement.grupoClase} · ${requirement.subject}: el docente fijado no está activo.` });
      continue;
    }
    row.fixedOrdinaryMinutes += requirement.minutes;
    row.freeMinutes = Math.max(0, row.capacityMinutes - row.nonOrdinaryMinutes - row.fixedOrdinaryMinutes);
    if (row.capacityMinutes - row.nonOrdinaryMinutes - row.fixedOrdinaryMinutes < 0) {
      issues.push({ severity:'error', type:'teacher-over-capacity', message:`${row.name} supera su capacidad semanal con las asignaciones ya fijadas.` });
    }
  }

  const openRequirements = requirements.filter(item => item.fixedTeacherIds.length !== 1);
  const flow = maximumAssignableMinutes(teacherRows, openRequirements);
  const totalRequiredMinutes = requirements.reduce((sum, item) => sum + item.minutes, 0);
  const fixedRequiredMinutes = requirements
    .filter(item => item.fixedTeacherIds.length === 1)
    .reduce((sum, item) => sum + item.minutes, 0);
  const totalCapacityMinutes = teacherRows.reduce((sum, row) => sum + row.capacityMinutes, 0);
  const totalNonOrdinaryMinutes = teacherRows.reduce((sum, row) => sum + row.nonOrdinaryMinutes, 0);
  const totalFreeMinutes = teacherRows.reduce((sum, row) => sum + row.freeMinutes, 0);
  const coverableMinutes = fixedRequiredMinutes + flow.assignedMinutes;
  const uncoveredMinutes = Math.max(0, totalRequiredMinutes - coverableMinutes);

  if (!classes.length) issues.push({ severity:'warning', type:'no-classes', message:'No hay clases configuradas en la estructura del centro.' });
  if (!requirements.length) issues.push({ severity:'warning', type:'no-curriculum', message:'No hay carga curricular configurada para las clases del centro.' });
  if (!professionals.length) issues.push({ severity:'error', type:'no-professionals', message:'No hay profesorado activo configurado.' });
  if (uncoveredMinutes > 0) issues.push({ severity:'error', type:'capacity-deficit', message:`Quedan ${formatMinutes(uncoveredMinutes)} de docencia sin capacidad compatible.` });

  const subjects = buildSubjectRows(requirements, teacherRows);
  subjects.filter(row => row.eligibleTeachers === 0 && row.requiredMinutes > 0).forEach(row => {
    issues.push({ severity:'error', type:'subject-without-teacher', message:`${row.subject}: no hay ningún docente habilitado para cubrir ${formatMinutes(row.requiredMinutes)}.` });
  });

  const tutors = buildTutorStudy(classes, teacherRows, professionals);
  tutors.issues.forEach(issue => issues.push(issue));

  return {
    ready:issues.every(issue => issue.severity !== 'error'),
    settings,
    classes,
    requirements,
    teachers:teacherRows.sort((a, b) => a.name.localeCompare(b.name, 'es')),
    subjects,
    tutors,
    issues,
    totals:{
      classes:classes.length,
      teachers:teacherRows.length,
      requiredMinutes:totalRequiredMinutes,
      capacityMinutes:totalCapacityMinutes,
      nonOrdinaryMinutes:totalNonOrdinaryMinutes,
      freeMinutes:totalFreeMinutes,
      fixedRequiredMinutes,
      coverableMinutes,
      uncoveredMinutes,
      coverageRatio:totalRequiredMinutes ? coverableMinutes / totalRequiredMinutes : 1
    }
  };
}

function buildRequirements(classes, schoolSettings, settings, professionals) {
  const result = [];
  for (const grupoClase of classes) {
    const course = courseForClassGroup(schoolSettings, grupoClase);
    const curriculum = curriculumForCourse(settings, course);
    for (const [subject, minutes] of Object.entries(curriculum)) {
      if (!minutes) continue;
      const fixedTeacherIds = professionals
        .filter(prof => prof.teachingAssignments.some(item => same(item.grupoClase, grupoClase) && same(item.materia, subject)))
        .map(prof => prof.id);
      result.push({
        id:`${normalize(grupoClase)}::${normalize(subject)}`,
        grupoClase,
        course,
        subject,
        minutes,
        fixedTeacherIds
      });
    }
  }
  return result;
}

function buildTeacherRow(professional, state, requirements) {
  const availabilityMinutes = weeklyAvailabilityMinutes(professional);
  const configuredCapacity = Math.max(0, Math.round(Number(professional.maxWeeklyMinutes) || 0));
  const capacityMinutes = configuredCapacity || availabilityMinutes;
  const responsibilityMinutes = (professional.responsibilities || []).reduce((sum, item) => sum + Math.max(0, Number(item.weeklyMinutes) || 0), 0);
  const ptalMinutes = directSupportMinutes(professional.id, state);
  const nonOrdinaryMinutes = responsibilityMinutes + ptalMinutes;
  const baseFree = Math.max(0, capacityMinutes - nonOrdinaryMinutes);
  const explicitlyAllowed = new Set((professional.allowedSubjects || []).map(normalize));
  const fixedSubjects = new Set((professional.teachingAssignments || []).map(item => normalize(item.materia)));
  const eligibleRequirementIds = requirements
    .filter(requirement => explicitlyAllowed.has(normalize(requirement.subject)) || fixedSubjects.has(normalize(requirement.subject)))
    .map(requirement => requirement.id);
  return {
    id:professional.id,
    name:professional.nombre || 'Sin nombre',
    type:professional.tipo,
    teacherRole:professional.teacherRole,
    specialty:professional.especialidad || '',
    tutorGroup:professional.tutoriaGrupo || '',
    tutorPreference:professional.tutorPreference,
    minimumTutorMinutes:professional.minimumTutorMinutes || 0,
    allowedSubjects:[...(professional.allowedSubjects || [])],
    teachingAssignments:[...(professional.teachingAssignments || [])],
    capacityMinutes,
    availabilityMinutes,
    responsibilityMinutes,
    ptalMinutes,
    nonOrdinaryMinutes,
    fixedOrdinaryMinutes:0,
    freeMinutes:baseFree,
    eligibleRequirementIds
  };
}

function buildSubjectRows(requirements, teachers) {
  const subjects = new Map();
  for (const requirement of requirements) {
    if (!subjects.has(requirement.subject)) subjects.set(requirement.subject, []);
    subjects.get(requirement.subject).push(requirement);
  }
  return [...subjects.entries()].map(([subject, rows]) => {
    const requiredMinutes = rows.reduce((sum, item) => sum + item.minutes, 0);
    const requirementIds = new Set(rows.map(item => item.id));
    const eligible = teachers.filter(teacher => teacher.eligibleRequirementIds.some(id => requirementIds.has(id)));
    const eligibleCapacityMinutes = eligible.reduce((sum, teacher) => sum + teacher.freeMinutes, 0)
      + rows.filter(item => item.fixedTeacherIds.length === 1).reduce((sum, item) => sum + item.minutes, 0);
    const marginMinutes = eligibleCapacityMinutes - requiredMinutes;
    let status = 'ok';
    if (!eligible.length) status = 'deficit';
    else if (marginMinutes < 0) status = 'deficit';
    else if (marginMinutes <= TIGHT_MARGIN_MINUTES) status = 'tight';
    else if (eligible.length === 1) status = 'critical';
    return {
      subject,
      requiredMinutes,
      eligibleTeachers:eligible.length,
      eligibleTeacherNames:eligible.map(item => item.name),
      eligibleCapacityMinutes,
      marginMinutes,
      status,
      dependency:eligible.length === 1
    };
  }).sort((a, b) => a.subject.localeCompare(b.subject, 'es'));
}

function buildTutorStudy(classes, teacherRows, professionals) {
  const issues = [];
  const assignments = new Map();
  for (const professional of professionals) {
    if (!professional.tutoriaGrupo) continue;
    const group = professional.tutoriaGrupo;
    if (!assignments.has(group)) assignments.set(group, []);
    assignments.get(group).push(professional.id);
  }
  for (const [group, teacherIds] of assignments) {
    if (!classes.includes(group)) issues.push({ severity:'warning', type:'legacy-tutor-group', message:`La tutoría ${group} no pertenece a la estructura actual del centro.` });
    if (teacherIds.length > 1) issues.push({ severity:'error', type:'duplicate-tutor', message:`${group} tiene ${teacherIds.length} tutores fijados.` });
  }

  const coveredClasses = classes.filter(group => (assignments.get(group) || []).length === 1);
  const uncoveredClasses = classes.filter(group => !(assignments.get(group) || []).length);
  const alreadyTutors = new Set([...assignments.values()].flat());
  const candidates = teacherRows
    .filter(row => !alreadyTutors.has(row.id) && row.tutorPreference !== 'no' && row.freeMinutes > 0)
    .map(row => ({
      id:row.id,
      name:row.name,
      teacherRole:row.teacherRole,
      tutorPreference:row.tutorPreference,
      freeMinutes:row.freeMinutes,
      specialty:row.specialty
    }));
  const naturalCandidates = candidates.filter(item => item.teacherRole !== 'especialista');
  const specialistCandidates = candidates.filter(item => item.teacherRole === 'especialista')
    .sort((a, b) => tutorCandidateScore(b) - tutorCandidateScore(a));
  const specialistTutorsNeeded = Math.max(0, uncoveredClasses.length - naturalCandidates.length);

  if (uncoveredClasses.length > candidates.length) {
    issues.push({ severity:'error', type:'not-enough-tutors', message:`Faltan ${uncoveredClasses.length - candidates.length} candidatos para cubrir todas las tutorías.` });
  } else if (specialistTutorsNeeded > 0) {
    issues.push({ severity:'warning', type:'specialist-tutor-needed', message:`Con la configuración actual, al menos ${specialistTutorsNeeded} especialista(s) tendría(n) que asumir tutoría.` });
  }

  return {
    required:classes.length,
    fixed:coveredClasses.length,
    uncoveredClasses,
    candidates,
    naturalCandidates,
    specialistCandidates,
    specialistTutorsNeeded,
    issues
  };
}

function maximumAssignableMinutes(teachers, requirements) {
  const source = 'source';
  const sink = 'sink';
  const capacities = new Map();
  const adjacency = new Map();
  const addEdge = (from, to, capacity) => {
    const key = `${from}\u0000${to}`;
    const reverse = `${to}\u0000${from}`;
    capacities.set(key, (capacities.get(key) || 0) + Math.max(0, capacity));
    if (!capacities.has(reverse)) capacities.set(reverse, 0);
    if (!adjacency.has(from)) adjacency.set(from, new Set());
    if (!adjacency.has(to)) adjacency.set(to, new Set());
    adjacency.get(from).add(to);
    adjacency.get(to).add(from);
  };

  for (const teacher of teachers) addEdge(source, `t:${teacher.id}`, teacher.freeMinutes);
  for (const requirement of requirements) {
    const reqNode = `r:${requirement.id}`;
    addEdge(reqNode, sink, requirement.minutes);
    for (const teacher of teachers) {
      if (teacher.eligibleRequirementIds.includes(requirement.id)) addEdge(`t:${teacher.id}`, reqNode, requirement.minutes);
    }
  }

  let assignedMinutes = 0;
  while (true) {
    const parent = new Map([[source, null]]);
    const queue = [source];
    for (let index = 0; index < queue.length && !parent.has(sink); index++) {
      const node = queue[index];
      for (const next of adjacency.get(node) || []) {
        if (parent.has(next)) continue;
        const residual = capacities.get(`${node}\u0000${next}`) || 0;
        if (residual <= 0) continue;
        parent.set(next, node);
        queue.push(next);
        if (next === sink) break;
      }
    }
    if (!parent.has(sink)) break;
    let amount = Infinity;
    let node = sink;
    while (node !== source) {
      const previous = parent.get(node);
      amount = Math.min(amount, capacities.get(`${previous}\u0000${node}`) || 0);
      node = previous;
    }
    node = sink;
    while (node !== source) {
      const previous = parent.get(node);
      const forward = `${previous}\u0000${node}`;
      const reverse = `${node}\u0000${previous}`;
      capacities.set(forward, (capacities.get(forward) || 0) - amount);
      capacities.set(reverse, (capacities.get(reverse) || 0) + amount);
      node = previous;
    }
    assignedMinutes += amount;
  }
  return { assignedMinutes };
}

function weeklyAvailabilityMinutes(professional) {
  return Object.values(professional.disponibilidad || {}).flat().reduce((sum, interval) => {
    const start = timeToMinutes(interval?.inicio);
    const end = timeToMinutes(interval?.fin);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + end - start : sum;
  }, 0);
}

function directSupportMinutes(professionalId, state) {
  const groups = new Map((state.groups || []).map(group => [group.id, group]));
  return (state.sessions || []).reduce((sum, session) => {
    const group = groups.get(session.groupId);
    const owner = session.professionalId || group?.professionalId;
    if (owner !== professionalId || !group || !Array.isArray(group.studentIds) || !group.studentIds.length) return sum;
    const start = timeToMinutes(session.inicio);
    const end = timeToMinutes(session.fin);
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? sum + end - start : sum;
  }, 0);
}

function tutorCandidateScore(candidate) {
  const preference = { preferente:300, disponible:150, evitar:0, no:-10000 }[candidate.tutorPreference] || 0;
  return preference + candidate.freeMinutes;
}

export function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function same(a, b) {
  return normalize(a) === normalize(b);
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
