import { DAYS } from './constants.js';
import { timeToMinutes } from './utils.js';

const DAY_IDS = new Set(DAYS.map(day => day.id));

export const EMPTY_TIME_PATTERN = Object.freeze({
  sessionMinutes:0,
  minSessionMinutes:0,
  maxSessionMinutes:0,
  maxSessionsPerDay:0,
  allowedDays:[],
  preferredDays:[],
  earliestStart:'',
  latestEnd:'',
  preferredStart:'',
  preferredEnd:''
});

export function normalizeTimePattern(value) {
  const source = value && typeof value === 'object' ? value : {};
  const allowedDays = normalizeDays(source.allowedDays);
  const allowedSet = new Set(allowedDays);
  const preferredDays = normalizeDays(source.preferredDays)
    .filter(day => !allowedDays.length || allowedSet.has(day));
  return {
    sessionMinutes:clampOptionalInteger(source.sessionMinutes, 15, 180),
    minSessionMinutes:clampOptionalInteger(source.minSessionMinutes, 15, 180),
    maxSessionMinutes:clampOptionalInteger(source.maxSessionMinutes, 15, 180),
    maxSessionsPerDay:clampOptionalInteger(source.maxSessionsPerDay, 1, 5),
    allowedDays,
    preferredDays,
    earliestStart:validTime(source.earliestStart) ? source.earliestStart : '',
    latestEnd:validTime(source.latestEnd) ? source.latestEnd : '',
    preferredStart:validTime(source.preferredStart) ? source.preferredStart : '',
    preferredEnd:validTime(source.preferredEnd) ? source.preferredEnd : ''
  };
}

export function normalizeSubjectPatterns(value) {
  const result = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [course, subjects] of Object.entries(value)) {
    if (!course || !subjects || typeof subjects !== 'object' || Array.isArray(subjects)) continue;
    const normalizedSubjects = {};
    for (const [subject, rawPattern] of Object.entries(subjects)) {
      if (!subject) continue;
      const pattern = normalizeTimePattern(rawPattern);
      if (!isEmptyPattern(pattern)) normalizedSubjects[subject] = pattern;
    }
    if (Object.keys(normalizedSubjects).length) result[course] = normalizedSubjects;
  }
  return result;
}

export function subjectPatternForCourse(settings, course, subject) {
  return normalizeTimePattern(settings?.subjectPatterns?.[course]?.[subject]);
}

export function normalizeScheduledSlots(value) {
  if (!Array.isArray(value)) return [];
  const result = [];
  const seen = new Set();
  for (const raw of value) {
    const dia = DAY_IDS.has(raw?.dia) ? raw.dia : '';
    const inicio = validTime(raw?.inicio) ? raw.inicio : '';
    const fin = validTime(raw?.fin) ? raw.fin : '';
    if (!dia || !inicio || !fin || timeToMinutes(fin) <= timeToMinutes(inicio)) continue;
    const teacherIds = uniqueStrings(raw?.teacherIds);
    const key = `${dia}|${inicio}|${fin}|${teacherIds.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ dia, inicio, fin, teacherIds });
  }
  return result.sort((a, b) => dayIndex(a.dia) - dayIndex(b.dia) || a.inicio.localeCompare(b.inicio));
}

export function dayAllowed(pattern, dayId) {
  const normalized = normalizeTimePattern(pattern);
  return !normalized.allowedDays.length || normalized.allowedDays.includes(dayId);
}

export function timeWindowAllows(pattern, start, end) {
  const normalized = normalizeTimePattern(pattern);
  const earliest = normalized.earliestStart ? timeToMinutes(normalized.earliestStart) : null;
  const latest = normalized.latestEnd ? timeToMinutes(normalized.latestEnd) : null;
  if (Number.isFinite(earliest) && start < earliest) return false;
  if (Number.isFinite(latest) && end > latest) return false;
  return true;
}

export function timePreferenceScore(pattern, dayId, start, end) {
  const normalized = normalizeTimePattern(pattern);
  let score = 0;
  if (normalized.preferredDays.includes(dayId)) score += 45;
  const preferredStart = normalized.preferredStart ? timeToMinutes(normalized.preferredStart) : null;
  const preferredEnd = normalized.preferredEnd ? timeToMinutes(normalized.preferredEnd) : null;
  if (Number.isFinite(preferredStart) || Number.isFinite(preferredEnd)) {
    const insideStart = !Number.isFinite(preferredStart) || start >= preferredStart;
    const insideEnd = !Number.isFinite(preferredEnd) || end <= preferredEnd;
    if (insideStart && insideEnd) score += 35;
  }
  return score;
}

export function effectiveSessionMinutes(pattern, fallback) {
  const normalized = normalizeTimePattern(pattern);
  return normalized.sessionMinutes || fallback;
}

export function effectiveMaxSessionsPerDay(pattern, fallback) {
  const normalized = normalizeTimePattern(pattern);
  return normalized.maxSessionsPerDay || fallback;
}

export function planSessionDurations(totalMinutes, pattern, fallbackMinutes, stepMinutes = 15) {
  const normalized = validateTimePattern(pattern);
  const total = Math.round(Number(totalMinutes));
  const step = Math.round(Number(stepMinutes));
  const fallback = Math.round(Number(fallbackMinutes));
  if (!Number.isFinite(total) || total <= 0) return [];
  if (!Number.isFinite(step) || step <= 0 || total % step !== 0) {
    throw new Error(`La carga semanal de ${total} min no encaja en la rejilla de ${step || 15} min.`);
  }

  const preferred = normalized.sessionMinutes || fallback;
  if (!Number.isFinite(preferred) || preferred <= 0) {
    throw new Error('Define una duración habitual válida para repartir la carga semanal.');
  }

  const hasRange = Boolean(normalized.minSessionMinutes || normalized.maxSessionMinutes);
  if (!hasRange) return splitLegacy(total, preferred);

  const min = normalized.minSessionMinutes || step;
  const max = normalized.maxSessionMinutes || Math.max(preferred, 180);
  for (const [label, value] of [['mínima', min], ['preferida', preferred], ['máxima', max]]) {
    if (value % step !== 0) throw new Error(`La duración ${label} de ${value} min no encaja en la rejilla de ${step} min.`);
  }

  const target = Math.max(min, Math.min(max, preferred));
  const minCount = Math.max(1, Math.ceil(total / max));
  const maxCount = Math.floor(total / min);
  if (minCount > maxCount) {
    throw new Error(`La carga de ${total} min no puede repartirse en sesiones de ${min}–${max} min.`);
  }

  let best = null;
  for (let count = minCount; count <= maxCount; count++) {
    const durations = distributeDurations(total, count, min, max, target, step);
    if (!durations) continue;
    const distance = durations.reduce((sum, value) => sum + Math.abs(value - target), 0);
    const spread = Math.max(...durations) - Math.min(...durations);
    const candidate = { durations, distance, spread, count };
    if (!best
      || candidate.distance < best.distance
      || (candidate.distance === best.distance && candidate.spread < best.spread)
      || (candidate.distance === best.distance && candidate.spread === best.spread && candidate.count < best.count)) {
      best = candidate;
    }
  }
  if (!best) throw new Error(`La carga de ${total} min no puede repartirse en sesiones de ${min}–${max} min.`);
  return best.durations;
}

export function validateTimePattern(pattern, label = 'Patrón temporal') {
  const normalized = normalizeTimePattern(pattern);
  if (normalized.minSessionMinutes && normalized.maxSessionMinutes && normalized.minSessionMinutes > normalized.maxSessionMinutes) {
    throw new Error(`${label}: la duración mínima no puede superar la máxima.`);
  }
  if (normalized.sessionMinutes && normalized.minSessionMinutes && normalized.sessionMinutes < normalized.minSessionMinutes) {
    throw new Error(`${label}: la duración preferida no puede ser menor que la mínima.`);
  }
  if (normalized.sessionMinutes && normalized.maxSessionMinutes && normalized.sessionMinutes > normalized.maxSessionMinutes) {
    throw new Error(`${label}: la duración preferida no puede superar la máxima.`);
  }
  const earliest = normalized.earliestStart ? timeToMinutes(normalized.earliestStart) : null;
  const latest = normalized.latestEnd ? timeToMinutes(normalized.latestEnd) : null;
  if (Number.isFinite(earliest) && Number.isFinite(latest) && latest <= earliest) {
    throw new Error(`${label}: la hora límite debe ser posterior a la hora inicial.`);
  }
  const preferredStart = normalized.preferredStart ? timeToMinutes(normalized.preferredStart) : null;
  const preferredEnd = normalized.preferredEnd ? timeToMinutes(normalized.preferredEnd) : null;
  if (Number.isFinite(preferredStart) && Number.isFinite(preferredEnd) && preferredEnd <= preferredStart) {
    throw new Error(`${label}: la franja preferida tiene un inicio y fin incompatibles.`);
  }
  if (Number.isFinite(earliest) && Number.isFinite(preferredStart) && preferredStart < earliest) {
    throw new Error(`${label}: la franja preferida empieza antes de la ventana permitida.`);
  }
  if (Number.isFinite(latest) && Number.isFinite(preferredEnd) && preferredEnd > latest) {
    throw new Error(`${label}: la franja preferida termina después de la ventana permitida.`);
  }
  return normalized;
}

export function describeTimePattern(pattern) {
  const normalized = normalizeTimePattern(pattern);
  const parts = [];
  if (normalized.sessionMinutes) parts.push(`preferida ${normalized.sessionMinutes} min`);
  if (normalized.minSessionMinutes || normalized.maxSessionMinutes) {
    parts.push(`rango ${normalized.minSessionMinutes || 'libre'}–${normalized.maxSessionMinutes || 'libre'} min`);
  }
  if (normalized.maxSessionsPerDay) parts.push(`máx. ${normalized.maxSessionsPerDay}/día`);
  if (normalized.allowedDays.length && normalized.allowedDays.length < DAYS.length) {
    parts.push(`días: ${normalized.allowedDays.map(dayLabel).join(', ')}`);
  }
  if (normalized.earliestStart || normalized.latestEnd) {
    parts.push(`${normalized.earliestStart || 'inicio'}–${normalized.latestEnd || 'fin'}`);
  }
  if (normalized.preferredDays.length) parts.push(`preferencia: ${normalized.preferredDays.map(dayLabel).join(', ')}`);
  if (normalized.preferredStart || normalized.preferredEnd) {
    parts.push(`franja preferida ${normalized.preferredStart || 'inicio'}–${normalized.preferredEnd || 'fin'}`);
  }
  return parts.join(' · ') || 'Sin restricciones temporales específicas';
}

function distributeDurations(total, count, min, max, target, step) {
  const durations = Array(count).fill(min);
  let remaining = total - (count * min);
  if (remaining < 0 || remaining % step !== 0) return null;
  const addRound = limit => {
    let changed = true;
    while (remaining > 0 && changed) {
      changed = false;
      for (let index = 0; index < durations.length && remaining > 0; index++) {
        if (durations[index] + step > limit || durations[index] + step > max) continue;
        durations[index] += step;
        remaining -= step;
        changed = true;
      }
    }
  };
  addRound(target);
  addRound(max);
  return remaining === 0 ? durations.sort((a, b) => b - a) : null;
}

function splitLegacy(total, standard) {
  const result = [];
  let remaining = total;
  while (remaining > standard) {
    result.push(standard);
    remaining -= standard;
  }
  if (remaining > 0) result.push(remaining);
  return result;
}

function normalizeDays(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(day => String(day || '').trim()).filter(day => DAY_IDS.has(day)))];
}

function uniqueStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

function validTime(value) {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) && Number.isFinite(timeToMinutes(value));
}

function clampOptionalInteger(value, min, max) {
  if (value === '' || value === null || value === undefined) return 0;
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(min, Math.min(max, numeric));
}

function isEmptyPattern(pattern) {
  return !pattern.sessionMinutes
    && !pattern.minSessionMinutes
    && !pattern.maxSessionMinutes
    && !pattern.maxSessionsPerDay
    && !pattern.allowedDays.length
    && !pattern.preferredDays.length
    && !pattern.earliestStart
    && !pattern.latestEnd
    && !pattern.preferredStart
    && !pattern.preferredEnd;
}

function dayLabel(dayId) {
  return DAYS.find(day => day.id === dayId)?.label || dayId;
}

function dayIndex(dayId) {
  const index = DAYS.findIndex(day => day.id === dayId);
  return index < 0 ? 99 : index;
}
