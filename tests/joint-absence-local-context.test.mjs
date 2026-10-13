import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGestorEscuelaConfiguration} from '../js/gestor-adapter.js';
import {buildJointAbsenceRequest,assessJointAbsenceResult}
  from '../js/joint-absence-coverage.js';

const DATE='2026-10-12';
const days=['lunes','martes','miercoles','jueves','viernes'];
function person(id,tipo){
  return {id,nombre:'Docente '+id,tipo,activo:true,
    disponibilidad:Object.fromEntries(days.map(d=>[d,[{inicio:'08:00',fin:'13:00'}]])),
    bloqueosExternos:{}};
}
function fixture(){
  const absent=['tutor','pt','al'].map((id,i)=>({
    id:'absence-'+i,professionalId:id,fromDate:DATE,toDate:DATE,
    startTime:'',endTime:'',status:'pending',resolvedAt:''
  }));
  return {
    professionals:[
      person('tutor','DOCENTE'),person('tutor2','DOCENTE'),
      person('pt','PT'),person('al','AL'),
      person('subclass','DOCENTE'),person('subpt','PT'),person('subal','AL')
    ],
    students:[
      {id:'SECRET-PUPIL-ONE',nombre:'Alumno privado 1',
        grupoClase:'1ºA',curso:'1º',activo:true},
      {id:'SECRET-PUPIL-TWO',nombre:'Alumno privado 2',
        grupoClase:'2ºA',curso:'2º',activo:true}
    ],
    groups:[
      {id:'group-pt',tipo:'PT',nombre:'Grupo mixto',
        professionalId:'pt',studentIds:['SECRET-PUPIL-ONE','SECRET-PUPIL-TWO'],
        roomId:'R-PT',activo:true},
      {id:'group-al',tipo:'AL',nombre:'AL 2ºA',
        professionalId:'al',studentIds:['SECRET-PUPIL-TWO'],
        roomId:'R-AL',activo:true}
    ],
    sessions:[
      {id:'session-pt',groupId:'group-pt',professionalId:'pt',
        dia:'lunes',inicio:'09:00',fin:'10:00'},
      {id:'session-al',groupId:'group-al',professionalId:'al',
        dia:'lunes',inicio:'10:00',fin:'10:45'}
    ],
    classSchedules:[
      {id:'mat',grupoClase:'1ºA',materia:'MAT',
        dia:'lunes',inicio:'09:00',fin:'10:00',professionalId:'tutor'},
      {id:'sci',grupoClase:'2ºA',materia:'CIENCIAS',
        dia:'lunes',inicio:'09:00',fin:'10:00',professionalId:'tutor2'}
    ],
    staffAbsences:absent,
    schoolSettings:{structure:{configured:false},recesses:{}},
    automationSettings:{courseRules:{
      '1º':{subjectPolicies:{MAT:{extraction:'blocked',preference:'avoid'}}},
      '2º':{subjectPolicies:{CIENCIAS:{extraction:'ptal',preference:'neutral'}}}
    }},
    centerPlanningSettings:{generation:{
      start:'08:00',end:'13:00',
      roomResources:[
        {roomId:'R-PT',capacity:2,
          windows:[{weekday:0,startTime:'08:00',endTime:'13:00'}]},
        {roomId:'R-AL',capacity:2,
          windows:[{weekday:0,startTime:'08:00',endTime:'13:00'}]},
        {roomId:'R-OTHER',capacity:2,
          windows:[{weekday:0,startTime:'08:00',endTime:'13:00'}]}
      ],
      travelRules:[]
    }}
  };
}
function evaluate(state){
  const adapter=buildGestorEscuelaConfiguration(state);
  const plan=buildJointAbsenceRequest(state,adapter,DATE);
  const substitutions=plan.details.flatMap(row=>
    [...row.classActivities.map(x=>({...x,kind:'CLASS'})),...row.supportActivities]
      .map(x=>({
        activity_id:x.id,slot_id:x.slotId,absent_teacher_id:row.teacherId,
        substitute_teacher_id:adapter.report.mappings.teachers[
          x.kind==='PT'?'subpt':x.kind==='AL'?'subal':'subclass']
      }))
  );
  const assessment=assessJointAbsenceResult(plan,{
    payload:{solution:{substitutions,uncovered:[]}}
  });
  return {adapter,plan,assessment};
}
const entry=(result,kind)=>result.assessment.sessionAudit.entries
  .find(row=>row.kind===kind);

test('escenario ficticio: tres docentes ausentes, PT mixto y AL separados',()=>{
  const state=fixture(),before=JSON.stringify(state);
  const result=evaluate(state);
  assert.equal(result.adapter.report.ready,true);
  assert.equal(result.plan.count,3);
  assert.equal(result.plan.details.length,3);
  assert.equal(result.plan.classCount,1);
  assert.ok(result.plan.supportCount>=2);
  assert.equal(result.assessment.sessionAudit.summary.total,2);
  assert.equal(entry(result,'PT').participantCount,2);
  assert.equal(entry(result,'PT').mixedClassCount,2);
  assert.equal(JSON.stringify(state),before);
  for(const hidden of ['SECRET-PUPIL-ONE','SECRET-PUPIL-TWO','Alumno privado']){
    assert.ok(!JSON.stringify(result.plan).includes(hidden),hidden);
    assert.ok(!JSON.stringify(result.assessment).includes(hidden),hidden);
  }
});
test('regla de extracción bloqueada afecta a un integrante, sin identificarlo',()=>{
  const state=fixture();
  const result=evaluate(state),pt=entry(result,'PT');
  assert.equal(pt.status,'continuous');
  assert.equal(pt.reviewStatus,'conflict');
  assert.ok(pt.issues.some(x=>x.kind==='extractionBlocked'));
  assert.equal(result.plan.localAudit.sessionChecks['session-pt'].extractionBlocked,1);
  const saved=JSON.stringify(result.plan.localAudit.sessionChecks['session-pt']);
  assert.ok(!saved.includes('SECRET'));
});
test('cambiar a extracción permitida elimina el bloqueo, pero AL sin materia es desconocido',()=>{
  const state=fixture();
  state.automationSettings.courseRules['1º'].subjectPolicies.MAT.extraction='ptal';
  const result=evaluate(state);
  assert.equal(entry(result,'PT').reviewStatus,'structural');
  assert.equal(entry(result,'AL').reviewStatus,'needsReview');
  assert.ok(entry(result,'AL').issues.some(x=>x.kind==='extractionUnknown'));
  assert.equal(result.assessment.status,'unknown');
});
test('choque entre dos apoyos al mismo participante es un conflicto agregado',()=>{
  const state=fixture();
  state.sessions[1].inicio='09:30';
  const result=evaluate(state),pt=entry(result,'PT');
  assert.ok(pt.issues.some(x=>x.kind==='participantOverlap'));
  assert.equal(result.plan.localAudit.sessionChecks['session-pt'].participantClashes,1);
});
function addPriorBooking(state){
  state.groups.push({id:'previous',tipo:'PT',nombre:'Apoyo previo',
    professionalId:'subpt',studentIds:[],roomId:'R-OTHER',activo:true});
  state.sessions.push({id:'previous-session',groupId:'previous',
    professionalId:'subpt',dia:'lunes',inicio:'08:30',fin:'09:00'});
}
test('trayecto explícito de 15 minutos no cabe entre dos sesiones contiguas',()=>{
  const state=fixture();
  addPriorBooking(state);
  state.centerPlanningSettings.generation.travelRules=[
    {fromLocationId:'room:R-OTHER',toLocationId:'room:R-PT',minutes:15}
  ];
  const result=evaluate(state),pt=entry(result,'PT');
  assert.equal(pt.status,'continuous');
  assert.equal(pt.reviewStatus,'conflict');
  assert.ok(pt.issues.some(x=>x.kind==='travelTooShort'));
});
test('sin regla de trayecto configurada no se inventa una duración',()=>{
  const state=fixture();addPriorBooking(state);
  state.automationSettings.courseRules['1º'].subjectPolicies.MAT.extraction='ptal';
  const result=evaluate(state),pt=entry(result,'PT');
  assert.equal(pt.reviewStatus,'needsReview');
  assert.ok(pt.issues.some(x=>x.kind==='travelUnknown'));
  assert.ok(!pt.issues.some(x=>x.kind==='travelTooShort'));
});
test('cero minutos expresos entre salas evita una alarma de trayecto',()=>{
  const state=fixture();addPriorBooking(state);
  state.automationSettings.courseRules['1º'].subjectPolicies.MAT.extraction='ptal';
  state.centerPlanningSettings.generation.travelRules=[
    {fromLocationId:'room:R-OTHER',toLocationId:'room:R-PT',minutes:0}
  ];
  const result=evaluate(state),pt=entry(result,'PT');
  assert.equal(pt.reviewStatus,'structural');
});
test('sustituto fuera de disponibilidad semanal no se da por adecuado',()=>{
  const state=fixture();
  const substitute=state.professionals.find(x=>x.id==='subpt');
  substitute.disponibilidad.lunes=[{inicio:'10:00',fin:'13:00'}];
  const result=evaluate(state),pt=entry(result,'PT');
  assert.ok(pt.issues.some(x=>x.kind==='substituteUnavailable'));
  assert.equal(pt.reviewStatus,'conflict');
});
test('indisponibilidad externa bloquea al sustituto durante el apoyo',()=>{
  const state=fixture();
  const substitute=state.professionals.find(x=>x.id==='subpt');
  substitute.bloqueosExternos.lunes=[{centro:'Centro alternativo',
    inicio:'09:00',fin:'09:30'}];
  const result=evaluate(state),pt=entry(result,'PT');
  assert.ok(pt.issues.some(x=>x.kind==='substituteUnavailable'));
});
test('si falta disponibilidad declarada se muestra desconocida, nunca disponible',()=>{
  const state=fixture();
  delete state.professionals.find(x=>x.id==='subpt').disponibilidad;
  const result=evaluate(state),pt=entry(result,'PT');
  assert.ok(pt.issues.some(x=>x.kind==='availabilityUnknown'));
  assert.equal(pt.reviewStatus,'conflict'); // extraction remains blocked
});
test('la petición remota no incluye reglas por estudiante, trayectos ni datos médicos',()=>{
  const state=fixture();
  const {plan,adapter}=evaluate(state);
  assert.equal(JSON.stringify(plan.request).includes('SECRET'),false);
  assert.ok(!JSON.stringify(adapter.configuration).includes('SECRET-PUPIL'));
  assert.ok(!JSON.stringify(adapter.configuration).includes('Centro alternativo'));
  assert.deepEqual(Object.keys(plan.request).sort(),['absences','locked_substitutions']);
});
