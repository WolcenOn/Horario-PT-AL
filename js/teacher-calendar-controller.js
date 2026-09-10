import { loadState } from './repository.js';
import {
  activeProfessionals,
  normalizeTeacherSelection,
  renderTeacherCalendar,
  renderTeacherCalendarToolbar
} from './teacher-calendar.js';
import { printProfessionalSchedules } from './teacher-print.js';
import { escapeHtml } from './utils.js';
import { showModal, showToast } from './ui.js';
import { applyViewShell } from './view-shell.js';

const root = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');

const PRIMARY_STORAGE_KEY = 'horario-calendar-professional';
const COMPARE_STORAGE_KEY = 'horario-calendar-professional-compare';
let selectedProfessionalIds = normalizeTeacherSelection([
  localStorage.getItem(PRIMARY_STORAGE_KEY),
  localStorage.getItem(COMPARE_STORAGE_KEY)
]);
let enhancing = false;

const observer = new MutationObserver(() => {
  if (enhancing || pageTitle?.textContent !== 'Horario semanal') return;
  enhancing = true;
  queueMicrotask(async () => {
    try {
      await enhanceCalendar();
    } finally {
      enhancing = false;
    }
  });
});
observer.observe(root, { childList:true, subtree:true });

document.addEventListener('click', event => {
  const serviceButton = event.target.closest?.('[data-service-filter]');
  if (serviceButton && selectedProfessionalIds.length) clearTeacherSelection();

  const calendarNav = event.target.closest?.('[data-view="calendar"]');
  if (!calendarNav) return;
  setTimeout(() => void enhanceCalendar(), 0);
}, true);

setTimeout(() => void enhanceCalendar(), 0);

async function enhanceCalendar() {
  if (pageTitle?.textContent !== 'Horario semanal') return;
  const state = await loadState();
  const activeIds = new Set(state.professionals.filter(item => item.activo !== false).map(item => item.id));
  selectedProfessionalIds = normalizeTeacherSelection(selectedProfessionalIds.filter(id => activeIds.has(id)));
  persistTeacherSelection();

  if (selectedProfessionalIds.length) {
    hideDefaultCalendarControls();
    const signature = selectedProfessionalIds.join('|');
    if (root.querySelector('.teacher-calendar-view')?.dataset?.professionalIds === signature) return;
    renderTeacherCalendar(root, {
      state,
      professionalIds:selectedProfessionalIds,
      onChangeProfessionals:changeProfessionals,
      onPrintProfessionals:printMany,
      onOpenPrintManager:() => openPrintManager(state)
    });
    return;
  }

  restoreDefaultCalendarControls();
  const calendar = root.querySelector('.calendar-card');
  if (!calendar) return;
  renderTeacherCalendarToolbar(root, {
    state,
    selectedProfessionalIds:[],
    onChangeProfessionals:changeProfessionals,
    onPrintProfessionals:printMany,
    onOpenPrintManager:() => openPrintManager(state)
  });
}

async function changeProfessionals(ids) {
  selectedProfessionalIds = normalizeTeacherSelection(ids);
  persistTeacherSelection();

  if (!selectedProfessionalIds.length) {
    document.querySelector('[data-view="calendar"]')?.click();
    return;
  }
  await enhanceCalendar();
}

function persistTeacherSelection() {
  const [primary = '', comparison = ''] = selectedProfessionalIds;
  if (primary) localStorage.setItem(PRIMARY_STORAGE_KEY, primary);
  else localStorage.removeItem(PRIMARY_STORAGE_KEY);
  if (comparison) localStorage.setItem(COMPARE_STORAGE_KEY, comparison);
  else localStorage.removeItem(COMPARE_STORAGE_KEY);
}

function clearTeacherSelection() {
  selectedProfessionalIds = [];
  persistTeacherSelection();
}

async function printMany(ids) {
  try {
    const selection = normalizeTeacherSelection(ids);
    if (!selection.length) throw new Error('Selecciona al menos un docente.');
    const state = await loadState();
    printProfessionalSchedules(state, selection);
  } catch (error) {
    showToast(error.message || 'No se pudo abrir la impresión del profesorado.', 'error');
  }
}

function openPrintManager(state) {
  const professionals = activeProfessionals(state);
  if (!professionals.length) {
    showToast('No hay profesorado activo para imprimir.', 'error');
    return;
  }
  const selected = new Set(selectedProfessionalIds);
  showModal({
    title:'Imprimir horarios del profesorado',
    size:'wide',
    submitLabel:'🖨 Imprimir seleccionados',
    bodyHtml:`<div class="teacher-print-manager">
      <div class="integration-note"><strong>Una página por docente</strong><span>Puedes imprimir una selección o todo el claustro en un único trabajo de impresión.</span></div>
      <div class="teacher-print-manager-actions"><button class="button" type="button" data-select-all-teachers>Marcar todos</button><button class="button" type="button" data-clear-teachers>Desmarcar</button></div>
      <div class="teacher-print-grid">${professionals.map(item => `<label><input type="checkbox" name="professionalId" value="${escapeHtml(item.id)}" ${selected.has(item.id) ? 'checked' : ''}><span><strong>${escapeHtml(item.nombre || item.id)}</strong><small>${escapeHtml(item.especialidad || item.tipo || 'Docente')}</small></span></label>`).join('')}</div>
    </div>`,
    onOpen:form => {
      form.querySelector('[data-select-all-teachers]')?.addEventListener('click', () => form.querySelectorAll('[name="professionalId"]').forEach(input => { input.checked = true; }));
      form.querySelector('[data-clear-teachers]')?.addEventListener('click', () => form.querySelectorAll('[name="professionalId"]').forEach(input => { input.checked = false; }));
      const footer = form.querySelector('.modal-footer');
      const submit = footer?.querySelector('[type="submit"]');
      if (footer && submit) {
        const all = document.createElement('button');
        all.className = 'button';
        all.type = 'button';
        all.dataset.printAllTeachers = 'true';
        all.textContent = '🖨 Imprimir todos';
        all.addEventListener('click', () => {
          try {
            printProfessionalSchedules(state, professionals.map(item => item.id));
          } catch (error) {
            showToast(error.message || 'No se pudo abrir la impresión.', 'error');
          }
        });
        footer.insertBefore(all, submit);
      }
    },
    onSubmit:data => {
      const ids = data.getAll('professionalId').map(String);
      if (!ids.length) throw new Error('Selecciona al menos un docente.');
      printProfessionalSchedules(state, ids);
      return true;
    }
  });
}

function hideDefaultCalendarControls() {
  applyViewShell({ view:'calendar', title:'Horario semanal' });
}

function restoreDefaultCalendarControls() {
  applyViewShell({
    view:'calendar',
    title:'Horario semanal',
    showSummary:true,
    showServiceFilter:true,
    showPrimaryAction:true,
    showPrintActions:true
  });
}
