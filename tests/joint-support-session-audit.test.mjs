import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGestorEscuelaConfiguration} from '../js/gestor-adapter.js';
import {buildJointAbsenceRequest,assessJointAbsenceResult}
  from '../js/joint-absence-coverage.js';

const date='2026-10-12';
const availability=Object.fromEntries(['lunes','martes','miercoles','jueves','viernes']
  .map(day=>[day,[{inicio:'09:00',fin:'13:00'}]]));
const staff=(id,tipo)=>({
  id,nombre:id,tipo,activo:true,disponibilidad:availability,
  bloqueosExternos:{}
});
function fixture(){
  const state={
    professionals:[
      staff('pt-absent','PT'),staff('pt-available','PT'),
      staff('al-available','AL'),staff('class-teacher','DOCENTE')
    ],
    students:[
      {id:'private-child-one',nombre:'Pupil Private One',
        grupoClase:'1ºA',activo:true},
      {id:'private-child-two',nombre:'Pupil Private Two',
        grupoClase:'2ºA',activo:true}
    ],
    groups:[{
      id:'gpt',nombre:'Apoyo mixto',tipo:'PT',activo:true,
      professionalId:'pt-absent',studentIds:['private-child-one','private-child-two'],
      roomId:'PT-ROOM'
    }],
    sessions:[{
      id:'session-1',groupId:'gpt',professionalId:'pt-absent',
      dia:'lunes',inicio:'09:00',fin:'10:00'
    }],
    classSchedules:[{
      id:'lesson1',grupoClase:'1ºA',materia:'MAT',
      professionalId:'class-teacher',dia:'lunes',inicio:'09:30',fin:'10:00'
    }],
    staffAbsences:[{
      id:'absence-pt',professionalId:'pt-absent',fromDate:date,
      toDate:date,startTime:'',endTime:'',status:'pending',resolvedAt:''
    }],
    schoolSettings:{structure:{configured:false},recesses:{}},
    centerPlanningSettings:{generation:{
      start:'09:00',end:'13:00',supportRoomId:'PT-ROOM',
      supportRoomRequirements:{PT:['mesa_regulable']},
      roomResources:[{
        roomId:'PT-ROOM',capacity:2,features:['mesa_regulable'],
        windows:[{weekday:0,startTime:'09:00',endTime:'13:00'}]
      }]
    }}
  };
  return state;
}
function make(state){
  const adapter=buildGestorEscuelaConfiguration(state);
  const plan=buildJointAbsenceRequest(state,adapter,date);
  const def=plan.supportSessions.find(s=>s.id==='session-1');
  return {adapter,plan,def};
}
function response(plan,substitutes){
  const def=plan.supportSessions.find(s=>s.id==='session-1');
  const teacher=def.teacherId;
  const substitutions=[],uncovered=[];
  def.slots.forEach((slot,i)=>{
    const entry={activity_id:slot.activityId,slot_id:slot.slotId,
      absent_teacher_id:teacher};
    if(substitutes[i]===null)uncovered.push({...entry,reason:'Sin sustituto'});
    else if(substitutes[i])substitutions.push({
      ...entry,substitute_teacher_id:substitutes[i]
    });
  });
  return {payload:{solution:{substitutions,uncovered}}};
}
test('el adaptador reconstruye sesión mixta por franjas sin sacar alumnos al solver',()=>{
  const state=fixture();
  const before=JSON.stringify(state);
  const {adapter,plan,def}=make(state);
  assert.equal(adapter.report.ready,true);
  assert.equal(def.kind,'PT');
  assert.equal(def.start,'09:00');
  assert.equal(def.end,'10:00');
  assert.equal(def.slots.length,2);
  assert.equal(def.participantCount,2);
  assert.equal(def.mixedClassCount,2);
  assert.equal(def.roomId,'PT-ROOM');
  assert.equal(plan.supportCount,2);
  assert.equal(plan.supportSessions.length,1);
  assert.equal(plan.ready,true);
  assert.ok(def.slots.every(s=>adapter.configuration.activities.some(a=>a.id===s.activityId)));
  const content=JSON.stringify([plan,adapter.configuration]);
  for(const secret of ['private-child-one','private-child-two','Pupil Private One','Pupil Private Two'])
    assert.ok(!content.includes(secret));
  assert.equal(JSON.stringify(state),before);
});
test('60 minutos solo conservan continuidad si todas las franjas tienen el mismo PT',()=>{
  const {plan,adapter}=make(fixture());
  const substitute=adapter.report.mappings.teachers['pt-available'];
  const assessment=assessJointAbsenceResult(plan,response(plan,[substitute,substitute]));
  assert.equal(assessment.supportProposed,2);
  assert.equal(assessment.sessionAudit.summary.continuous,1);
  assert.equal(assessment.sessionAudit.entries[0].reviewStatus,'structural');
  assert.equal(assessment.sessionAudit.entries[0].mixedClassCount,2);
  assert.equal(assessment.status,'proposed');
});
test('dos especialistas diferentes en franjas de una misma sesión no equivalen a sesión cubierta',()=>{
  const {plan,adapter}=make(fixture());
  const substitute=adapter.report.mappings.teachers['pt-available'];
  const second='PT-SECOND';
  plan.teacherCapabilities.push({
    id:second,specialties:['PT'],canCoverGroups:[]
  });
  const assessment=assessJointAbsenceResult(plan,response(plan,[substitute,second]));
  assert.equal(assessment.supportProposed,2);
  assert.equal(assessment.sessionAudit.entries[0].status,'fragmented');
  assert.equal(assessment.sessionAudit.entries[0].reviewStatus,'conflict');
  assert.equal(assessment.status,'unknown');
});
test('apoyo incompleto o respuesta del backend anterior queda sin verificar',()=>{
  const {plan,adapter}=make(fixture());
  const substitute=adapter.report.mappings.teachers['pt-available'];
  const partial=assessJointAbsenceResult(plan,response(plan,[substitute,null]));
  assert.equal(partial.sessionAudit.entries[0].status,'uncovered');
  assert.equal(partial.sessionAudit.entries[0].reviewStatus,'conflict');
  assert.equal(partial.status,'unknown');
  const old=assessJointAbsenceResult(plan,response(plan,[substitute,undefined]));
  assert.equal(old.sessionAudit.entries[0].status,'unknown');
  assert.equal(old.sessionAudit.summary.unknown,1);
});
test('una ausencia parcial no se convierte en continuidad falsa del apoyo',()=>{
  const state=fixture();
  state.staffAbsences[0].endTime='09:30';
  state.staffAbsences[0].startTime='09:00';
  const {plan,adapter}=make(state);
  const substitute=adapter.report.mappings.teachers['pt-available'];
  const assessment=assessJointAbsenceResult(plan,response(plan,[substitute,undefined]));
  assert.equal(assessment.supportProposed,1);
  assert.equal(assessment.sessionAudit.entries[0].status,'unknown');
});
test('aforo excedido y ventana insuficiente son conflictos comprobables',()=>{
  for(const problem of ['capacity','roomWindow','roomFeatures']){
    const state=fixture();
    const room=state.centerPlanningSettings.generation.roomResources[0];
    if(problem==='capacity')room.capacity=1;
    if(problem==='roomWindow')room.windows[0].startTime='09:30';
    if(problem==='roomFeatures')room.features=[];
    const {plan,adapter}=make(state);
    const teacher=adapter.report.mappings.teachers['pt-available'];
    const assessed=assessJointAbsenceResult(plan,response(plan,[teacher,teacher]));
    const entry=assessed.sessionAudit.entries[0];
    assert.equal(entry.status,'continuous');
    assert.equal(entry.reviewStatus,'conflict');
    assert.ok(entry.issues.some(x=>x.kind===problem));
    assert.equal(assessed.status,'unknown');
  }
});
test('la sala sin información suficiente se clasifica como pendiente de recursos',()=>{
  const state=fixture();
  state.centerPlanningSettings.generation.roomResources=[];
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const assessed=assessJointAbsenceResult(plan,response(plan,[teacher,teacher]));
  assert.equal(assessed.sessionAudit.entries[0].reviewStatus,'needsReview');
  assert.ok(assessed.sessionAudit.entries[0].issues.some(x=>x.kind==='roomUnconfigured'));
  assert.equal(assessed.status,'unknown');
});
test('solape de otra sesión PT/AL en la misma sala se detecta sin datos personales',()=>{
  const state=fixture();
  state.groups.push({
    id:'gal',nombre:'AL extra',tipo:'AL',activo:true,
    professionalId:'al-available',studentIds:['private-child-one'],roomId:'PT-ROOM'
  });
  state.sessions.push({
    id:'session-other',groupId:'gal',professionalId:'al-available',
    dia:'lunes',inicio:'09:00',fin:'10:00'
  });
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const assessed=assessJointAbsenceResult(plan,response(plan,[teacher,teacher]));
  assert.ok(assessed.sessionAudit.entries[0].issues.some(x=>x.kind==='roomOverlap'));
  assert.equal(assessed.sessionAudit.entries[0].reviewStatus,'conflict');
});
test('participantes desconocidos no permiten afirmar aforo o atención completa',()=>{
  const state=fixture();
  delete state.groups[0].studentIds;
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const assessed=assessJointAbsenceResult(plan,response(plan,[teacher,teacher]));
  assert.equal(assessed.sessionAudit.entries[0].participantCount,null);
  assert.ok(assessed.sessionAudit.entries[0].issues.some(x=>x.kind==='participantsUnknown'));
  assert.equal(assessed.status,'unknown');
});

test('las ventanas de sala contiguas cubren una sesión sin intervalo perdido',()=>{
  const state=fixture();
  const room=state.centerPlanningSettings.generation.roomResources[0];
  room.windows=[
    {weekday:0,startTime:'09:00',endTime:'09:30'},
    {weekday:0,startTime:'09:30',endTime:'10:00'}
  ];
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const audit=assessJointAbsenceResult(plan,response(plan,[teacher,teacher])).sessionAudit;
  assert.equal(audit.entries[0].reviewStatus,'structural');
  assert.ok(!audit.entries[0].issues.some(x=>x.kind==='roomWindow'));
});
test('si las franjas no reconstruyen el intervalo original no se certifica continuidad',()=>{
  const {plan,adapter}=make(fixture());
  plan.supportSessions[0].slots[1].start='09:45';
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const audit=assessJointAbsenceResult(plan,response(plan,[teacher,teacher])).sessionAudit;
  assert.equal(audit.entries[0].status,'unknown');
  assert.ok(audit.entries[0].issues.some(x=>x.kind==='slotContinuity'));
});
test('doble reserva del mismo sustituto en clase y PT se marca conflicto',()=>{
  const state=fixture();
  state.staffAbsences.push({
    id:'absence-class',professionalId:'class-teacher',fromDate:date,
    toDate:date,startTime:'',endTime:'',status:'pending',resolvedAt:''
  });
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const result=response(plan,[teacher,teacher]);
  const classRow=plan.details.flatMap(x=>x.classActivities)[0];
  result.payload.solution.substitutions.push({
    activity_id:classRow.id,slot_id:classRow.slotId,
    absent_teacher_id:adapter.report.mappings.teachers['class-teacher'],
    substitute_teacher_id:teacher
  });
  const assessed=assessJointAbsenceResult(plan,result);
  assert.equal(assessed.sessionAudit.entries[0].status,'continuous');
  assert.ok(assessed.sessionAudit.entries[0].issues.some(x=>x.kind==='substituteOverlap'));
  assert.equal(assessed.status,'unknown');
});
test('un aforo omitido se presenta como no verificable y no como sala apta',()=>{
  const state=fixture();
  delete state.centerPlanningSettings.generation.roomResources[0].capacity;
  const {plan,adapter}=make(state);
  const teacher=adapter.report.mappings.teachers['pt-available'];
  const assessed=assessJointAbsenceResult(plan,response(plan,[teacher,teacher]));
  assert.ok(assessed.sessionAudit.entries[0].issues.some(x=>x.kind==='capacityUnknown'));
  assert.equal(assessed.sessionAudit.entries[0].reviewStatus,'needsReview');
});
