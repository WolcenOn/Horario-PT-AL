import { renderClassRosters } from './class-rosters.js';
import { openSchoolStructureForm } from './school-structure.js';
import { openStudentForm } from './alumnos.js';
import { courseForClassGroup } from './education.js';
import { loadState, saveSchoolSettings, saveStudent } from './repository.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="classRosters"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openClassRosters();
}, true);

async function openClassRosters() {
  let state = await loadState();
  const render = () => {
    pageTitle.textContent = 'Clases y alumnado';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'classRosters'));
    summaryStrip?.classList.add('hidden');
    serviceFilter?.classList.add('hidden');
    primaryAction?.classList.add('hidden');
    printActions?.classList.add('hidden');
    renderClassRosters(viewRoot, {
      state,
      onConfigureStructure:() => openSchoolStructureForm(state.schoolSettings, { onSave:async settings => {
        await saveSchoolSettings(settings);
        state = await loadState();
        render();
        showToast('Estructura de clases actualizada.');
      }}),
      onAddStudent:grupoClase => openStudentForm(null, {
        initialCourse:courseForClassGroup(state.schoolSettings, grupoClase) || '',
        initialClassGroup:grupoClase,
        onSave:async student => {
          await saveStudent(student);
          state = await loadState();
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
          render();
          showToast('Alumno actualizado.');
        }});
      },
      onBulkCreate:async (students, meta) => {
        await Promise.all(students.map(saveStudent));
        state = await loadState();
        render();
        const duplicateText = meta.duplicates?.length ? ` Se omitieron ${meta.duplicates.length} duplicado(s).` : '';
        showToast(`${students.length} alumno(s) añadidos a ${meta.grupoClase}.${duplicateText}`);
      }
    });
  };
  render();
}
