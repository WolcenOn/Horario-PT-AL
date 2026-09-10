export const AI_CONFIG_SCHEMA = 'center-config-proposal-v1';

export function buildAiCenterConfigurationContext(state) {
  const professionalAliases = new Map();
  const studentAliases = new Map();

  const professionals = (state.professionals || []).map((professional, index) => {
    const alias = `PROF_${index + 1}`;
    professionalAliases.set(professional.id, alias);
    return compact({
      alias,
      tipo:professional.tipo,
      especialidad:professional.especialidad,
      tutoriaGrupo:professional.tutoriaGrupo,
      activo:professional.activo !== false,
      teachingAssignments:professional.teachingAssignments,
      responsibilities:professional.responsibilities,
      disponibilidad:professional.disponibilidad,
      availability:professional.availability,
      centrosExternos:professional.centrosExternos,
      externalCenters:professional.externalCenters
    });
  });

  const students = (state.students || []).map((student, index) => {
    const alias = `ALUMNO_${index + 1}`;
    studentAliases.set(student.id, alias);
    return compact({
      alias,
      curso:student.curso,
      grupoClase:student.grupoClase,
      activo:student.activo !== false,
      horasPTObjetivoMin:student.horasPTObjetivoMin || 0,
      horasALObjetivoMin:student.horasALObjetivoMin || 0
    });
  });

  const groups = (state.groups || []).map((group, index) => compact({
    alias:`APOYO_${index + 1}`,
    tipo:group.tipo,
    activo:group.activo !== false,
    professional:professionalAliases.get(group.professionalId) || null,
    students:(group.studentIds || []).map(id => studentAliases.get(id)).filter(Boolean)
  }));

  return {
    schoolSettings:cloneJson(state.schoolSettings || {}),
    centerPlanningSettings:cloneJson(state.centerPlanningSettings || {}),
    supportRules:cloneJson(state.automationSettings || { id:'automation', courseRules:{} }),
    professionals,
    students,
    supportGroups:groups,
    existingSchedule:{
      classBlocks:(state.classSchedules || []).length,
      supportSessions:(state.sessions || []).length
    }
  };
}

export function buildAiCenterConfigurationPrompt(state) {
  const context = buildAiCenterConfigurationContext(state);
  const outputShape = {
    schema:AI_CONFIG_SCHEMA,
    summary:['Explica brevemente las decisiones propuestas.'],
    planning:{
      generation:{},
      curriculum:{},
      temporalPatterns:{}
    },
    supportPolicies:[{
      course:'1º',
      subject:'Materia',
      extraction:'blocked | pt | al | ptal',
      preference:'preferred | neutral | avoid',
      reason:'Motivo breve'
    }],
    warnings:['Incompatibilidades o datos insuficientes.'],
    questions:['Solo preguntas imprescindibles que no puedan inferirse.']
  };

  return [
    'Actúa como asistente de configuración de un planificador de horarios escolares.',
    '',
    'OBJETIVO',
    'Ayúdame a completar o revisar la configuración necesaria para generar el horario semanal del centro y coordinar las capas PT y AL.',
    'No des de alta un centro nuevo y no generes un horario libre en texto. Propón únicamente configuración.',
    '',
    'MODELO DEL PRODUCTO',
    '- Existe un horario académico base del centro y dos capas de apoyo: PT y AL.',
    '- Una clase ordinaria puede coincidir con PT/AL para parte del alumnado solo cuando la materia de origen permite esa extracción.',
    '- Un mismo alumno no puede estar simultáneamente en PT y AL.',
    '- Un mismo profesional no puede atender dos tareas incompatibles a la vez.',
    '- Las restricciones duras y las preferencias deben mantenerse separadas.',
    '- Una preferencia nunca debe convertir por sí sola una configuración factible en imposible.',
    '',
    'REGLAS PARA TU RESPUESTA',
    '- No inventes docentes, alumnos, clases, cursos ni disponibilidades.',
    '- Si falta un dato imprescindible, inclúyelo en questions en lugar de inventarlo.',
    '- Conserva los minutos y las restricciones proporcionadas.',
    '- Respeta supportRules: subjectPolicies expresa la compatibilidad dura de extracción y subjectPriorities expresa la preferencia heredada.',
    '- Para extracción usa solo blocked, pt, al o ptal.',
    '- Para preferencia usa solo preferred, neutral o avoid.',
    '- Devuelve JSON válido y nada fuera del JSON.',
    '',
    'PRIVACIDAD',
    'Los nombres del alumnado, nombres del profesorado, correos y diagnósticos no se incluyen. Los identificadores PROF_n y ALUMNO_n son alias locales.',
    '',
    'CONFIGURACIÓN ACTUAL ANONIMIZADA',
    JSON.stringify(context, null, 2),
    '',
    'FORMATO DE SALIDA',
    JSON.stringify(outputShape, null, 2)
  ].join('\n');
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function cloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
}
