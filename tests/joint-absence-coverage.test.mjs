import test from 'node:test';
import assert from 'node:assert/strict';
import {buildJointAbsenceRequest,assessJointAbsenceResult}
  from '../js/joint-absence-coverage.js';
import {changeAbsenceCoverage} from '../js/staff-absences.js';

const sample=()=>{
  const state={
    professionals:[
      {id:'a',nombre:'Docente de clase'},
      {id:'b',nombre:'Docente B'},
      {id:'c',nombre:'Especialista PT'}
    ],
    staffAbsences:[
      {id:'abs-a',professionalId:'a',fromDate:'2026-10-12',
        toDate:'2026-10-14',startTime:'',endTime:'',status:'pending',resolvedAt:''},
      {id:'abs-b',professionalId:'b',fromDate:'2026-10-12',
        toDate:'2026-10-12',startTime:'09:00',endTime:'09:45',status:'pending',resolvedAt:''},
      {id:'abs-c',professionalId:'c',fromDate:'2026-10-12',
        toDate:'2026-10-12',startTime:'',endTime:'',status:'pending',resolvedAt:''}
    ],
    classSchedules:[{id:'local-class',grupoClase:'1A',dia:'lunes',
      inicio:'09:00',fin:'10:00',materia:'MAT',professionalId:'a'}],
    sessions:[],groups:[]
  };
  const adapter={
    report:{
      ready:true,
      mappings:{teachers:{a:'T-A',b:'T-B',c:'PT-C'}},
      slots:[
        {id:'TS01',start:'09:00',end:'09:30'},
        {id:'TS02',start:'09:30',end:'10:00'},
        {id:'TS03',start:'10:00',end:'10:45'}
      ]
    },
    configuration:{
      activities:[
        {id:'math-1',weekday:0,teacher_id:'T-A',slot_id:'TS01',
          activity_type:'CLASS',group_id:'G-1'},
        {id:'math-2',weekday:0,teacher_id:'T-A',slot_id:'TS02',
          activity_type:'CLASS',group_id:'G-1'},
        {id:'english-1',weekday:0,teacher_id:'T-B',slot_id:'TS01',
          activity_type:'CLASS',group_id:'G-2'},
        {id:'pt-1',weekday:0,teacher_id:'PT-C',slot_id:'TS02',
          activity_type:'PT',group_id:'G-1'},
        {id:'other-day',weekday:1,teacher_id:'T-A',slot_id:'TS01',
          activity_type:'CLASS',group_id:'G-1'},
        {id:'fixed-internal',weekday:0,teacher_id:'T-A',slot_id:'TS03',
          activity_type:'SUPPORT',group_id:null}
      ]
    }
  };
  return {state,adapter,date:'2026-10-12'};
};
const validResult=()=>{
  const substitution=(activity_id,slot_id,absent_teacher_id)=>({
    activity_id,slot_id,absent_teacher_id,substitute_teacher_id:'SUB-1'
  });
  return {payload:{solution:{
    substitutions:[
      substitution('math-1','TS01','T-A'),
      substitution('math-2','TS02','T-A')
    ],
    uncovered:[
      {activity_id:'english-1',slot_id:'TS01',absent_teacher_id:'T-B',reason:'No candidate'}
    ]
  }}};
};
test('todas las ausencias concurrentes se agregan en una petición por día',()=>{
  const {state,adapter,date}=sample();
  const before=JSON.stringify({state,adapter});
  const plan=buildJointAbsenceRequest(state,adapter,date);
  assert.equal(plan.count,3);
  assert.equal(plan.ready,true);
  assert.equal(plan.classCount,3);
  assert.equal(plan.supportCount,1);
  assert.deepEqual(plan.request.absences,[
    {teacher_id:'PT-C',slot_ids:['TS01','TS02','TS03']},
    {teacher_id:'T-A',slot_ids:['TS01','TS02','TS03']},
    {teacher_id:'T-B',slot_ids:['TS01','TS02']}
  ]);
  assert.equal(plan.details[2].supportCount,1);
  assert.equal(plan.details[2].classCount,0);
  assert.equal(JSON.stringify({state,adapter}),before);
});
test('una ausencia parcial afecta solo las franjas superpuestas y no otros días',()=>{
  const {state,adapter}=sample();
  assert.deepEqual(buildJointAbsenceRequest(state,adapter,'2026-10-13').request.absences,[
    {teacher_id:'T-A',slot_ids:['TS01','TS02','TS03']}
  ]);
  assert.equal(buildJointAbsenceRequest(state,adapter,'2026-10-13').classCount,0);
  const monday=buildJointAbsenceRequest(state,adapter,'2026-10-12');
  assert.deepEqual(monday.details[1].classActivities.map(x=>x.id),['english-1']);
});
test('la ausencia manualmente resuelta todavía bloquea al docente en el cálculo',()=>{
  const {state,adapter,date}=sample();
  state.staffAbsences[1]=changeAbsenceCoverage(state.staffAbsences[1],'resolved',
    new Date('2026-10-12T10:00:00Z'));
  const plan=buildJointAbsenceRequest(state,adapter,date);
  assert.equal(plan.details[1].manualStatus,'resolved');
  assert.ok(plan.request.absences.some(x=>x.teacher_id==='T-B'));
});
test('cálculo de lunes-viernes: fin de semana bloqueado y fecha imposible rechazada',()=>{
  const {state,adapter}=sample();
  assert.throws(()=>buildJointAbsenceRequest(state,adapter,'2026-02-29'));
  state.staffAbsences[0].toDate='2026-10-18';
  const plan=buildJointAbsenceRequest(state,adapter,'2026-10-17');
  assert.equal(plan.ready,false);
  assert.ok(plan.errors.some(s=>s.includes('lunes a viernes')));
});
test('las ausencias solo PT/AL no se presentan como sustituidas por el motor',()=>{
  const {state,adapter,date}=sample();
  state.staffAbsences=state.staffAbsences.slice(2);
  const plan=buildJointAbsenceRequest(state,adapter,date);
  assert.equal(plan.ready,false);
  assert.equal(plan.classCount,0);
  assert.equal(plan.supportCount,1);
  assert.ok(plan.errors.some(x=>x.includes('PT/AL')));
});
test('identificador no asignado o sin franjas nunca se envía como sustitución inventada',()=>{
  const {state,adapter,date}=sample();
  delete adapter.report.mappings.teachers.b;
  let plan=buildJointAbsenceRequest(state,adapter,date);
  assert.equal(plan.ready,false);
  assert.ok(plan.errors.some(x=>x.includes('identificar')));
  assert.ok(!plan.request.absences.some(x=>x.teacher_id==='T-B'));
  adapter.report.mappings.teachers.b='T-B';
  adapter.report.slots=[];
  plan=buildJointAbsenceRequest(state,adapter,date);
  assert.equal(plan.ready,false);
  assert.ok(plan.errors.some(x=>x.includes('franjas')));
});
test('respuesta parcial se atribuye correctamente a cada ausencia y deja PT pendiente',()=>{
  const args=sample(),plan=buildJointAbsenceRequest(...[args.state,args.adapter,args.date]);
  const result=assessJointAbsenceResult(plan,validResult());
  assert.deepEqual(result.rows.map(x=>x.status),['proposed','uncovered','not-assessed']);
  assert.equal(result.proposed,2);
  assert.equal(result.uncovered,1);
  assert.equal(result.unknown,0);
  assert.equal(result.status,'partial');
  assert.equal(result.hasPendingSupports,true);
});
test('salida incompleta o inconsistente no se interpreta como cobertura',()=>{
  const {state,adapter,date}=sample();
  const plan=buildJointAbsenceRequest(state,adapter,date);
  const missing=assessJointAbsenceResult(plan,{payload:{solution:{
    substitutions:[],uncovered:[]
  }}});
  assert.equal(missing.unknown,3);
  assert.equal(missing.status,'unknown');
  const other=validResult();
  other.payload.solution.substitutions[0].absent_teacher_id='NON-EXISTENT';
  const invalid=assessJointAbsenceResult(plan,other);
  assert.equal(invalid.status,'unknown');
  assert.equal(invalid.anomalies.length,1);
  assert.equal(assessJointAbsenceResult(plan,{payload:{}}).status,'unknown');
});
test('no se filtran tokens de alumnado a solicitudes o evaluaciones',()=>{
  const {state,adapter,date}=sample();
  state.students=[{id:'secret-pupil',nombre:'Menor Privado'}];
  const plan=buildJointAbsenceRequest(state,adapter,date);
  const output=JSON.stringify([plan,assessJointAbsenceResult(plan,validResult())]);
  assert.ok(!output.includes('secret-pupil'));
  assert.ok(!output.includes('Menor Privado'));
});
