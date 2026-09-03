import { CALENDAR_PX_PER_MINUTE, DAYS, DEFAULT_CALENDAR_END, DEFAULT_CALENDAR_START } from './constants.js';
import { escapeHtml, fullName, minutesToTime, timeToMinutes } from './utils.js';

export function renderCalendar(root, { state, serviceFilter, conflicts, onEditSession }) {
  const groupMap=new Map(state.groups.map(g=>[g.id,g]));
  const professionalMap=new Map(state.professionals.map(p=>[p.id,p]));
  const studentMap=new Map(state.students.map(s=>[s.id,s]));
  const validSessions=state.sessions.filter(s=>Number.isFinite(timeToMinutes(s.inicio))&&Number.isFinite(timeToMinutes(s.fin)));
  const minSession=Math.min(DEFAULT_CALENDAR_START,...validSessions.map(s=>timeToMinutes(s.inicio)));
  const maxSession=Math.max(DEFAULT_CALENDAR_END,...validSessions.map(s=>timeToMinutes(s.fin)));
  const start=Math.floor(minSession/30)*30;
  const end=Math.ceil(maxSession/30)*30;
  const height=(end-start)*CALENDAR_PX_PER_MINUTE;
  const labels=[];for(let m=start;m<=end;m+=30){labels.push(`<span class="time-label" style="top:${(m-start)*CALENDAR_PX_PER_MINUTE}px">${minutesToTime(m)}</span>`);}
  const conflictSessionIds=new Set(conflicts.flatMap(c=>c.sessionIds));
  const columns=DAYS.map(day=>{
    const blocks=state.sessions.filter(s=>s.dia===day.id).map(session=>{
      const group=groupMap.get(session.groupId);if(!group)return'';
      const top=(timeToMinutes(session.inicio)-start)*CALENDAR_PX_PER_MINUTE;const h=Math.max(28,(timeToMinutes(session.fin)-timeToMinutes(session.inicio))*CALENDAR_PX_PER_MINUTE);
      const professional=professionalMap.get(session.professionalId||group.professionalId);
      const students=(group.studentIds||[]).map(id=>fullName(studentMap.get(id))).filter(Boolean);
      const dim=serviceFilter!=='ALL'&&group.tipo!==serviceFilter;
      return `<button class="session-block ${group.tipo.toLowerCase()} ${conflictSessionIds.has(session.id)?'has-conflict':''} ${dim?'is-dimmed':''}" style="top:${top}px;height:${h}px" data-session-id="${session.id}" type="button" title="Editar ${escapeHtml(group.nombre)}">
        <strong>${conflictSessionIds.has(session.id)?'⚠ ':''}${escapeHtml(group.nombre)}</strong>
        <small>${session.inicio}–${session.fin} · ${escapeHtml(professional?.nombre||'Sin profesional')}</small>
        <small>${escapeHtml(students.join(', '))}</small>
        ${session.aula?`<small>${escapeHtml(session.aula)}</small>`:''}
      </button>`;
    }).join('');
    return `<div class="day-column" style="height:${height}px" aria-label="${day.label}">${blocks}</div>`;
  }).join('');
  root.innerHTML=`<section class="card calendar-card"><div class="calendar-head"><div>Hora</div>${DAYS.map(d=>`<div>${d.label}</div>`).join('')}</div><div class="calendar-scroll"><div class="calendar-body"><div class="time-ruler" style="height:${height}px">${labels.join('')}</div>${columns}</div></div><div class="calendar-legend"><span><i class="legend-dot pt"></i>PT</span><span><i class="legend-dot al"></i>AL</span><span><i class="legend-conflict"></i>Conflicto / advertencia</span><span>El filtro atenúa el otro servicio sin ocultarlo.</span></div></section>`;
  root.onclick=event=>{const block=event.target.closest('[data-session-id]');if(block)onEditSession(block.dataset.sessionId);};
}
