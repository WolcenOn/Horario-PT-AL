import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledAbsenceBlocks,createSelectedStaffAbsences} from '../js/absence-flow.js';

const state=()=>({
  professionals:[
    {id:'a',nombre:'Tutora'},
    {id:'b',nombre:'Especialista PT'},
    {id:'c',nombre:'Especialista AL'}
  ],
  classSchedules:[
    {id:'a-mat',professionalId:'a',grupoClase:'1A',materia:'MAT',
      dia:'lunes',inicio:'09:00',fin:'10:00'},
    {id:'a-art',professionalId:'a',grupoClase:'1A',materia:'ART',
      dia:'lunes',inicio:'11:00',fin:'11:45'},
    {id:'a-music',professionalId:'a',grupoClase:'1A',materia:'MUS',
      dia:'lunes',inicio:'11:45',fin:'12:15'},
    {id:'not-monday',professionalId:'a',grupoClase:'1A',materia:'ENG',
      dia:'martes',inicio:'09:00',fin:'10:00'}
  ],
  groups:[{id:'g1',tipo:'PT',professionalId:'b',
    studentIds:['secret-1','secret-2']},
    {id:'g2',tipo:'AL',professionalId:'c',studentIds:['secret-1']}],
  sessions:[
    {id:'p1',groupId:'g1',dia:'lunes',inicio:'09:30',fin:'10:15'},
    {id:'al1',groupId:'g2',dia:'martes',inicio:'09:00',fin:'09:45'}
  ],
  staffAbsences:[]
});
const input={
  professionalIds:['a','b'],fromDate:'2026-10-12',toDate:'2026-10-12',
  mode:'schedule',selectedSlots:{a:['class:a-mat','class:a-art'],b:['support:p1']}
};
const create=(input,stateValue=state())=>{
  let n=0;
  return createSelectedStaffAbsences(input,stateValue,{generateId:()=> 'new-'+(++n)});
};

test('el horario previsto incluye clase y apoyo del docente y fecha concretos',()=>{
  const source=state();
  assert.deepEqual(scheduledAbsenceBlocks(source,'a','2026-10-12').map(s=>s.key),
    ['class:a-mat','class:a-art','class:a-music']);
  assert.deepEqual(scheduledAbsenceBlocks(source,'b','2026-10-12').map(s=>s.key),
    ['support:p1']);
  assert.equal(scheduledAbsenceBlocks(source,'b','2026-10-13').length,0);
  assert.equal(scheduledAbsenceBlocks(source,'a','2026-10-11').length,0);
  assert.ok(!JSON.stringify(scheduledAbsenceBlocks(source,'b','2026-10-12'))
    .includes('secret-1'));
});
test('una sola operación registra distintas sesiones para dos docentes',()=>{
  const original=state(),before=JSON.stringify(original);
  const rows=create(input,original);
  assert.deepEqual(rows.map(r=>[r.professionalId,r.startTime,r.endTime]),[
    ['a','09:00','10:00'],['a','11:00','11:45'],['b','09:30','10:15']
  ]);
  assert.ok(rows.every(row=>row.status==='pending'&&!row.resolvedAt));
  assert.equal(JSON.stringify(original),before);
});
test('las sesiones contiguas se unen, pero los huecos se conservan',()=>{
  const entries=create({...input,professionalIds:['a'],
    selectedSlots:{a:['class:a-art','class:a-music','class:a-mat']}});
  assert.deepEqual(entries.map(r=>[r.startTime,r.endTime]),[
    ['09:00','10:00'],['11:00','12:15']
  ]);
});
test('jornada completa de uno o varios docentes sigue compatible',()=>{
  const rows=create({
    professionalIds:['a','b'],fromDate:'2026-10-12',toDate:'2026-10-16',
    mode:'full'
  });
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>r.startTime===''&&r.endTime===''&&
    r.toDate==='2026-10-16'));
});
test('las horas manuales siguen siendo posibles sin horario previsto',()=>{
  const entries=create({
    professionalIds:['c'],fromDate:'2026-10-12',toDate:'2026-10-14',
    mode:'manual',startTime:'10:15',endTime:'11:30'
  });
  assert.equal(entries[0].startTime,'10:15');
  assert.equal(entries[0].toDate,'2026-10-14');
});
test('horario manual incompleto no se convierte accidentalmente en jornada completa',()=>{
  assert.throws(()=>create({
    professionalIds:['a'],fromDate:'2026-10-12',toDate:'2026-10-12',
    mode:'manual',startTime:'',endTime:''
  }),/hora de inicio/);
});
test('rechaza intervalos manipulados, huecos sin seleccionar y fechas mezcladas',()=>{
  assert.throws(()=>create({...input,selectedSlots:{...input.selectedSlots,
    a:['class:a-unknown']}}),/horario previsto ha cambiado/);
  assert.throws(()=>create({...input,selectedSlots:{a:[],b:['support:p1']}}),
    /Selecciona las sesiones/);
  assert.throws(()=>create({...input,toDate:'2026-10-13'}),
    /un solo día/);
  assert.throws(()=>create({...input,professionalIds:['a','a']}),
    /repetidos/);
  assert.throws(()=>create({...input,professionalIds:['missing']}),
    /registrado/);
  assert.throws(()=>create({...input,selectedSlots:{a:['class:a-mat','class:a-mat'],
    b:['support:p1']}}),/repetidas/);
});
test('las ausencias ya guardadas no se sustituyen y se rechazan los solapes',()=>{
  const current=state();
  current.staffAbsences=[{
    id:'old',professionalId:'a',fromDate:'2026-10-12',toDate:'2026-10-12',
    startTime:'09:00',endTime:'10:00',status:'resolved',
    resolvedAt:'2026-10-12T10:00:00Z'
  }];
  assert.throws(()=>create(input,current),/solapadas/);
  assert.equal(current.staffAbsences[0].status,'resolved');
});
test('alumno, diagnóstico y nombre no forman parte de un registro guardado',()=>{
  const rows=create(input);
  const blob=JSON.stringify(rows);
  for(const id of ['secret-1','secret-2','Diagnóstico'])
    assert.ok(!blob.includes(id));
});
