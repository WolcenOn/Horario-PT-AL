import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveAvailability, externalBlockOverlap } from '../js/professional-availability.js';
import { detectConflicts } from '../js/conflicts.js';

test('resta el tiempo de otro centro de la disponibilidad del profesional', () => {
  const base = { lunes:[{ inicio:'08:30', fin:'14:30' }] };
  const external = { lunes:[{ centro:'IES Sierra', inicio:'08:30', fin:'11:30' }] };
  assert.deepEqual(effectiveAvailability(base, external), {
    lunes:[{ inicio:'11:30', fin:'14:30' }]
  });
});

test('un bloque externo intermedio divide la disponibilidad en dos tramos', () => {
  const base = { martes:[{ inicio:'08:30', fin:'14:30' }] };
  const external = { martes:[{ centro:'IES Sierra', inicio:'10:00', fin:'11:00' }] };
  assert.deepEqual(effectiveAvailability(base, external), {
    martes:[
      { inicio:'08:30', fin:'10:00' },
      { inicio:'11:00', fin:'14:30' }
    ]
  });
});

test('detecta la coincidencia con la presencia del profesional en otro centro', () => {
  const professional = {
    id:'al1', nombre:'AL compartida', tipo:'AL',
    disponibilidad:{ lunes:[{ inicio:'11:30', fin:'14:30' }] },
    bloqueosExternos:{ lunes:[{ centro:'IES Sierra', inicio:'08:30', fin:'11:30' }] }
  };
  const overlap = externalBlockOverlap(professional, 'lunes', '10:00', '10:45');
  assert.equal(overlap.centro, 'IES Sierra');

  const conflicts = detectConflicts({
    students:[{ id:'a', nombre:'Ana', apellidos:'Prueba', restricciones:[] }],
    professionals:[professional],
    groups:[{ id:'g', nombre:'Grupo AL', tipo:'AL', professionalId:'al1', studentIds:['a'] }],
    sessions:[{ id:'s', groupId:'g', professionalId:'al1', dia:'lunes', inicio:'10:00', fin:'10:45' }]
  });
  assert.ok(conflicts.some(conflict => conflict.type === 'professional-external-center' && conflict.severity === 'grave'));
});
