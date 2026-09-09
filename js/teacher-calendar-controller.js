import { loadState } from './repository.js';
import { activeProfessionals, renderTeacherCalendar, renderTeacherCalendarToolbar } from './teacher-calendar.js';
import { printProfessionalSchedules } from './teacher-print.js';
import { escapeHtml } from './utils.js';
import { showModal, showToast } from './ui.js';

const root = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

const STORAGE_KEY = 'horario-calendar-professional';
let selectedProfessionalId = localStorage.getItem(STORAGE_KEY) || '';
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
  const calendarNav = event.target.closest?.('[data-view="calendar"]');
  if (!calendarNav) return;
  setTimeout(() => void enhanceCalendar(), 0);
}, true);

setTimeout(() => void enhanceCalendar(), 0);

async function enhanceCalendar() {
  if (pageTitle?.textContent !== 'Horario semanal') return;
  const state = await loadState();
  if (selectedProfessionalId && !state.professionals.some(item => item.id === selectedProfessionalId && item.activo !== false)) {
    selectedProfessionalId = '';
    localStorage.removeItem(STORAGE_KEY);
  }

  if (selectedProfessionalId) {
    hideDefaultCalendarControls();
    if (root.querySelector('.teacher-calendar-view')?.dataset?.professionalId === selectedProfessionalId) return;
    renderTeacherCalendar(root, {
      state,
      professionalId:selectedProfessionalId,
      onChangeProfessional:changeProfessional,
      onPrintProfessional:printOne,
      onOpenPrintManager:() => openPrintManager(state)
    });
    const view = root.querySelector('.teacher-calendar-view');
    if (view) view.dataset.professionalId = selectedProfessionalId;
    return;
  }

  restoreDefaultCalendarControls();
  const calendar = root.querySelector('.calendar-card');
  if (!calendar) return;
  renderTeacherCalendarToolbar(root, {
    state,
    selectedProfessionalId:'',
    onChangeProfessional:changeProfessional,
    onOpenPrintManager:() => openPrintManager(state)
  });
}

async function changeProfessional(id) {
  selectedProfessionalId = String(id || '');
  if (selectedProfessionalId) localStorage.setItem(STORAGE_KEY, selectedProfessionalId);
  else localStorage.removeItem(STORAGE_KEY);

  if (!selectedProfessionalId) {
    document.querySelector('[data-view="calendar"]')?.click();
    return;
  }
  await enhanceCalendar();
}

async function printOne(id) {
  try {
    const state = await loadState();
    printProfessionalSchedules(state, [id]);
  } catch (error) {
    showToast(error.message || 'No se pudo abrir la impresión del docente.', 'error');
  }
}

function openPrintManager(state) {
  const professionals = activeProfessionals(state);
  if (!professionals.length) {
    showToast('No hay profesorado activo para imprimir.', 'error');
    return;
  }
  showModal({
    title:'Imprimir horarios del profesorado',
    size:'wide',
    submitLabel:'🖨 Imprimir seleccionados',
    bodyHtml:`<div class="teacher-print-manager">
      <div class="integration-note"><strong>Una página por docente</strong><span>Puedes imprimir una selección o todo el claustro en un único trabajo de impresión.</span></div>
      <div class="teacher-print-manager-actions"><button class="button" type="button" data-select-all-teachers>Marcar todos</button><button class="button" type="button" data-clear-teachers>Desmarcar</button></div>
      <div class="teacher-print-grid">${professionals.map(item => `<label><input type="checkbox" name="professionalId" value="${escapeHtml(item.id)}" ${item.id === selectedProfessionalId ? 'checked' : ''}><span><strong>${escapeHtml(item.nombre || item.id)}</strong><small>${escapeHtml(item.especialidad || item.tipo || 'Docente')}</small></span></label>`).join('')}</div>
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
  summaryStrip?.classList.add('hidden');
  serviceFilter?.classList.add('hidden');
  primaryAction?.classList.add('hidden');
  printActions?.classList.add('hidden');
}

function restoreDefaultCalendarControls() {
  summaryStrip?.classList.remove('hidden');
  serviceFilter?.classList.remove('hidden');
  primaryAction?.classList.remove('hidden');
  printActions?.classList.remove('hidden');
}
