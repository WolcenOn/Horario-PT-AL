import { buildCapacityStudy } from './capacity-analysis.js';

export function buildStaffingSolverPayload(state) {
  const study = buildCapacityStudy(state);
  return {
    study,
    payload:{
      group_ids:[...study.classes],
      teachers:study.teachers.map(teacher => ({
        id:teacher.id,
        name:teacher.name,
        role:teacher.teacherRole,
        available_minutes:Math.max(0, teacher.capacityMinutes - teacher.nonOrdinaryMinutes),
        allowed_subjects:[...teacher.allowedSubjects],
        specialty_subjects:[...teacher.specialtySubjects],
        tutor_preference:teacher.tutorPreference,
        fixed_tutor_group:teacher.tutorGroup || null,
        minimum_tutor_minutes:teacher.minimumTutorMinutes || 0
      })),
      requirements:study.requirements.map(requirement => ({
        id:requirement.id,
        group_id:requirement.grupoClase,
        subject:requirement.subject,
        minutes:requirement.minutes,
        fixed_teacher_id:requirement.fixedTeacherIds.length === 1 ? requirement.fixedTeacherIds[0] : null
      }))
    }
  };
}
