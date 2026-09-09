import { DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { buildProfessionalSchedule } from './professional-schedule.js';
import { escapeHtml, timeToMinutes } from './utils.js';

export function printProfessionalSchedules(state, professionalIds) {
  const ids = unique(professionalIds);
  const models = ids.map(id => buildProfessionalSchedule(state, id)).filter(Boolean);
  if (!models.length) throw new Error('Selecciona al menos un docente con horario para imprimir.');
  openPrintDocument({
    title:models.length === 1 ? `Horario · ${models[0].professional.nombre}` : `Horarios de profesorado · ${models.length} docentes`,
    pages:models.map(model => renderWeeklyPage(model))
  });
}

export function printDailySubstitutionSchedules(state, items, date) {
  const normalizedDate = String(date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) throw new Error('No se pudo determinar la fecha del plan diario.');
  const dayId = dayIdForDate(normalizedDate);
  if (!dayId) throw new Error('La fecha seleccionada no corresponde a un día lectivo de lunes a viernes.');

  const pages = [];
  for (const item of items || []) {
    const model = buildProfessionalSchedule(state, item.professionalId);
    if (!model) continue;
    const substitutions = (item.substitutions || []).map(substitution => ({
      kind:'substitution',
      dia:dayId,
      inicio:String(substitution.inicio || ''),
      fin:String(substitution.fin || ''),
      title:`Sustitución · ${substitution.grupo || 'Grupo'}`,
      detail:substitution.absentTeacher ? `Ausencia de ${substitution.absentTeacher}` : 'Cobertura por ausencia',
      location:'',
      minutes:duration(substitution.inicio, substitution.fin)
    })).filter(entry => entry.minutes > 0);
    if (!substitutions.length) continue;
    pages.push(renderDailyPage(model, dayId, normalizedDate, substitutions));
  }
  if (!pages.length) throw new Error('No hay sustituciones imprimibles para los docentes seleccionados.');
  openPrintDocument({ title:`Horarios de sustitución · ${normalizedDate}`, pages });
}

export function dayIdForDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
  const index = date.getDay();
  return index >= 1 && index <= 5 ? DAYS[index - 1]?.id || null : null;
}

export function dailyPrintEntries(state, professionalId, date, substitutions = []) {
  const model = buildProfessionalSchedule(state, professionalId);
  const dayId = dayIdForDate(date);
  if (!model || !dayId) return [];
  return [
    ...(model.byDay[dayId] || []),
    ...substitutions.map(item => ({
      kind:'substitution',
      dia:dayId,
      inicio:item.inicio,
      fin:item.fin,
      title:`Sustitución · ${item.grupo || 'Grupo'}`,
      detail:item.absentTeacher ? `Ausencia de ${item.absentTeacher}` : 'Cobertura por ausencia',
      location:'',
      minutes:duration(item.inicio, item.fin)
    }))
  ].filter(item => duration(item.inicio, item.fin) > 0)
    .sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
}

function renderWeeklyPage(model) {
  const entries = model.entries.filter(item => item.kind !== 'external' || item.minutes > 0);
  const range = printRange(entries);
  return `<section class="print-page">
    ${pageHeader(model.professional.nombre, `${model.professional.especialidad || model.professional.tipo || 'Docente'} · Horario semanal`)}
    ${renderCalendar(entries, range.start, range.end)}
    ${pageFooter('Horario semanal del docente')}
  </section>`;
}

function renderDailyPage(model, dayId, date, substitutions) {
  const regular = model.byDay[dayId] || [];
  const entries = [...regular, ...substitutions].sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio));
  const range = printRange(entries);
  const day = DAYS.find(item => item.id === dayId);
  return `<section class="print-page">
    ${pageHeader(model.professional.nombre, `${day?.label || dayId} · ${formatDate(date)} · horario con sustituciones`)}
    <div class="daily-note"><strong>Plan diario.</strong> Los bloques marcados como “Sustitución” proceden de la propuesta de GestorEscuela. Si coinciden con una actividad flexible del horario habitual, prevalece el plan diario confirmado por Jefatura.</div>
    ${renderCalendar(entries, range.start, range.end, [dayId])}
    ${pageFooter('Horario diario con sustituciones')}
  </section>`;
}

function renderCalendar(entries, start, end, dayIds = DAYS.map(day => day.id)) {
  const pxPerMinute = dayIds.length === 1 ? 1.45 : 1.12;
  const height = Math.max(420, (end - start) * pxPerMinute);
  const labels = [];
  for (let minute = start; minute <= end; minute += 30) {
    labels.push(`<span class="time-label" style="top:${(minute - start) * pxPerMinute}px">${toTime(minute)}</span>`);
  }
  const days = dayIds.map(id => DAYS.find(day => day.id === id)).filter(Boolean);
  const columns = days.map(day => {
    const blocks = entries.filter(entry => entry.dia === day.id).map(entry => {
      const begin = timeToMinutes(entry.inicio);
      const finish = timeToMinutes(entry.fin);
      if (!Number.isFinite(begin) || !Number.isFinite(finish) || finish <= begin) return '';
      const top = (begin - start) * pxPerMinute;
      const blockHeight = Math.max(30, (finish - begin) * pxPerMinute);
      return `<div class="entry kind-${escapeHtml(entry.kind || 'class')}" style="top:${top}px;height:${blockHeight}px">
        <strong>${escapeHtml(entry.title || 'Bloque')}</strong>
        <span class="time">${escapeHtml(entry.inicio)}–${escapeHtml(entry.fin)}</span>
        ${entry.detail ? `<span>${escapeHtml(entry.detail)}</span>` : ''}
        ${entry.location ? `<span>${escapeHtml(entry.location)}</span>` : ''}
      </div>`;
    }).join('');
    return `<section class="day"><h2>${escapeHtml(day.label)}</h2><div class="day-body" style="height:${height}px">${blocks}</div></section>`;
  }).join('');
  return `<div class="calendar" style="--days:${days.length}"><div class="ruler"><div class="ruler-head"></div><div class="ruler-body" style="height:${height}px">${labels.join('')}</div></div>${columns}</div>`;
}

function pageHeader(name, subtitle) {
  return `<header><div><p class="eyebrow">Horario del profesorado</p><h1>${escapeHtml(name || 'Docente')}</h1><p>${escapeHtml(subtitle)}</p></div><div class="stamp">Horario PT / AL · Centro completo</div></header>`;
}

function pageFooter(label) {
  return `<footer><span>${escapeHtml(label)}</span><span>Generado ${escapeHtml(new Date().toLocaleString('es-ES'))}</span></footer>`;
}

function printRange(entries) {
  const valid = entries.filter(item => Number.isFinite(timeToMinutes(item.inicio)) && Number.isFinite(timeToMinutes(item.fin)));
  const start = valid.length ? Math.min(DEFAULT_CALENDAR_START, ...valid.map(item => timeToMinutes(item.inicio))) : DEFAULT_CALENDAR_START;
  const end = valid.length ? Math.max(DEFAULT_CALENDAR_END, ...valid.map(item => timeToMinutes(item.fin))) : DEFAULT_CALENDAR_END;
  return { start:Math.floor(start / 30) * 30, end:Math.ceil(end / 30) * 30 };
}

function openPrintDocument({ title, pages }) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes para esta página.');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page { size:A4 landscape; margin:9mm; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Arial,sans-serif; color:#17212b; background:white; }
    .print-page { break-after:page; page-break-after:always; min-height:185mm; }
    .print-page:last-child { break-after:auto; page-break-after:auto; }
    header { display:flex; justify-content:space-between; align-items:flex-end; gap:20px; margin-bottom:8px; }
    header .eyebrow { text-transform:uppercase; letter-spacing:.08em; font-size:8px; font-weight:700; color:#6a7782; margin:0 0 2px; }
    h1 { margin:0; font-size:20px; }
    header p { margin:3px 0 0; color:#596875; font-size:10px; }
    .stamp { border:1px solid #cbd5dc; border-radius:999px; padding:5px 9px; font-size:9px; font-weight:700; }
    .daily-note { margin:0 0 7px; border:1px solid #d8e0e5; background:#f7f9fa; border-radius:6px; padding:6px 8px; font-size:8.5px; }
    .calendar { display:grid; grid-template-columns:54px repeat(var(--days), minmax(0,1fr)); border:1px solid #bcc8d0; }
    .ruler { position:relative; border-right:1px solid #bcc8d0; background:#fafbfc; }
    .ruler-head { height:31px; border-bottom:1px solid #bcc8d0; }
    .ruler-body, .day-body { position:relative; background-image:linear-gradient(to bottom,#d9e0e5 1px,transparent 1px),linear-gradient(to bottom,#edf1f4 1px,transparent 1px); background-size:100% 33.6px,100% 16.8px; }
    .time-label { position:absolute; left:5px; transform:translateY(-50%); font-size:8px; color:#65727d; }
    .day { min-width:0; border-right:1px solid #bcc8d0; }
    .day:last-child { border-right:0; }
    .day h2 { height:31px; margin:0; display:grid; place-items:center; border-bottom:1px solid #bcc8d0; font-size:10px; background:#fafbfc; }
    .entry { position:absolute; left:3px; right:3px; border-radius:5px; padding:3px 5px; overflow:hidden; border:1px solid #aabcc8; background:#eef3f6; font-size:8px; line-height:1.18; }
    .entry strong,.entry span { display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .entry .time { font-weight:700; margin:1px 0; }
    .entry.kind-pt { background:#e6f3f8; border-color:#9fc7d7; }
    .entry.kind-al { background:#f0ecf8; border-color:#c6b8e0; }
    .entry.kind-activity { background:#f5f2e8; border-color:#d5c89e; }
    .entry.kind-external { background:#f1f1f1; border-style:dashed; }
    .entry.kind-substitution { background:#fff0d8; border:2px solid #d18418; }
    footer { margin-top:6px; display:flex; justify-content:space-between; font-size:8px; color:#71808b; }
  </style></head><body>${pages.join('')}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),180));<\/script></body></html>`);
  printWindow.document.close();
}

function duration(start, end) {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  return Number.isFinite(a) && Number.isFinite(b) && b > a ? b - a : 0;
}

function toTime(totalMinutes) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function formatDate(value) {
  const [year, month, day] = String(value).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function unique(values) {
  return [...new Set((values || []).map(value => String(value || '').trim()).filter(Boolean))];
}
