export const SUPPORT_SERVICES = ['PT', 'AL'];

export function studentServices(student, groups = []) {
  if (!student) return [];
  const result = new Set();
  if ((Number(student.horasPTObjetivoMin) || 0) > 0) result.add('PT');
  if ((Number(student.horasALObjetivoMin) || 0) > 0) result.add('AL');
  for (const group of groups || []) {
    if (!(group.studentIds || []).includes(student.id)) continue;
    if (SUPPORT_SERVICES.includes(group.tipo)) result.add(group.tipo);
  }
  return SUPPORT_SERVICES.filter(service => result.has(service));
}

export function studentServiceKey(student, groups = []) {
  const services = studentServices(student, groups);
  if (services.length === 2) return 'PT+AL';
  if (services.length === 1) return services[0];
  return 'NONE';
}

export function studentHasService(student, service, groups = []) {
  return studentServices(student, groups).includes(service);
}
