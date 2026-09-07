import { normalizeCenterPlanningSettings } from './center-planning.js';
import { loadState, saveCenterPlanningSettings } from './repository.js';
import { openSubjectPatternForm, renderTemporalPatterns } from './temporal-patterns-view.js';
import { showToast } from './ui.js';

const viewRoot = document.querySelector('#viewRoot');
const pageTitle = document.querySelector('#pageTitle');
const summaryStrip = document.querySelector('#summaryStrip');
const serviceFilter = document.querySelector('.service-filter');
const primaryAction = document.querySelector('#primaryActionBtn');
const printActions = document.querySelector('#calendarPrintActions');

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="temporalPatterns"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openTemporalPatterns();
}, true);

async function openTemporalPatterns() {
  let state = await loadState();
  const render = () => {
    pageTitle.textContent = 'Patrones temporales';
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('is-active', button.dataset.view === 'temporalPatterns'));
    summaryStrip?.classList.add('hidden');
    serviceFilter?.classList.add('hidden');
    primaryAction?.classList.add('hidden');
    printActions?.classList.add('hidden');
    renderTemporalPatterns(viewRoot, {
      state,
      onEditSubject:editSubject,
      onOpenActivities:() => document.querySelector('[data-view="centerActivities"]')?.click()
    });
  };

  const editSubject = (course, subject) => {
    const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
    openSubjectPatternForm({
      course,
      subject,
      pattern:settings.subjectPatterns?.[course]?.[subject],
      generation:settings.generation
    }, {
      onSave:async pattern => {
        const latest = normalizeCenterPlanningSettings(state.centerPlanningSettings);
        const subjectPatterns = structuredClone(latest.subjectPatterns || {});
        subjectPatterns[course] ||= {};
        subjectPatterns[course][subject] = pattern;
        await saveCenterPlanningSettings({ ...latest, subjectPatterns });
        state = await loadState();
        render();
        showToast(`Patrón temporal guardado para ${subject} · ${course}.`);
      }
    });
  };

  render();
}
