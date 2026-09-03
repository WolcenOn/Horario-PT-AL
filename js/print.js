import { DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { escapeHtml, fullName, timeToMinutes } from './utils.js';

export function printCalendar(state, serviceType) {
  if (!['PT', 'AL'].includes(serviceType)) throw new Error('Selecciona PT o AL para imprimir.');

  const groupMap = new Map(state.groups.map(group => [group.id, group]));
  const professionalMap = new Map(state.professionals.map(professional => [professional.id, professional]));
  const studentMap = new Map(state.students.map(student => [student.id, student]));
  const sessions = state.sessions
    .filter(session => groupMap.get(session.groupId)?.tipo === serviceType)
    .filter(session => Number.isFinite(timeToMinutes(session.inicio)) && Number.isFinite(timeToMinutes(session.fin)));

  if (!sessions.length) throw new Error(`No hay sesiones ${serviceType} para imprimir.`);

  const start = Math.floor(Math.min(DEFAULT_CALENDAR_START, ...sessions.map(session => timeToMinutes(session.inicio))) / 30) * 30;
  const end = Math.ceil(Math.max(DEFAULT_CALENDAR_END, ...sessions.map(session => timeToMinutes(session.fin))) / 30) * 30;
  const pxPerMinute = 1.22;
  const height = Math.max(420, (end - start) * pxPerMinute);
  const rulerLabels = [];
  for (let minute = start; minute <= end; minute += 30) {
    rulerLabels.push(`<span class="time-label" style="top:${(minute - start) * pxPerMinute}px">${toTime(minute)}</span>`);
  }

  const columns = DAYS.map(day => {
    const blocks = sessions.filter(session => session.dia === day.id).map(session => {
      const group = groupMap.get(session.groupId);
      const professional = professionalMap.get(session.professionalId || group?.professionalId);
      const excluded = new Set(session.excludedStudentIds || []);
      const students = (group?.studentIds || []).filter(id => !excluded.has(id)).map(id => fullName(studentMap.get(id))).filter(Boolean);
      const top = (timeToMinutes(session.inicio) - start) * pxPerMinute;
      const blockHeight = Math.max(34, (timeToMinutes(session.fin) - timeToMinutes(session.inicio)) * pxPerMinute);
      return `<div class="session ${serviceType.toLowerCase()}" style="top:${top}px;height:${blockHeight}px">
        <strong>${escapeHtml(group?.nombre || 'Sesión')}</strong>
        <span class="time">${escapeHtml(session.inicio)}–${escapeHtml(session.fin)}</span>
        <span>${escapeHtml(professional?.nombre || 'Sin profesional')}</span>
        ${students.length ? `<span>${escapeHtml(students.join(', '))}</span>` : ''}
        ${session.aula ? `<span>${escapeHtml(session.aula)}</span>` : ''}
      </div>`;
    }).join('');
    return `<section class="day"><h2>${day.label}</h2><div class="day-body" style="height:${height}px">${blocks}</div></section>`;
  }).join('');

  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('El navegador ha bloqueado la ventana de impresión. Permite ventanas emergentes para esta página.');
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Horario ${serviceType}</title><style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; color: #17212b; background: white; }
    header { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-bottom: 10px; }
    h1 { margin: 0; font-size: 20px; }
    header p { margin: 3px 0 0; color: #596875; font-size: 11px; }
    .service { font-size: 13px; font-weight: 700; border: 1px solid #cbd5dc; border-radius: 999px; padding: 5px 10px; }
    .calendar { display: grid; grid-template-columns: 54px repeat(5, minmax(0, 1fr)); border: 1px solid #bcc8d0; }
    .ruler { position: relative; border-right: 1px solid #bcc8d0; background: #fafbfc; }
    .ruler-head { height: 31px; border-bottom: 1px solid #bcc8d0; }
    .ruler-body { position: relative; height: ${height}px; background-image: linear-gradient(to bottom, #d9e0e5 1px, transparent 1px); background-size: 100% ${30 * pxPerMinute}px; }
    .time-label { position: absolute; left: 5px; transform: translateY(-50%); font-size: 9px; color: #65727d; }
    .day { min-width: 0; border-right: 1px solid #bcc8d0; }
    .day:last-child { border-right: 0; }
    .day h2 { height: 31px; margin: 0; display: grid; place-items: center; border-bottom: 1px solid #bcc8d0; font-size: 11px; background: #fafbfc; }
    .day-body { position: relative; background-image: linear-gradient(to bottom, #d9e0e5 1px, transparent 1px), linear-gradient(to bottom, #edf1f4 1px, transparent 1px); background-size: 100% ${30 * pxPerMinute}px, 100% ${15 * pxPerMinute}px; }
    .session { position: absolute; left: 3px; right: 3px; border-radius: 5px; padding: 4px 5px; overflow: hidden; border: 1px solid #a8cbd8; background: #e4f1f6; font-size: 8.5px; line-height: 1.18; }
    .session.al { border-color: #cbbfe5; background: #f0ecf8; }
    .session strong, .session span { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .session .time { font-weight: 700; margin: 1px 0; }
    footer { margin-top: 7px; color: #71808b; font-size: 9px; display: flex; justify-content: space-between; }
    @media print { .no-print { display: none; } }
  </style></head><body>
    <header><div><h1>Horario semanal ${serviceType}</h1><p>Pedagogía Terapéutica (PT) / Audición y Lenguaje (AL)</p></div><div class="service">Solo ${serviceType}</div></header>
    <div class="calendar"><div class="ruler"><div class="ruler-head"></div><div class="ruler-body">${rulerLabels.join('')}</div></div>${columns}</div>
    <footer><span>Generado desde Horario PT / AL</span><span>${escapeHtml(new Date().toLocaleString('es-ES'))}</span></footer>
    <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));<\/script>
  </body></html>`);
  printWindow.document.close();
}

function toTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
