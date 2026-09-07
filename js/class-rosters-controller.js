import { backendConfigured, loadBackendSettings, pushAcademicConfiguration, pushRoster } from './backend-service.js';
import { renderClassRosters } from './class-rosters.js';
import { openSchoolStructureForm } from './school-structure.js';
import { openStudentForm } from './alumnos.js';
import { courseForClassGroup } from './education.js';
import { buildGestorEscuelaConfiguration } from './gestor-adapter.js';
import { buildRosterPayload } from './roster-adapter.js';
import { loadState, saveSchoolSettings, saveStudent } from './repository.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');
let syncStatus = null;

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="classRosters"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openClassRosters();
}, true);

async function openClassRosters() {
  let state = await loadState();
  const backendSettings = loadBackendSettings();
  const render = () => {
    pageTitle.textContent = 'Clases y alumnado';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'classRosters'));
    summaryStrip?.classList.add('hidden');
    serviceFilter?.classList.add('hidden');
    primaryAction?.classList.add('hidden');
    printActions?.classList.add('hidden');
    renderClassRosters(viewRoot, {
      state,
      backendReady:backendConfigured(backendSettings),
      syncStatus,
      onConfigureStructure:() => openSchoolStructureForm(state.schoolSettings, { onSave:async settings => {
        await saveSchoolSettings(settings);
        state = await loadState();
        syncStatus = null;
        render();
        showToast('Estructura de clases actualizada.');
      }}),
      onAddStudent:grupoClase => openStudentForm(null, {
        initialCourse:courseForClassGroup(state.schoolSettings, grupoClase) || '',
        initialClassGroup:grupoClase,
        onSave:async student => {
          await saveStudent(student);
          state = await loadState();
          syncStatus = null;
          render();
          showToast(`Alumno añadido a ${grupoClase}.`);
        }
      }),
      onEditStudent:id => {
        const student = state.students.find(item => item.id === id);
        if (!student) return;
        openStudentForm(student, { onSave:async value => {
          await saveStudent(value);
          state = await loadState();
          syncStatus = null;
          render();
          showToast('Alumno actualizado.');
        }});
      },
      onBulkCreate:async (students, meta) => {
        await Promise.all(students.map(saveStudent));
        state = await loadState();
        syncStatus = null;
        render();
        const duplicateText = meta.duplicates?.length ? ` Se omitieron ${meta.duplicates.length} duplicado(s).` : '';
        showToast(`${students.length} alumno(s) añadidos a ${meta.grupoClase}.${duplicateText}`);
      },
      onSyncRoster:async () => {
        if (!backendConfigured(backendSettings)) {
          showToast('Activa y vincula GestorEscuela antes de sincronizar la matrícula.', 'error');
          return;
        }
        const adapter = buildGestorEscuelaConfiguration(state);
        if (!adapter.report.ready) {
          syncStatus = { kind:'error', message:`La configuración académica tiene ${adapter.report.errors.length} problema(s). Revísala antes de sincronizar alumnado.` };
          render();
          return;
        }
        const roster = buildRosterPayload(state, adapter);
        if (!roster.report.ready) {
          syncStatus = { kind:'error', message:roster.report.errors[0] || 'No se puede preparar la matrícula.' };
          render();
          return;
        }
        if (!confirm(`Se enviarán ${roster.report.counts.students} alumnos a GestorEscuela. Primero se actualizarán grupos, docentes y horario académico para garantizar que las clases existen en el backend. ¿Continuar?`)) return;
        syncStatus = { kind:'pending', message:'Enviando configuración académica y matrícula…' };
        render();
        try {
          await pushAcademicConfiguration(backendSettings, adapter.configuration);
          const result = await pushRoster(backendSettings, roster.payload);
          syncStatus = { kind:'ok', message:`${result.students} alumnos y ${result.supports} vinculaciones PT/AL guardados en GestorEscuela.` };
          showToast(syncStatus.message);
        } catch (error) {
          syncStatus = { kind:'error', message:error.message || 'No se pudo sincronizar la matrícula.' };
          showToast(syncStatus.message, 'error');
        }
        render();
      }
    });
  };
  render();
}
