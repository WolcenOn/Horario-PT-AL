import { loadState } from './repository.js';
import { printDailySubstitutionSchedules } from './teacher-print.js';
import { escapeHtml } from './utils.js';
import { showToast } from './ui.js';

const root = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
let lastPlanDate = '';
let enhancing = false;

document.addEventListener('submit', event => {
  if (event.target?.id !== 'absenceSolveForm') return;
  const data = new FormData(event.target);
  lastPlanDate = String(data.get('date') || '');
}, true);

const observer = new MutationObserver(() => {
  if (enhancing || pageTitle?.textContent !== 'Operativa diaria') return;
  const result = root.querySelector('.operations-result');
  if (!result || result.querySelector('[data-operations-print-toolbar]')) return;
  enhancing = true;
  queueMicrotask(async () => {
    try {
      await enhanceResult(result);
    } finally {
      enhancing = false;
    }
  });
});
observer.observe(root, { childList:true, subtree:true });

async function enhanceResult(resultRoot) {
  if (!resultRoot || resultRoot.querySelector('[data-operations-print-toolbar]')) return;
  const state = await loadState();
  const groups = parseSubstitutionRows(resultRoot, state);
  if (!groups.length) return;

  const selectedDate = lastPlanDate || String(root.querySelector('#absenceDate')?.value || '');
  const toolbar = document.createElement('div');
  toolbar.className = 'operations-print-toolbar';
  toolbar.dataset.operationsPrintToolbar = 'true';
  toolbar.innerHTML = `<label><span>Horario del sustituto</span><select data-substitute-print-select>${groups.map((item, index) => `<option value="${index}">${escapeHtml(item.professionalName)} · ${item.substitutions.length} sustitución${item.substitutions.length === 1 ? '' : 'es'}</option>`).join('')}</select></label><div class="button-row"><button class="button" type="button" data-print-substitute>🖨 Imprimir docente</button><button class="button" type="button" data-print-all-substitutes>🖨 Imprimir todos los sustitutos</button></div>`;

  const body = resultRoot.querySelector('.card-body');
  body?.insertBefore(toolbar, body.firstChild);

  toolbar.querySelector('[data-print-substitute]')?.addEventListener('click', () => {
    const index = Number(toolbar.querySelector('[data-substitute-print-select]')?.value || 0);
    printGroups(state, [groups[index]].filter(Boolean), selectedDate);
  });
  toolbar.querySelector('[data-print-all-substitutes]')?.addEventListener('click', () => printGroups(state, groups, selectedDate));
}

function parseSubstitutionRows(resultRoot, state) {
  const table = resultRoot.querySelector('.table-wrap table');
  if (!table) return [];
  const professionalsByName = new Map();
  for (const professional of state.professionals || []) {
    const key = normalize(professional.nombre);
    if (!key) continue;
    const current = professionalsByName.get(key) || [];
    current.push(professional);
    professionalsByName.set(key, current);
  }

  const grouped = new Map();
  for (const row of table.querySelectorAll('tbody tr')) {
    const cells = [...row.querySelectorAll('td')];
    if (cells.length < 5 || !cells[3].querySelector('strong')) continue;
    const slot = cells[0].textContent.trim();
    const match = /(\d{2}:\d{2})\s*[–-]\s*(\d{2}:\d{2})/.exec(slot);
    if (!match) continue;
    const professionalName = cells[3].textContent.trim();
    const matches = professionalsByName.get(normalize(professionalName)) || [];
    if (matches.length !== 1) continue;
    const professional = matches[0];
    const current = grouped.get(professional.id) || {
      professionalId:professional.id,
      professionalName:professional.nombre || professional.id,
      substitutions:[]
    };
    current.substitutions.push({
      inicio:match[1],
      fin:match[2],
      grupo:cells[1].textContent.trim(),
      absentTeacher:cells[2].textContent.trim()
    });
    grouped.set(professional.id, current);
  }
  return [...grouped.values()].sort((a, b) => a.professionalName.localeCompare(b.professionalName, 'es', { sensitivity:'base' }));
}

function printGroups(state, groups, date) {
  try {
    if (!groups.length) throw new Error('No hay docentes sustitutos que imprimir.');
    printDailySubstitutionSchedules(state, groups, date);
  } catch (error) {
    showToast(error.message || 'No se pudo preparar la impresión de sustituciones.', 'error');
  }
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}
