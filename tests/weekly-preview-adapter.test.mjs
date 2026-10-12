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
