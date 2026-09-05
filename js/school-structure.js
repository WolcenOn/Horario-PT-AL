import { COURSE_OPTIONS, MAX_SCHOOL_LINES, classGroupName, linesForCourse, normalizeSchoolSettings } from './education.js';
import { escapeHtml } from './utils.js';
import { setModalMessage, showModal } from './ui.js';

export function openSchoolStructureForm(settings, { onSave }) {
  const current = normalizeSchoolSettings(settings);
  const structure = current.structure;
  const lineOptions = Array.from({ length:MAX_SCHOOL_LINES }, (_, index) => index + 1);

  showModal({
    title:'Configurar clases del colegio',
    submitLabel:'Guardar estructura',
    bodyHtml:`<div class="school-structure-editor">
      <div class="school-structure-intro">
        <strong>Define primero las líneas generales del centro</strong>
        <span>Se creará una plantilla para Infantil y Primaria. Después puedes cambiar cursos concretos si tienen más o menos grupos que el resto del colegio.</span>
      </div>

      <section class="school-lines-selector">
        <div class="form-field">
          <label for="defaultLines">Líneas generales del colegio</label>
          <select id="defaultLines" name="defaultLines">${lineOptions.map(count => `<option value="${count}" ${count === structure.defaultLines ? 'selected' : ''}>${count} ${count === 1 ? 'línea' : 'líneas'}</option>`).join('')}</select>
          <span class="field-hint">Al cambiar este valor se actualiza la plantilla de todos los cursos; después puedes ajustar los desdobles individualmente.</span>
        </div>
        <div class="school-lines-summary">
          <span>Plantilla inicial</span>
          <strong data-total-classes>—</strong>
        </div>
      </section>

      <div class="school-course-lines">
        ${COURSE_OPTIONS.map(course => {
          const count = linesForCourse(current, course.value);
          return `<section class="school-course-line-row" data-course-lines="${escapeHtml(course.value)}">
            <div class="school-course-line-name"><strong>${escapeHtml(course.label)}</strong><small>${escapeHtml(course.value)}</small></div>
            <div class="form-field compact"><label for="lines_${escapeHtml(course.value)}">Clases</label><select id="lines_${escapeHtml(course.value)}" data-course-line-count>${lineOptions.map(option => `<option value="${option}" ${option === count ? 'selected' : ''}>${option}</option>`).join('')}</select></div>
            <div class="school-class-preview" data-class-preview></div>
          </section>`;
        }).join('')}
      </div>

      <div class="class-schedule-help school-structure-note">
        <strong>Ejemplo de desdoble</strong>
        <span>En un colegio de una línea puedes dejar casi todos los cursos con 1 clase y cambiar solo 3º a 2. La plantilla quedará 1ºA, 2ºA, 3ºA, 3ºB, 4ºA…</span>
      </div>
    </div>`,
    onOpen: form => {
      const refreshRow = row => {
        const course = row.dataset.courseLines;
        const count = Number(row.querySelector('[data-course-line-count]')?.value || 1);
        const preview = row.querySelector('[data-class-preview]');
        if (preview) preview.innerHTML = Array.from({ length:count }, (_, index) => `<span class="school-class-chip">${escapeHtml(classGroupName(course, index))}</span>`).join('');
      };
      const refreshTotal = () => {
        const rows = [...form.querySelectorAll('[data-course-lines]')];
        const total = rows.reduce((sum, row) => sum + Number(row.querySelector('[data-course-line-count]')?.value || 0), 0);
        const target = form.querySelector('[data-total-classes]');
        if (target) target.textContent = `${total} clases`;
      };
      const refreshAll = () => {
        form.querySelectorAll('[data-course-lines]').forEach(refreshRow);
        refreshTotal();
      };

      form.elements.defaultLines.addEventListener('change', () => {
        const count = form.elements.defaultLines.value;
        form.querySelectorAll('[data-course-line-count]').forEach(select => { select.value = count; });
        refreshAll();
      });
      form.querySelectorAll('[data-course-line-count]').forEach(select => select.addEventListener('change', () => {
        refreshRow(select.closest('[data-course-lines]'));
        refreshTotal();
      }));
      refreshAll();
    },
    onSubmit: async (data, form, message) => {
      const defaultLines = Number(data.get('defaultLines'));
      if (!Number.isInteger(defaultLines) || defaultLines < 1 || defaultLines > MAX_SCHOOL_LINES) {
        setModalMessage(message, 'Selecciona un número general de líneas válido.');
        return false;
      }
      const courseLines = {};
      for (const row of form.querySelectorAll('[data-course-lines]')) {
        const course = row.dataset.courseLines;
        const count = Number(row.querySelector('[data-course-line-count]')?.value);
        if (!Number.isInteger(count) || count < 1 || count > MAX_SCHOOL_LINES) {
          setModalMessage(message, `Revisa el número de clases de ${course}.`);
          return false;
        }
        courseLines[course] = count;
      }
      await onSave({
        ...current,
        structure:{ configured:true, defaultLines, courseLines }
      });
      return true;
    }
  });
}
