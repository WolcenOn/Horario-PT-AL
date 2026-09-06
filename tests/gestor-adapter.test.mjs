import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGestorEscuelaConfiguration } from '../js/gestor-adapter.js';
import { toJsonCompatible } from '../js/gestor-serialization.js';

function sampleState() {
  const weekdays = Object.fromEntries(['lunes','martes','miercoles','jueves','viernes'].map(day => [day, [{ inicio:'09:00', fin:'14:00' }]]));
  return {
    students:[{
      id:'alu1', nombre:'Alumno', apellidos:'Prueba', curso:'1º', grupoClase:'1ºA', tutor:'Tutor Uno', activo:true
    }],
    professionals:[
      {
        id:'doc1', nombre:'Tutor Uno', tipo:'DOCENTE', tutoriaGrupo:'1ºA', activo:true,
        disponibilidad:weekdays, bloqueosExternos:{}, teachingAssignments:[{ grupoClase:'1ºA', materia:'Lengua Castellana y Literatura' }]
      },
      {
        id:'al1', nombre:'AL Uno', tipo:'AL', activo:true,
        disponibilidad:{
          lunes:[{ inicio:'09:00', fin:'11:30' },{ inicio:'12:00', fin:'14:00' }],
          martes:[{ inicio:'09:00', fin:'14:00' }], miercoles:[{ inicio:'09:00', fin:'14:00' }],
          jueves:[{ inicio:'09:00', fin:'14:00' }], viernes:[]
        },
        bloqueosExternos:{ martes:[{ centro:'IES', inicio:'09:00', fin:'10:00' }] }
      }
    ],
    groups:[{
      id:'grp1', nombre:'AL 1º', tipo:'AL', professionalId:'al1', studentIds:['alu1'], activo:true
    }],
    sessions:[{
      id:'ses1', groupId:'grp1', professionalId:'al1', dia:'lunes', inicio:'10:00', fin:'11:00'
    }],
    classSchedules:[{
      id:'class1', grupoClase:'1ºA', dia:'lunes', inicio:'09:00', fin:'10:00',
      materia:'Lengua Castellana y Literatura', professionalId:'doc1'
    }],
    schoolSettings:{
      id:'school', recesses:{ infantil:{ inicio:'11:00', fin:'11:30' }, primaria:{ inicio:'11:30', fin:'12:00' } },
      structure:{ configured:false, defaultLines:1, courseLines:{} }
    },
    centerPlanningSettings:{ generation:{ start:'09:00', end:'14:00' } }
  };
}

test('construye una configuración académica compatible sin modificar el estado local', () => {
  const state = sampleState();
  const before = JSON.stringify(state);
  const result = buildGestorEscuelaConfiguration(state);

  assert.equal(result.report.ready, true);
  assert.equal(result.configuration.groups.length, 1);
  assert.equal(result.configuration.teachers.length, 2);
  assert.ok(result.configuration.activities.some(item => item.activity_type === 'CLASS'));
  assert.ok(result.configuration.activities.some(item => item.activity_type === 'AL'));
  assert.equal(JSON.stringify(state), before);
});

test('convierte descanso y centro externo en ocupaciones críticas no desplazables', () => {
  const result = buildGestorEscuelaConfiguration(sampleState());
  const alId = result.report.mappings.teachers.al1;
  const breakSlot = result.report.slots.find(slot => slot.label === '11:30–12:00');
  const externalSlot = result.report.slots.find(slot => slot.label === '09:00–10:00');
  assert.ok(breakSlot);
  assert.ok(externalSlot);

  const mondayBreak = result.configuration.activities.find(item =>
    item.teacher_id === alId && item.weekday === 0 && item.slot_id === breakSlot.id && item.activity_type === 'SUPPORT'
  );
  assert.ok(mondayBreak);
  assert.equal(mondayBreak.priority, 50);
  assert.equal(mondayBreak.movable, false);
  assert.equal(mondayBreak.cancelable, false);

  const tuesdayExternal = result.configuration.activities.find(item =>
    item.teacher_id === alId && item.weekday === 1 && item.slot_id === externalSlot.id && item.activity_type === 'SUPPORT'
  );
  assert.ok(tuesdayExternal);
  assert.equal(tuesdayExternal.priority, 50);
});

test('serializa Sets del adaptador como listas JSON válidas para Pydantic', () => {
  const result = buildGestorEscuelaConfiguration(sampleState());
  const payload = toJsonCompatible(result.configuration);
  assert.ok(Array.isArray(payload.teachers[0].can_cover_groups));
  assert.ok(Array.isArray(payload.teachers[0].specialties));
  assert.doesNotThrow(() => JSON.stringify(payload));
});
