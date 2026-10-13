import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dateNumber,monthKey,monthShift,normalizeStaffAbsence,
  validateAbsenceCollection,createStaffAbsences,changeAbsenceCoverage,
  affectedSessionsForAbsence,buildAbsenceCalendar
} from '../js/staff-absences.js';
import {createSharePackage,validateSharePackage} from '../js/sharing.js';

const staff=[{id:'p1',nombre:'Docente A',tipo:'DOCENTE'},
  {id:'p2',nombre:'Especialista PT',tipo:'PT'},
  {id:'p3',nombre:'Especialista AL',tipo:'AL'}];
const basic={
  professionalIds:['p1','p2'],
  fromDate:'2026-10-12',toDate:'2026-10-14',startTime:'',endTime:''
};
const make=(extra={})=>{
  let i=0;
  return createStaffAbsences({...basic,...extra},[],staff,
    {generateId:()=> 'abs-'+(++i)});
};
const state={
  professionals:staff,
  classSchedules:[
    {professionalId:'p1',dia:'lunes',inicio:'09:00',fin:'10:00',grupoClase:'1ºA'},
    {professionalId:'p1',dia:'martes',inicio:'12:00',fin:'13:00',grupoClase:'1ºA'}
  ],
  groups:[{id:'g1',professionalId:'p2',tipo:'PT',studentIds:['secret-child']}],
  sessions:[{groupId:'g1',dia:'lunes',inicio:'10:00',fin:'10:45'}]
};
test('fecha estricta: bisiesto, cambio horario y salto de mes',()=>{
  assert.notEqual(dateNumber('2028-02-29'),null);
  assert.equal(dateNumber('2027-02-29'),null);
  assert.equal(dateNumber('2026-04-31'),null);
  assert.equal(dateNumber('2026-03-29')+86400000,dateNumber('2026-03-30'));
  assert.equal(monthKey('2026-13'),null);
  assert.equal(monthShift('2026-12',1),'2027-01');
  assert.equal(monthShift('2027-01',-1),'2026-12');
});
test('creación masiva pendiente sin información de salud',()=>{
  const entries=make({reason:'DIAGNÓSTICO PRIVADO'});
  assert.equal(entries.length,2);
  assert.deepEqual(entries.map(x=>x.professionalId),['p1','p2']);
  assert.ok(entries.every(x=>x.status==='pending'&&!x.resolvedAt));
  assert.ok(!JSON.stringify(entries).includes('DIAGNÓSTICO'));
});
test('rechaza fechas invertidas, días imposibles y horas fuera de rejilla',()=>{
  for(const extra of [
    {fromDate:'2026-10-14',toDate:'2026-10-12'},
    {fromDate:'2026-02-29',toDate:'2026-03-01'},
    {fromDate:'2026-01-01',toDate:'2028-01-02'},
    {startTime:'09:10',endTime:'10:00'},
    {startTime:'09:00',endTime:''},
    {startTime:'10:00',endTime:'09:00'}
  ])assert.throws(()=>make(extra));
});
test('no duplica ausencias solapadas del mismo profesor',()=>{
  const current=make({professionalIds:['p1'],startTime:'09:00',endTime:'10:00'});
  assert.throws(()=>createStaffAbsences({...basic,professionalIds:['p1'],
    startTime:'09:30',endTime:'10:30'},current,staff));
  assert.equal(createStaffAbsences({...basic,professionalIds:['p2']},current,staff).length,1);
  assert.equal(createStaffAbsences({...basic,professionalIds:['p1'],
    startTime:'10:00',endTime:'11:00'},current,staff).length,1);
  assert.throws(()=>make({professionalIds:['p1','p1']}));
  assert.throws(()=>make({professionalIds:['missing']}));
});
test('validación de colección y estado resuelto exigen confirmación fechada',()=>{
  assert.throws(()=>validateAbsenceCollection([...make(),...make()]));
  assert.throws(()=>normalizeStaffAbsence({...make()[0],status:'resolved'}));
  const old=make()[0];
  const done=changeAbsenceCoverage(old,'resolved',new Date('2026-10-13T10:00:00Z'));
  assert.equal(done.status,'resolved');
  assert.equal(done.resolvedAt,'2026-10-13T10:00:00.000Z');
  assert.equal(changeAbsenceCoverage(done,'pending').resolvedAt,'');
  assert.equal(old.status,'pending');
});
test('identifica clases y apoyos afectados sin información de alumnado',()=>{
  const [one,two]=make();
  assert.deepEqual(affectedSessionsForAbsence(state,one,'2026-10-12').map(x=>x.label),['1ºA']);
  const support=affectedSessionsForAbsence(state,two,'2026-10-12');
  assert.equal(support.length,1);
  assert.ok(!JSON.stringify(support).includes('secret-child'));
  assert.equal(affectedSessionsForAbsence(state,one,'2026-10-15').length,0);
  const [partial]=make({professionalIds:['p1'],startTime:'09:30',endTime:'10:15'});
  assert.equal(affectedSessionsForAbsence(state,partial,'2026-10-12').length,1);
  assert.equal(affectedSessionsForAbsence(state,partial,'2026-10-13').length,0);
});
test('calendario mensual muestra docentes concurrentes sin mezclar estados',()=>{
  const records=make();
  const resolved=changeAbsenceCoverage(records[1],'resolved',new Date('2026-10-13T14:00:00Z'));
  const month=buildAbsenceCalendar('2026-10',[records[0],resolved],state);
  assert.equal(month.summary.pending,1);
  assert.equal(month.summary.resolved,1);
  assert.equal(month.summary.professionals,2);
  const day=month.days.find(x=>x.date==='2026-10-12');
  assert.equal(day.pending,1);
  assert.equal(day.resolved,1);
  assert.deepEqual(day.items.map(x=>x.affected),[1,1]);
  assert.equal(month.days.length%7,0);
  assert.equal(month.days[0].date,'2026-09-28');
});
test('filtros preservan indicadores globales del mes',()=>{
  const records=make(),resolved=changeAbsenceCoverage(records[1],'resolved');
  const selected=buildAbsenceCalendar('2026-10',[records[0],resolved],state,
    {filter:'pending'});
  assert.equal(selected.entries.length,1);
  assert.equal(selected.summary.resolved,1);
});
test('exportación incluye registros e importación de formatos antiguos usa lista vacía',()=>{
  const pack=createSharePackage({students:[],professionals:staff,
    groups:[],sessions:[],classSchedules:[],staffAbsences:make()});
  assert.equal(pack.schemaVersion,6);
  assert.equal(pack.data.staffAbsences.length,2);
  assert.equal(validateSharePackage(pack).staffAbsences.length,2);
  const old=structuredClone(pack);
  old.schemaVersion=5;delete old.data.staffAbsences;
  assert.deepEqual(validateSharePackage(old).staffAbsences,[]);
});
test('importar referencias ajenas, solapes o fechas imposibles falla sin guardar',()=>{
  const pack=createSharePackage({students:[],professionals:staff,
    groups:[],sessions:[],classSchedules:[],staffAbsences:make()});
  pack.data.staffAbsences[0].professionalId='unknown';
  assert.throws(()=>validateSharePackage(pack));
  pack.data.staffAbsences[0].professionalId='p1';
  pack.data.staffAbsences[1].professionalId='p1';
  assert.throws(()=>validateSharePackage(pack));
  pack.data.staffAbsences[1].professionalId='p2';
  pack.data.staffAbsences[0].fromDate='2026-02-30';
  assert.throws(()=>validateSharePackage(pack));
});
