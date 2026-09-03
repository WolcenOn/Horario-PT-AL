export function uid(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function timeToMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [h, m] = value.split(':').map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return NaN;
  return h * 60 + m;
}

export function minutesToTime(total) {
  const safe = Math.max(0, Math.round(total));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatDuration(totalMinutes) {
  const minutes = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  if (!m) return `${h} h`;
  return `${h} h ${m} min`;
}

export function overlapInterval(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return end > start ? { start, end, duration: end - start } : null;
}

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function fullName(student) {
  return [student?.nombre, student?.apellidos].filter(Boolean).join(' ').trim();
}

export function targetFromParts(hours, minutes) {
  const h = Number(hours || 0);
  const m = Number(minutes || 0);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || m < 0 || m > 59) return NaN;
  return Math.round(h * 60 + m);
}

export function minutesParts(total = 0) {
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

export function compareByName(a, b) {
  return String(a.nombre || a.name || '').localeCompare(String(b.nombre || b.name || ''), 'es', { sensitivity: 'base' });
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
