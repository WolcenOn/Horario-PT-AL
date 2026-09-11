import { DAYS } from './constants.js';
import { courseForClassGroup, recessForStage, stageForCourse } from './education.js';
import { minutesToTime, timeToMinutes } from './utils.js';

const STEP = 15;

export function buildClassWeekOverview(state, classGroup) {
  const generation = state?.centerPlanningSettings?.generation || {};
  const scheduled = (state?.classSchedules || [])
    .filter(entry => normalize(entry.grupoClase) === normalize(classGroup))
    .map(entry => ({ ...entry, start:timeToMinutes(entry.inicio), end:timeToMinutes(entry.fin) }))
    .filter(entry => Number.isFinite(entry.start) && Number.isFinite(entry.end) && entry.end > entry.start);

  const course = courseForClassGroup(state?.schoolSettings, classGroup);
  const stage = stageForCourse(course);
  const recess = recessForStage(state?.schoolSettings, stage);
  const recessStart = timeToMinutes(recess?.inicio);
  const recessEnd = timeToMinutes(recess?.fin);
  const defaultStart = validMinute(generation.start, 9 * 60);
  const defaultEnd = validMinute(generation.end, 14 * 60);
  const starts = [defaultStart, ...scheduled.map(item => item.start), ...(Number.isFinite(recessStart) ? [recessStart] : [])];
  const ends = [defaultEnd, ...scheduled.map(item => item.end), ...(Number.isFinite(recessEnd) ? [recessEnd] : [])];
  const start = Math.floor(Math.min(...starts) / STEP) * STEP;
  const end = Math.ceil(Math.max(...ends) / STEP) * STEP;

  const days = DAYS.map(day => {
    const entries = scheduled.filter(item => item.dia === day.id).sort((a,b) => a.start - b.start);
    const intervals = entries.map(item => [item.start, item.end]);
    if (Number.isFinite(recessStart) && Number.isFinite(recessEnd) && recessEnd > recessStart) intervals.push([recessStart, recessEnd]);
    return {
      id:day.id,
      label:day.label,
      entries,
      recess:Number.isFinite(recessStart) && Number.isFinite(recessEnd) && recessEnd > recessStart ? { inicio:recess.inicio, fin:recess.fin, start:recessStart, end:recessEnd } : null,
      gaps:freeGaps(intervals, start, end)
    };
  });

  return { classGroup, course, stage, start, end, startLabel:minutesToTime(start), endLabel:minutesToTime(end), duration:end-start, days };
}

export function freeGaps(intervals, start, end) {
  const merged = intervals
    .map(([a,b]) => [Math.max(start,a), Math.min(end,b)])
    .filter(([a,b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a,b) => a[0]-b[0])
    .reduce((acc,current) => {
      const last = acc.at(-1);
      if (!last || current[0] > last[1]) acc.push([...current]);
      else last[1] = Math.max(last[1], current[1]);
      return acc;
    }, []);
  const gaps = [];
  let cursor = start;
  for (const [a,b] of merged) {
    if (a > cursor) gaps.push({ start:cursor, end:a, inicio:minutesToTime(cursor), fin:minutesToTime(a), minutes:a-cursor });
    cursor = Math.max(cursor,b);
  }
  if (cursor < end) gaps.push({ start:cursor, end, inicio:minutesToTime(cursor), fin:minutesToTime(end), minutes:end-cursor });
  return gaps;
}

function validMinute(value, fallback) {
  const minute = timeToMinutes(value);
  return Number.isFinite(minute) ? minute : fallback;
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
