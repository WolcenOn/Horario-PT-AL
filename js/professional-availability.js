import { minutesToTime, overlapInterval, timeToMinutes } from './utils.js';

export function externalBlocksForDay(professional, dayId) {
  const blocks = professional?.bloqueosExternos?.[dayId];
  return Array.isArray(blocks) ? blocks.filter(isValidExternalBlock) : [];
}

export function externalBlockOverlap(professional, dayId, inicio, fin) {
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  for (const block of externalBlocksForDay(professional, dayId)) {
    const overlap = overlapInterval(start, end, timeToMinutes(block.inicio), timeToMinutes(block.fin));
    if (overlap) return { ...block, overlap };
  }
  return null;
}

export function isInsideProfessionalAvailability(professional, dayId, inicio, fin) {
  const start = timeToMinutes(inicio);
  const end = timeToMinutes(fin);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const intervals = professional?.disponibilidad?.[dayId] || [];
  return intervals.some(interval => {
    const intervalStart = timeToMinutes(interval.inicio);
    const intervalEnd = timeToMinutes(interval.fin);
    return Number.isFinite(intervalStart) && Number.isFinite(intervalEnd) && start >= intervalStart && end <= intervalEnd;
  });
}

export function professionalCanWork(professional, dayId, inicio, fin) {
  return isInsideProfessionalAvailability(professional, dayId, inicio, fin)
    && !externalBlockOverlap(professional, dayId, inicio, fin);
}

export function normalizeExternalBlocks(value) {
  const result = {};
  for (const [dayId, rawBlocks] of Object.entries(value || {})) {
    const blocks = Array.isArray(rawBlocks) ? rawBlocks : [];
    result[dayId] = blocks
      .filter(block => block && typeof block === 'object')
      .map(block => ({
        centro:String(block.centro || '').trim(),
        inicio:typeof block.inicio === 'string' ? block.inicio : '',
        fin:typeof block.fin === 'string' ? block.fin : ''
      }))
      .filter(isValidExternalBlock);
  }
  return result;
}

export function effectiveAvailability(baseAvailability, externalBlocks) {
  const result = {};
  for (const [dayId, rawIntervals] of Object.entries(baseAvailability || {})) {
    let intervals = (Array.isArray(rawIntervals) ? rawIntervals : [])
      .map(interval => ({ inicio:interval?.inicio || '', fin:interval?.fin || '' }))
      .filter(isValidInterval);
    const blocks = (externalBlocks?.[dayId] || []).filter(isValidExternalBlock)
      .sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));

    for (const block of blocks) {
      const blockStart = timeToMinutes(block.inicio);
      const blockEnd = timeToMinutes(block.fin);
      const next = [];
      for (const interval of intervals) {
        const start = timeToMinutes(interval.inicio);
        const end = timeToMinutes(interval.fin);
        const overlap = overlapInterval(start, end, blockStart, blockEnd);
        if (!overlap) {
          next.push(interval);
          continue;
        }
        if (blockStart > start) next.push({ inicio:minutesToTime(start), fin:minutesToTime(Math.min(blockStart, end)) });
        if (blockEnd < end) next.push({ inicio:minutesToTime(Math.max(blockEnd, start)), fin:minutesToTime(end) });
      }
      intervals = next.filter(isValidInterval);
    }
    result[dayId] = intervals;
  }
  return result;
}

function isValidExternalBlock(block) {
  const start = timeToMinutes(block?.inicio);
  const end = timeToMinutes(block?.fin);
  return Boolean(String(block?.centro || '').trim()) && Number.isFinite(start) && Number.isFinite(end) && end > start;
}

function isValidInterval(interval) {
  const start = timeToMinutes(interval?.inicio);
  const end = timeToMinutes(interval?.fin);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}
