import { normalizeCenterPlanningSettings } from './center-planning.js';
import { openCenterActivityForm, renderCenterActivities } from './center-activities.js';
import { loadState, saveCenterPlanningSettings } from './repository.js';
import { showToast } from './ui.js';
import { applyViewShell } from './view-shell.js';

const viewRoot = document.querySelector('#viewRoot');

document.addEventListener('click', event => {
  const button = event.target.closest?.('[data-view="centerActivities"]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void openCenterActivities();
}, true);

async function openCenterActivities() {
  let state = await loadState();
  const render = () => {
    applyViewShell({ view:'centerActivities', title:'Actividades del centro' });
    renderCenterActivities(viewRoot, {
      state,
      onAdd:() => editActivity(null),
      onEdit:id => editActivity(id),
      onDelete:deleteActivity
    });
  };

  const editActivity = id => {
    const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
    const current = id ? settings.weeklyActivities.find(item => item.id === id) : null;
    openCenterActivityForm(current, { state, onSave:async activity => {
      const latest = normalizeCenterPlanningSettings(state.centerPlanningSettings);
      const exists = latest.weeklyActivities.some(item => item.id === activity.id);
      const weeklyActivities = exists
        ? latest.weeklyActivities.map(item => item.id === activity.id ? activity : item)
        : [...latest.weeklyActivities, activity];
      await saveCenterPlanningSettings({ ...latest, weeklyActivities });
      state = await loadState();
      render();
      showToast(exists ? 'Actividad actualizada.' : 'Actividad añadida al centro.');
    }});
  };

  const deleteActivity = async id => {
    const settings = normalizeCenterPlanningSettings(state.centerPlanningSettings);
    const activity = settings.weeklyActivities.find(item => item.id === id);
    if (!activity) return;
    if (!confirm(`¿Eliminar la actividad “${activity.name}”? Se retirará de la carga de los docentes asignados.`)) return;
    await saveCenterPlanningSettings({ ...settings, weeklyActivities:settings.weeklyActivities.filter(item => item.id !== id) });
    state = await loadState();
    render();
    showToast('Actividad eliminada.');
  };

  render();
}
