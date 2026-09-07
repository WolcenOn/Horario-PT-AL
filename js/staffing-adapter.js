import { buildCapacityStudy } from './capacity-analysis.js';

export function buildStaffingSolverPayload(state) {
  const study = buildCapacityStudy(state);
  const knownTeachers = new Set(study.teachers.map(item => item.id));
  const knownGroups = new Set(study.classes);
  const activities = (study.settings.weeklyActivities || [])
    .filter(activity => activity.active !== false)
    .map(activity => ({
      id:activity.id,
      name:activity.name,
      minutes:activity.weeklyMinutes,
      required_staff:Math.max(activity.requiredStaff, activity.assignedTeacherIds.length),
      fixed_teacher_ids:activity.assignedTeacherIds.filter(id => knownTeachers.has(id)),
      eligible_teacher_ids:[...new Set([
        ...activity.assignedTeacherIds,
        ...activity.eligibleTeacherIds
      ])].filter(id => knownTeachers.has(id)),
      group_ids:activity.classGroupIds.filter(group => knownGroups.has(group))
    }));
  return {
    study,
    payload:{
      group_ids:[...study.classes],
      teachers:study.teachers.map(teacher => ({
        id:teacher.id,
        name:teacher.name,
        role:teacher.teacherRole,
        // Activities are solved in this same CP-SAT model, so only already-fixed PT/AL and
        // professional responsibilities are removed from the base capacity here.
        available_minutes:Math.max(
          0,
          teacher.capacityMinutes - teacher.responsibilityMinutes - teacher.ptalMinutes
        ),
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
        fixed_teacher_id:requirement.fixedTeacherIds.length === 1
          ? requirement.fixedTeacherIds[0]
          : null
      })),
      activities
    }
  };
}
