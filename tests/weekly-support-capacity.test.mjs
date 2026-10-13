import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWeeklyPayloadCapacity } from '../js/preview-diagnostics.js';
import { requestWeeklyPreviewWithFallback } from '../js/weekly-preview-client.js';

const base=()=>({
  start_time:'09:00',end_time:'11:00',busy:[],
  supports:[{
    service:'PT',teacher_id:'pt',pupil_token:'opaque-request-token',
    weekly_minutes:90,allowed_days:[0]
  }],
  group_supports:[]
});

test('detecta minutos PT que no caben en la disponibilidad y guía al profesorado',()=>{
  const payload=base();
  payload.busy=[{weekday:0,start_time:'09:30',end_time:'11:00',teacher_id:'pt'}];
  const problems=analyzeWeeklyPayloadCapacity(payload);
  assert.equal(problems.length,1);
  assert.equal(problems[0].code,'SUPPORT_TEACHER_CAPACITY');
  assert.equal(problems[0].action.view,'professionals');
  assert.match(problems[0].message,/90 min.*30 min libres/);
  assert.ok(!JSON.stringify(problems).includes('opaque-request-token'));
});

test('las reservas solapadas se cuentan como unión y no causan falsos positivos',()=>{
  const payload=base();
  payload.supports[0].weekly_minutes=75;
  payload.busy=[
    {weekday:0,start_time:'09:00',end_time:'09:30',teacher_id:'pt'},
    {weekday:0,start_time:'09:15',end_time:'09:45',teacher_id:'pt'}
  ];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('dos días disponibles pueden cubrir un objetivo aunque otro día esté ocupado',()=>{
  const payload=base();
  payload.supports[0].weekly_minutes=90;
  payload.supports[0].allowed_days=[0,1];
  payload.busy=[{weekday:0,start_time:'09:00',end_time:'11:00',teacher_id:'pt'}];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('las restricciones de un alumno solo generan un aviso anónimo sin destino supuesto',()=>{
  const payload=base();
  payload.busy=[{
    weekday:0,start_time:'09:00',end_time:'10:00',
    pupil_token:'opaque-request-token'
  }];
  const problems=analyzeWeeklyPayloadCapacity(payload);
  assert.deepEqual(problems.map(item=>item.code),['SUPPORT_PUPIL_CAPACITY']);
  assert.equal(problems[0].action,null);
  assert.ok(!JSON.stringify(problems).includes('opaque-request-token'));
});

test('el apoyo grupal cuenta una vez al profesional y evalúa cada participante',()=>{
  const payload=base();
  payload.supports=[];
  payload.group_supports=[{
    service:'AL',teacher_id:'al',allowed_days:[0],
    participants:[
      {pupil_token:'private-1',weekly_minutes:90},
      {pupil_token:'private-2',weekly_minutes:45}
    ]
  }];
  payload.busy=[
    {weekday:0,start_time:'09:00',end_time:'10:45',teacher_id:'al'},
    {weekday:0,start_time:'09:00',end_time:'10:30',pupil_token:'private-2'}
  ];
  const issues=analyzeWeeklyPayloadCapacity(payload);
  assert.deepEqual(issues.map(row=>row.code),[
    'SUPPORT_TEACHER_CAPACITY','SUPPORT_PUPIL_CAPACITY'
  ]);
  assert.ok(issues[0].message.includes('90 min'));
  assert.ok(!JSON.stringify(issues).includes('private-1'));
  assert.ok(!JSON.stringify(issues).includes('private-2'));
});

test('los datos incompletos nunca se convierten en un falso error de capacidad',()=>{
  const payload=base();
  payload.busy=[{weekday:0,start_time:'desconocida',end_time:'10:00',teacher_id:'pt'}];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

function state() {
  const days=['lunes','martes','miercoles','jueves','viernes'];
  const regular=Object.fromEntries(days.map(day=>[
    day,[{inicio:'09:00',fin:'10:00'}]
  ]));
  const pt={lunes:[{inicio:'09:00',fin:'10:00'}]};
  return {
    schoolSettings:{
      structure:{configured:true,defaultLines:1,courseLines:{}},
      recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
    },
    centerPlanningSettings:{
      mode:'global',
      generation:{start:'09:00',end:'10:00',lessonMinutes:45},
      curriculum:{'1º':{Matemáticas:45}}
    },
    professionals:[
      {id:'doc',tipo:'DOCENTE',activo:true,disponibilidad:regular,
        teachingAssignments:[{grupoClase:'1ºA',materia:'Matemáticas'}]},
      {id:'pt',tipo:'PT',activo:true,disponibilidad:pt}
    ],
    students:[{
      id:'secret-student',nombre:'Identidad privada',activo:true,curso:'1º',
      grupoClase:'1ºA',horasPTObjetivoMin:90
    }],
    groups:[{id:'g1',tipo:'PT',professionalId:'pt',studentIds:['secret-student']}],
    sessions:[]
  };
}

test('la vista previa no llama a la API ante inviabilidad local demostrada',async()=>{
  let calls=0;
  const summary=await requestWeeklyPreviewWithFallback(state(),{},async()=>{
    calls++;
    throw new Error('No debería consultarse');
  });
  assert.equal(calls,0);
  assert.equal(summary.result,null);
  assert.ok(summary.preflightIssues.some(x=>x.code==='SUPPORT_TEACHER_CAPACITY'));
  assert.ok(!JSON.stringify(summary.preflightIssues).includes('secret-student'));
});

test('un caso no demostrado se consulta normalmente y mantiene preview_only',async()=>{
  const data=state();
  data.students[0].horasPTObjetivoMin=45;
  let calls=0;
  const summary=await requestWeeklyPreviewWithFallback(data,{},async()=>{
    calls++;
    return {preview_only:true,status:'feasible',lessons:[],supports:[],group_supports:[]};
  });
  assert.equal(calls,1);
  assert.equal(summary.result.status,'feasible');
  assert.equal(summary.groupingFallback,false);
});

test('la prevalidación no cambia los datos locales',async()=>{
  const data=state();
  const before=JSON.stringify(data);
  await requestWeeklyPreviewWithFallback(data,{},async()=>{
    throw new Error('No debería consultarse');
  });
  assert.equal(JSON.stringify(data),before);
});


test('extraer durante una materia protegida que llena toda la franja es imposible',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:120,
    allowed_days:[0]
  }];
  const issues=analyzeWeeklyPayloadCapacity(payload);
  assert.deepEqual(issues.map(item=>item.code),['SUPPORT_BLOCKED_SUBJECT_CAPACITY']);
  assert.equal(issues[0].action.view,'automation');
  assert.equal(issues[0].severity,'error');
  assert.match(issues[0].message,/90 min.*0 min/);
  assert.ok(!JSON.stringify(issues).includes('opaque-request-token'));
});

test('una materia desplazable a otro día no se declara obligatoriamente bloqueante',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:120,
    allowed_days:[0,1]
  }];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('solo se descuentan minutos protegidos inevitables en días permitidos',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.supports[0].weekly_minutes=105;
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:150,
    allowed_days:[0,1],earliest_start:'09:00',latest_end:'10:30'
  }];
  // Como máximo 90 min de Matemáticas pueden ir al martes.
  // Los 60 restantes ocupan al menos 60 de los 120 min del lunes.
  const issues=analyzeWeeklyPayloadCapacity(payload);
  assert.equal(issues.length,1);
  assert.equal(issues[0].code,'SUPPORT_BLOCKED_SUBJECT_CAPACITY');
  assert.match(issues[0].message,/60 min/);
});

test('evitar o preferir una materia nunca se interpreta como extracción prohibida',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].avoided_subjects=['MAT'];
  payload.supports[0].preferred_subjects=['MAT'];
  payload.lessons=[{group_id:'1A',subject_id:'MAT',
    weekly_minutes:120,allowed_days:[0]}];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('no confunde materias protegidas de otra clase ni asignaturas distintas',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.lessons=[
    {group_id:'2A',subject_id:'MAT',weekly_minutes:120,allowed_days:[0]},
    {group_id:'1A',subject_id:'LENGUA',weekly_minutes:120,allowed_days:[0]}
  ];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('los apoyos grupales respetan las políticas propias de cada participante',()=>{
  const payload=base();
  payload.supports=[];
  payload.group_supports=[{
    service:'PT',teacher_id:'pt',allowed_days:[0],
    participants:[
      {group_id:'1A',pupil_token:'secret-1',weekly_minutes:60,
        blocked_subjects:['MAT']},
      {group_id:'2A',pupil_token:'secret-2',weekly_minutes:60,
        blocked_subjects:[]}
    ]
  }];
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:90,allowed_days:[0]
  }];
  const issues=analyzeWeeklyPayloadCapacity(payload);
  assert.deepEqual(issues.map(item=>item.code),['SUPPORT_BLOCKED_SUBJECT_CAPACITY']);
  assert.equal(issues[0].action.view,'automation');
  assert.ok(!JSON.stringify(issues).includes('secret-1'));
  assert.ok(!JSON.stringify(issues).includes('secret-2'));
});

test('bloqueos fijos y materias protegidas no se restan dos veces',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.supports[0].weekly_minutes=45;
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:60,allowed_days:[0]
  }];
  payload.busy=[{
    weekday:0,start_time:'09:00',end_time:'10:00',
    pupil_token:'opaque-request-token'
  }];
  // Ambas ocupaciones pueden coincidir; la capacidad superior sigue siendo 60.
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('datos incompletos de las materias no provocan avisos de extracción falsos',()=>{
  const payload=base();
  payload.supports[0].group_id='1A';
  payload.supports[0].blocked_subjects=['MAT'];
  payload.lessons=[{
    group_id:'1A',subject_id:'MAT',weekly_minutes:120,allowed_days:[],
  }];
  assert.deepEqual(analyzeWeeklyPayloadCapacity(payload),[]);
});

test('las restricciones de extracción pueden impedir una llamada HTTP innecesaria',async()=>{
  const data=state();
  const days=['lunes','martes','miercoles','jueves','viernes'];
  data.professionals[1].disponibilidad=Object.fromEntries(days.map(day=>[
    day,[{inicio:'09:00',fin:'10:00'}]
  ]));
  data.centerPlanningSettings.curriculum['1º'].Matemáticas=225;
  data.students[0].horasPTObjetivoMin=90;
  data.automationSettings={courseRules:{'1º':{
    subjectPolicies:{Matemáticas:{extraction:'blocked',preference:'avoid'}}
  }}};
  let calls=0;
  const preview=await requestWeeklyPreviewWithFallback(data,{},async()=>{
    calls++;
    throw new Error('El motor no debe recibir una imposibilidad demostrada');
  });
  assert.equal(calls,0);
  assert.equal(preview.result,null);
  assert.ok(preview.preflightIssues.some(item=>
    item.code==='SUPPORT_BLOCKED_SUBJECT_CAPACITY'
  ));
  assert.ok(!JSON.stringify(preview.preflightIssues).includes('secret-student'));
});
