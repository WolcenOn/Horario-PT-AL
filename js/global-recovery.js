import { DAYS } from './constants.js';
import { normalizeCenterPlanningSettings } from './center-planning.js';
import { subjectPatternForCourse } from './time-patterns.js';

/**
 * Detecta límites de distribución que hacen matemáticamente imposible
 * repartir una materia, antes de culpar al algoritmo de búsqueda.
 *
 * El máximo global funciona como una preferencia general. Si una materia
 * necesita objetivamente más sesiones por día para poder repartir su carga
 * semanal y no tiene un máximo específico configurado, proponemos elevar
 * únicamente ese límite global.
 */
export function analyzeGlobalDistributionLimits(rawSettings) {
  const settings = normalizeCenterPlanningSettings(rawSettings);
  const generation = settings.generation;
  const issues = [];
  let suggestedGlobalMax = generation.maxSameSubjectPerDay;

  for (const [course, subjects] of Object.entries(settings.curriculum || {})) {
    for (const [subject, totalMinutes] of Object.entries(subjects || {})) {
      const pattern = subjectPatternForCourse(settings, course, subject);
      const sessionMinutes = pattern.sessionMinutes || generation.lessonMinutes;
      if (!sessionMinutes || totalMinutes <= 0) continue;

      const allowedDays = pattern.allowedDays.length || DAYS.length;
      const blockCount = Math.ceil(totalMinutes / sessionMinutes);
      const configuredMax = pattern.maxSessionsPerDay || generation.maxSameSubjectPerDay;
      const capacityBlocks = configuredMax * allowedDays;
      if (blockCount <= capacityBlocks) continue;

      const minimumPerDay = Math.ceil(blockCount / allowedDays);
      const explicitSubjectMax = pattern.maxSessionsPerDay > 0;
      if (!explicitSubjectMax) suggestedGlobalMax = Math.max(suggestedGlobalMax, minimumPerDay);

      issues.push({
        course,
        subject,
        totalMinutes,
        sessionMinutes,
        blockCount,
        allowedDays,
        configuredMax,
        capacityBlocks,
        minimumPerDay,
        explicitSubjectMax
      });
    }
  }

  return {
    issues,
    suggestedGlobalMax,
    canFixWithGlobalMax:issues.some(issue => !issue.explicitSubjectMax)
  };
}

export function describeDistributionIssue(issue) {
  const dayText = issue.allowedDays === 1 ? '1 día permitido' : `${issue.allowedDays} días permitidos`;
  return `${issue.course} · ${issue.subject}: ${issue.totalMinutes} min = ${issue.blockCount} bloques de ${issue.sessionMinutes} min; con máximo ${issue.configuredMax}/día y ${dayText} solo caben ${issue.capacityBlocks}. Necesita al menos ${issue.minimumPerDay}/día.`;
}
