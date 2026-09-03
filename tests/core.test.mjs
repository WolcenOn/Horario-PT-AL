import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, overlapInterval, timeToMinutes } from '../js/utils.js';
import { calculateStudentHours, totalsFromHours } from '../js/hours.js';
import { detectConflicts } from '../js/conflicts.js';
import { demoData } from '../js/seed.js';
import { createSharePackage, validateSharePackage } from '../js/sharing.js';

const students=[
  {id:'a',nombre:'Ana',apellidos:'Uno',horasPTObjetivoMin:90,horasALObjetivoMin:45,restricciones:[]},
  {id:'b',nombre:'Beto',apellidos:'Dos',horasPTObjetivoMin:0,horasALObjetivoMin:0,restricciones:[]}
];
const professionals=[
  {id:'p1',nombre:'PT Uno',tipo:'PT',disponibilidad:{lunes:[{inicio:'09:00',fin:'14:00'}]}},
  {id:'p2',nombre:'AL Uno',tipo:'AL',disponibilidad:{lunes:[{inicio:'09:00',fin:'14:00'}]}}
];
const groups=[
  {id:'gpt',nombre:'Grupo PT',tipo:'PT',professionalId:'p1',studentIds:['a','b'],activo:true},
  {id:'gal',nombre:'Grupo AL',tipo:'AL',professionalId:'p2',studentIds:['a'],activo:true}
];

test('convierte horas a minutos y formatea duración',()=>{
  assert.equal(timeToMinutes('09:45'),585);
  assert.equal(formatDuration(90),'1 h 30 min');
});

test('detecta solapamiento parcial real',()=>{
  assert.deepEqual(overlapInterval(540,585,570,615),{start:570,end:585,duration:15});
  assert.equal(overlapInterval(540,585,585,630),null);
});

test('calcula horas por pertenencia a grupos',()=>{
  const sessions=[
    {id:'s1',groupId:'gpt',dia:'lunes',inicio:'09:00',fin:'09:45'},
    {id:'s2',groupId:'gpt',dia:'martes',inicio:'10:00',fin:'10:45'},
    {id:'s3',groupId:'gal',dia:'miercoles',inicio:'11:00',fin:'11:45'}
  ];
  const hours=calculateStudentHours(students,groups,sessions).get('a');
  assert.equal(hours.ptAssigned,90);
  assert.equal(hours.alAssigned,45);
  assert.equal(hours.ptPending,0);
  assert.equal(hours.alPending,0);
});

test('detecta conflicto de alumno por solapamiento parcial',()=>{
  const sessions=[
    {id:'s1',groupId:'gpt',professionalId:'p1',dia:'lunes',inicio:'09:00',fin:'09:45'},
    {id:'s2',groupId:'gal',professionalId:'p2',dia:'lunes',inicio:'09:30',fin:'10:15'}
  ];
  const conflicts=detectConflicts({students,professionals,groups,sessions});
  assert.ok(conflicts.some(c=>c.type==='student-overlap'&&c.studentIds.includes('a')));
});

test('detecta conflicto de profesional',()=>{
  const g2={id:'gpt2',nombre:'Grupo PT 2',tipo:'PT',professionalId:'p1',studentIds:[],activo:true};
  const sessions=[
    {id:'s1',groupId:'gpt',professionalId:'p1',dia:'lunes',inicio:'10:00',fin:'10:45'},
    {id:'s2',groupId:'gpt2',professionalId:'p1',dia:'lunes',inicio:'10:30',fin:'11:15'}
  ];
  const conflicts=detectConflicts({students,professionals,groups:[...groups,g2],sessions});
  assert.ok(conflicts.some(c=>c.type==='professional-overlap'));
});

test('los datos demo cubren el volumen y casos intencionados de la Fase 1',()=>{
  const demo=demoData();
  assert.equal(demo.students.length,20);
  assert.equal(demo.professionals.filter(p=>p.tipo==='PT').length,2);
  assert.equal(demo.professionals.filter(p=>p.tipo==='AL').length,2);
  assert.equal(demo.groups.length,8);
  assert.ok(demo.sessions.length>=20 && demo.sessions.length<=30);
  const hours=calculateStudentHours(demo.students,demo.groups,demo.sessions);
  const totals=totalsFromHours(hours);
  assert.ok(totals.ptPending>0);
  assert.ok(totals.ptExcess>0);
  const conflicts=detectConflicts(demo);
  assert.ok(conflicts.some(c=>c.type==='student-overlap'));
  assert.ok(conflicts.some(c=>c.type==='professional-overlap'));
  assert.ok(conflicts.some(c=>c.type==='student-restriction'));
});

test('genera y valida un archivo compartible completo',()=>{
  const demo=demoData();
  const payload=createSharePackage(demo);
  assert.equal(payload.format,'horario-pt-al');
  assert.equal(payload.schemaVersion,1);
  const validated=validateSharePackage(payload);
  assert.equal(validated.students.length,20);
  assert.equal(validated.groups.length,8);
  assert.equal(validated.sessions.length,demo.sessions.length);
});

test('rechaza archivos compartidos con referencias rotas',()=>{
  const demo=demoData();
  const payload=createSharePackage(demo);
  payload.data.groups[0].studentIds.push('alumno_inexistente');
  assert.throws(()=>validateSharePackage(payload),/alumno inexistente/i);
});
