import test from 'node:test';
import assert from 'node:assert/strict';

import { buildClassWeekOverview, freeGaps } from '../js/class-week-overview.js';

const state = {
  schoolSettings:{
    id:'school',
    structure:{ configured:true, defaultLines:1, courseLines:{} },
    recesses:{ infantil:{inicio:'',fin:''}, primaria:{inicio:'11:00',fin:'11:30'} }
  },
  centerPlanningSettings:{ generation:{ start:'09:00', end:'14:00' } },
  classSchedules:[
    { id:'a', grupoClase:'1ºA', materia:'Lengua', dia:'lunes', inicio:'09:00', fin:'10:00' },
    { id:'b', grupoClase:'1ºA', materia:'Matemáticas', dia:'lunes', inicio:'10:00', fin:'11:00' },
    { id:'c', grupoClase:'1ºA', materia:'Inglés', dia:'lunes', inicio:'12:00', fin:'13:00' },
    { id:'other', grupoClase:'2ºA', materia:'Lengua', dia:'lunes', inicio:'09:00', fin:'10:00' }
  ]
};

test('proyecta materias, recreo y huecos de una clase en la semana', () => {
  const overview = buildClassWeekOverview(state, '1ºA');
  assert.equal(overview.startLabel, '09:00');
  assert.equal(overview.endLabel, '14:00');
  assert.equal(overview.stage, 'primaria');
  const monday = overview.days.find(day => day.id === 'lunes');
  assert.equal(monday.entries.length, 3);
  assert.deepEqual(monday.recess && [monday.recess.inicio, monday.recess.fin], ['11:00','11:30']);
  assert.deepEqual(monday.gaps.map(gap => [gap.inicio, gap.fin]), [['11:30','12:00'],['13:00','14:00']]);
});

test('fusiona intervalos ocupados antes de calcular huecos', () => {
  const gaps = freeGaps([[540,600],[570,630],[660,690]], 540, 720);
  assert.deepEqual(gaps.map(gap => [gap.inicio, gap.fin]), [['10:30','11:00'],['11:30','12:00']]);
});
