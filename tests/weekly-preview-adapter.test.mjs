import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyPreviewRequest } from '../js/weekly-preview-adapter.js';
import { previewWeeklyTimetable } from '../js/backend-service.js';

const days=['lunes','martes','miercoles','jueves','viernes'];
const availability=Object.fromEntries(days.map(day=>[day,[{inicio:'09:00',fin:'12:00'}]]));

function makeState() {
  return {
    schoolSettings:{
      id:'school',structure:{configured:true,defaultLines:1,courseLines:{}},
      recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
    },
    centerPlanningSettings:{
      mode:'global',
      generation:{start:'09:00',end:'12:00',lessonMinutes:45,maxSameSubjectPerDay:2},
      curriculum:{'1º':{Matemáticas:105},'2º':{Matemáticas:90}},
      subjectPatterns:{
        '1º':{Matemáticas:{sessionMinutes:60,minSessionMinutes:45,maxSessionMinutes:60}},
        '2º':{Matemáticas:{sessionMinutes:90,minSessionMinutes:90,maxSessionMinutes:90}}
      }
    },
    professionals:[{
      id:'specialist-01',nombre:'Profesor nombre privado',activo:true,tipo:'DOCENTE',
      disponibilidad:availability,
      teachingAssignments:[
        {grupoClase:'1ºA',materia:'Matemáticas'},
        {grupoClase:'2ºA',materia:'Matemáticas'}
      ]
    }],
    groups:[{id:'PTgrupo',professionalId:'specialist-01',studentIds:['alumno-sensible']}],
    sessions:[{id:'apoyo',groupId:'PTgrupo',dia:'lunes',inicio:'09:00',fin:'09:45'}],
    students:[{id:'alumno-sensible',nombre:'Dato personal privado',notes:'informe PT/AL'}]
  };
}

test('traduce reglas de Matemáticas de 1º (45/60) y 2º (90) sin datos de menores',()=>{
  const {payload,warnings}=buildWeeklyPreviewRequest(makeState());
  assert.equal(payload.start_time,'09:00');
  assert.equal(payload.end_time,'12:00');
  assert.deepEqual(payload.lessons.map(l=>l.group_id),['1ºA','2ºA']);
  assert.deepEqual([...payload.lessons[0].durations].sort((a,b)=>a-b),[45,60]);
  assert.deepEqual(payload.lessons[1].durations,[90]);
  assert.ok(payload.busy.some(block=>block.teacher_id==='specialist-01'&&block.weekday===0&&block.start_time==='09:00'));
  const serialized=JSON.stringify(payload);
  for(const secret of ['Dato personal privado','alumno-sensible','informe PT/AL','Profesor nombre privado']) {
    assert.equal(serialized.includes(secret),false);
  }
  assert.ok(warnings.some(message=>message.includes('PT/AL')));
});

test('conserva días permitidos y ventanas de la materia',()=>{
  const state=makeState();
  state.centerPlanningSettings.subjectPatterns['1º'].Matemáticas={
    sessionMinutes:60,minSessionMinutes:45,maxSessionMinutes:60,
    allowedDays:['martes','jueves'],preferredDays:['martes'],
    earliestStart:'10:00',latestEnd:'12:00',maxSessionsPerDay:1
  };
  const data=buildWeeklyPreviewRequest(state).payload.lessons[0];
  assert.deepEqual(data.allowed_days,[1,3]);
  assert.deepEqual(data.preferred_days,[1]);
  assert.equal(data.earliest_start,'10:00');
  assert.equal(data.latest_end,'12:00');
});

test('no envía una propuesta sin docente activo asignado',()=>{
  const state=makeState();
  state.professionals=[];
  assert.throws(()=>buildWeeklyPreviewRequest(state),/exactamente un docente activo/);
});

test('API usa Bearer y jamás publica el proyecto completo',async()=>{
  const originalFetch=globalThis.fetch;
  let inspected=false;
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/\/schools\/school-1\/weekly-timetable\/preview$/);
    assert.equal(options.method,'POST');
    assert.equal(options.headers.Authorization,'Bearer tok-sample');
    const body=JSON.parse(options.body);
    assert.equal(body.lessons.length,2);
    inspected=true;
    return {ok:true,status:200,async text(){return JSON.stringify({status:'feasible',preview_only:true,lessons:[]});}};
  };
  try{
    const result=await previewWeeklyTimetable(
      {enabled:true,baseUrl:'https://example.test',schoolId:'school-1',accessToken:'tok-sample'},
      buildWeeklyPreviewRequest(makeState()).payload
    );
    assert.equal(result.preview_only,true);
    assert.equal(inspected,true);
  }finally{globalThis.fetch=originalFetch;}
});


test('calcula solo minutos PT restantes con token aleatorio por petición',()=>{
  const state=makeState();
  state.professionals.push({
    id:'teacher-pt',nombre:'Especialista PT',activo:true,tipo:'PT',disponibilidad:availability
  });
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=90;
  state.groups[0]={id:'PTgrupo',tipo:'PT',professionalId:'teacher-pt',studentIds:['alumno-sensible']};
  state.sessions[0].professionalId='teacher-pt';
  state.automationSettings={
    courseRules:{'1º':{
      subjectPriorities:{Matemáticas:'high'},
      subjectPolicies:{Matemáticas:{extraction:'blocked',preference:'avoid'}}
    }}
  };
  const {payload}=buildWeeklyPreviewRequest(state);
  assert.equal(payload.supports.length,1);
  const request=payload.supports[0];
  assert.equal(request.service,'PT');
  assert.equal(request.weekly_minutes,45);
  assert.deepEqual(request.durations,[45]);
  assert.deepEqual(request.blocked_subjects,['Matemáticas']);
  assert.ok(request.pupil_token);
  assert.notEqual(request.pupil_token,'alumno-sensible');
  assert.ok(payload.busy.some(entry=>entry.pupil_token===request.pupil_token&&entry.weekday===0));
  assert.ok(payload.busy.some(entry=>entry.teacher_id==='teacher-pt'&&entry.weekday===0));
  const next=buildWeeklyPreviewRequest(state);
  assert.notEqual(next.payload.supports[0].pupil_token,request.pupil_token);
  const wire=JSON.stringify(payload);
  for(const secret of ['alumno-sensible','Dato personal privado','informe PT/AL','Especialista PT']) {
    assert.equal(wire.includes(secret),false);
  }
});

test('mantiene el mismo token anónimo entre PT y AL sin mezclar horas objetivo',()=>{
  const state=makeState();
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=45;
  state.students[0].horasALObjetivoMin=45;
  state.professionals.push({
    id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability
  },{
    id:'al',nombre:'AL',tipo:'AL',activo:true,disponibilidad:availability
  });
  state.groups=[
    {id:'one-pt',tipo:'PT',professionalId:'pt',studentIds:['alumno-sensible']},
    {id:'one-al',tipo:'AL',professionalId:'al',studentIds:['alumno-sensible']}
  ];
  state.sessions=[];
  const result=buildWeeklyPreviewRequest(state);
  assert.equal(result.payload.supports.length,2);
  assert.equal(result.payload.supports[0].pupil_token,result.payload.supports[1].pupil_token);
  assert.deepEqual(result.payload.supports.map(s=>s.service),['PT','AL']);
  assert.deepEqual(result.payload.supports.map(s=>s.weekly_minutes),[45,45]);
});

test('planifica asistencia individual a sesiones grupales con objetivos distintos',()=>{
  const state=makeState();
  state.professionals.push({
    id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability
  });
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=90;
  state.students.push({
    id:'student-other',curso:'1º',grupoClase:'1ºA',horasPTObjetivoMin:45,activo:true
  });
  state.groups=[{
    id:'pt-two-pupils',tipo:'PT',professionalId:'pt',
    studentIds:['alumno-sensible','student-other']
  }];
  state.sessions=[];
  const {payload,warnings}=buildWeeklyPreviewRequest(state);
  assert.equal(payload.supports.length,0);
  assert.equal(payload.group_supports.length,1);
  const group=payload.group_supports[0];
  assert.equal(group.session_minutes,45);
  assert.equal(group.teacher_id,'pt');
  assert.deepEqual(group.participants.map(row=>row.weekly_minutes),[90,45]);
  assert.notEqual(group.participants[0].pupil_token,group.participants[1].pupil_token);
  assert.equal(JSON.stringify(payload).includes('student-other'),false);
  assert.ok(!warnings.some(note=>note.includes('pendientes no se han incluido')));
});

test('respeta restricciones individuales de no salir durante apoyos',()=>{
  const state=makeState();
  state.professionals.push({id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability});
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=45;
  state.students[0].restricciones=[{
    tipo:'no-salir',dia:'martes',inicio:'09:00',fin:'10:00'
  }];
  state.groups=[{id:'pt-one',tipo:'PT',professionalId:'pt',studentIds:['alumno-sensible']}];
  state.sessions=[];
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.equal(payload.supports.length,1);
  assert.ok(payload.busy.some(entry=>
    entry.pupil_token===payload.supports[0].pupil_token&&entry.weekday===1
    &&entry.start_time==='09:00'&&entry.end_time==='10:00'));
});


test('diferencia extracción prohibida, evitar y preferente para PT/AL grupal',()=>{
  const state=makeState();
  state.professionals.push({id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability});
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=90;
  state.students.push({
    id:'student-other',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:45,activo:true
  });
  state.groups=[{
    id:'pt-group',tipo:'PT',professionalId:'pt',
    studentIds:['alumno-sensible','student-other']
  }];
  state.sessions=[];
  state.automationSettings={courseRules:{'1º':{
    subjectPriorities:{Matemáticas:'high'},
    subjectPolicies:{Matemáticas:{extraction:'ptal',preference:'avoid'}}
  }}};
  let group=buildWeeklyPreviewRequest(state).payload.group_supports[0];
  assert.deepEqual(group.participants[0].blocked_subjects,[]);
  assert.deepEqual(group.participants[0].avoided_subjects,['Matemáticas']);
  assert.deepEqual(group.participants[0].preferred_subjects,[]);
  state.automationSettings.courseRules['1º'].subjectPolicies.Matemáticas.preference='preferred';
  group=buildWeeklyPreviewRequest(state).payload.group_supports[0];
  assert.deepEqual(group.participants[0].preferred_subjects,['Matemáticas']);
  state.automationSettings.courseRules['1º'].subjectPolicies.Matemáticas.extraction='blocked';
  group=buildWeeklyPreviewRequest(state).payload.group_supports[0];
  assert.deepEqual(group.participants[0].blocked_subjects,['Matemáticas']);
  assert.deepEqual(group.participants[0].preferred_subjects,[]);
});

test('un grupo incompatible queda pendiente sin inventar minutos',()=>{
  const state=makeState();
  state.professionals.push({id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability});
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=975;
  state.students.push({
    id:'student-other',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:45,activo:true
  });
  state.groups=[{
    id:'pt-group',tipo:'PT',professionalId:'pt',
    studentIds:['alumno-sensible','student-other']
  }];
  state.sessions=[];
  const {payload,warnings}=buildWeeklyPreviewRequest(state);
  assert.equal(payload.group_supports.length,0);
  assert.equal(payload.supports.length,0);
  assert.ok(warnings.some(note=>note.includes('pendientes no se han incluido')));
});

test('si un alumno ya completó su objetivo no se le incorpora a apoyo grupal extra',()=>{
  const state=makeState();
  state.professionals.push({id:'pt',nombre:'PT',tipo:'PT',activo:true,disponibilidad:availability});
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=45;
  state.students.push({
    id:'student-other',curso:'1º',grupoClase:'1ºA',
    horasPTObjetivoMin:90,activo:true
  });
  state.groups=[{
    id:'pt-group',tipo:'PT',professionalId:'pt',
    studentIds:['alumno-sensible','student-other']
  }];
  state.sessions=[{
    id:'already',groupId:'pt-group',professionalId:'pt',dia:'lunes',
    inicio:'09:00',fin:'09:45',excludedStudentIds:['student-other']
  }];
  const payload=buildWeeklyPreviewRequest(state).payload;
  assert.equal(payload.group_supports.length,1);
  const participants=payload.group_supports[0].participants;
  assert.equal(participants.length,1);
  assert.equal(participants[0].weekly_minutes,90);
  assert.equal(payload.group_supports[0].session_minutes,45);
  assert.equal(payload.busy.some(item=>item.teacher_id==='pt'&&item.start_time==='09:00'),true);
});

test('sin apoyos pendientes no anuncia salas automáticas ni ubicaciones faltantes',()=>{
  const state=makeState();
  state.groups=[];
  state.sessions=[];
  state.centerPlanningSettings.generation.travelMinutes=15;
  state.centerPlanningSettings.generation.autoAssignSupportRooms=true;
  state.centerPlanningSettings.generation.roomResources=[
    {roomId:'AULA-PT',capacity:2,windows:[]}
  ];
  const {warnings}=buildWeeklyPreviewRequest(state);
  assert.ok(!warnings.some(message=>message.includes('sin ubicación conocida')));
  assert.ok(!warnings.some(message=>message.includes('elegirá una sala')));
  assert.ok(!warnings.some(message=>message.includes('no optimiza') &&
    message.includes('asignaciones automáticas de salas')));
});

test('el aviso de trayecto depende de la ubicación realmente enviada al motor',()=>{
  const state=makeState();
  state.professionals.push({
    id:'pt',tipo:'PT',activo:true,disponibilidad:availability
  });
  state.students[0].curso='1º';
  state.students[0].grupoClase='1ºA';
  state.students[0].horasPTObjetivoMin=45;
  state.groups=[{
    id:'pt-grupo',tipo:'PT',professionalId:'pt',studentIds:['alumno-sensible']
  }];
  state.sessions=[];
  state.centerPlanningSettings.generation.travelMinutes=15;
  state.centerPlanningSettings.generation.autoAssignSupportRooms=true;
  state.centerPlanningSettings.generation.roomResources=[
    {roomId:'AULA-PT',capacity:2,windows:[]}
  ];
  let {payload,warnings}=buildWeeklyPreviewRequest(state);
  assert.deepEqual(payload.supports[0].room_candidates,['AULA-PT']);
  assert.ok(warnings.some(message=>message.includes('elegirá una sala')));
  assert.ok(!warnings.some(message=>message.includes('sin ubicación conocida')));
  state.centerPlanningSettings.generation.autoAssignSupportRooms=false;
  ({payload,warnings}=buildWeeklyPreviewRequest(state));
  assert.equal(payload.supports[0].room_candidates,undefined);
  assert.ok(warnings.some(message=>message.includes('sin ubicación conocida')));
  assert.ok(!warnings.some(message=>message.includes('elegirá una sala')));
  assert.equal(JSON.stringify(payload).includes('alumno-sensible'),false);
});
