import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQuickStartPreset } from '../js/setup-presets.js';

function emptyState() {
  return {
    schoolSettings:{ id:'school', recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'',fin:''} }, structure:{ configured:false, defaultLines:1, courseLines:{} } },
    centerPlanningSettings:null
  };
}

test('crea una base editable de dos líneas sin inventar currículo ni recreos', () => {
  const preset = buildQuickStartPreset(emptyState(), { territory:'Andalucía', defaultLines:2 });
  assert.equal(preset.schoolSettings.structure.configured, true);
  assert.equal(preset.schoolSettings.structure.defaultLines, 2);
  assert.equal(preset.classCount, 18);
  assert.equal(preset.centerPlanningSettings.mode, 'global');
  assert.equal(preset.centerPlanningSettings.territory, 'Andalucía');
  assert.deepEqual(preset.centerPlanningSettings.curriculum, {});
  assert.deepEqual(preset.schoolSettings.recesses.primaria, { inicio:'', fin:'' });
  assert.equal(preset.structureChanged, true);
});

test('no pisa desdobles existentes al guardar la comunidad', () => {
  const state = emptyState();
  state.schoolSettings.structure = { configured:true, defaultLines:1, courseLines:{ '3º':2 } };
  const preset = buildQuickStartPreset(state, { territory:'Galicia', defaultLines:4 });
  assert.equal(preset.structureChanged, false);
  assert.equal(preset.schoolSettings.structure.defaultLines, 1);
  assert.equal(preset.schoolSettings.structure.courseLines['3º'], 2);
  assert.equal(preset.centerPlanningSettings.territory, 'Galicia');
});

test('rechaza territorio y número de líneas no válidos', () => {
  assert.throws(() => buildQuickStartPreset(emptyState(), { territory:'Inventada', defaultLines:2 }));
  assert.throws(() => buildQuickStartPreset(emptyState(), { territory:'Andalucía', defaultLines:9 }));
});
