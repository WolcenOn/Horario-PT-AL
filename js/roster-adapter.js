import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { studentServices } from './student-services.js';

export function buildRosterPayload(state, adapterResult = buildGestorEscuelaConfiguration(state)) {
  const classMappings = adapterResult?.report?.mappings?.classGroups || {};
  const errors = [];
  const students = (state.students || []).map(student => {
    const classKey = normalize(student.grupoClase);
    const groupId = classKey ? classMappings[classKey] || null : null;
    if (student.grupoClase && !groupId) {
      errors.push(`${student.nombre || ''} ${student.apellidos || ''}: no se pudo enlazar la clase ${student.grupoClase}.`.trim());
    }
    const services = studentServices(student, state.groups);
    return {
      id:String(student.id || '').slice(0,64),
      first_name:String(student.nombre || '').trim(),
      last_name:String(student.apellidos || '').trim(),
      group_id:groupId,
      active:student.activo !== false,
      notes:String(student.observaciones || '').trim() || null,
      supports:services.map(service => ({
        service,
        target_minutes:service === 'PT'
          ? Math.max(0, Math.round(Number(student.horasPTObjetivoMin) || 0))
          : Math.max(0, Math.round(Number(student.horasALObjetivoMin) || 0)),
        notes:null
      }))
    };
  });
  for (const student of students) {
    if (!student.id || !student.first_name || !student.last_name) {
      errors.push('Hay alumnos sin identificador, nombre o apellidos completos.');
      break;
    }
  }
  return {
    adapterResult,
    payload:{ students },
    report:{
      ready:errors.length === 0,
      errors:[...new Set(errors)],
      counts:{
        students:students.length,
        pt:students.filter(item => item.supports.some(support => support.service === 'PT')).length,
        al:students.filter(item => item.supports.some(support => support.service === 'AL')).length,
        both:students.filter(item => item.supports.length === 2).length
      }
    }
  };
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
