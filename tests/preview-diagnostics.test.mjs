import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWeeklyReadiness, correctionForMessage, issuesFromMessages
} from '../js/preview-diagnostics.js';

function state() {
  return {
    schoolSettings:{
      structure:{configured:true,defaultLines:1,courseLines:{}},
      recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
    },
    centerPlanningSettings:{
      mode:'global',
      generation:{start:'09:00',end:'14:00',lessonMinutes:45},
      curriculum:{'1º':{Matemáticas:90},'2º':{Lengua:90}}
    },
    students:[{id:'p1',activo:true,grupoClase:'1ºA',curso:'1º',horasPTObjetivoMin:45}],
    professionals:[{
      id:'t1',activo:true,
      teachingAssignments:[
        {grupoClase:'1ºA',materia:'Matemáticas'},
        {grupoClase:'2ºA',materia:'Lengua'}
      ]
    }]
  };
}

test('falta de docente lleva a su pantalla sin incluir datos del alumnado',()=>{
  const data=state();
  data.professionals=[];
  const issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>
    item.severity==='error' && item.message.includes('1ºA · Matemáticas')
    && item.action.view==='professionals'
  ));
  assert.equal(JSON.stringify(issues).includes('pupil_token'),false);
});

test('detecta docentes duplicados asignados a la misma materia y clase',()=>{
  const data=state();
  data.professionals.push({
    id:'t2',activo:true,teachingAssignments:[
      {grupoClase:'1ºA',materia:'Matemáticas'}
    ]
  });
  const issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>item.message.includes('varios docentes')));
});

test('modo, estructura y currículo se corrigen en apartados específicos',()=>{
  const data=state();
  data.centerPlanningSettings.mode='ptal';
  let issues=analyzeWeeklyReadiness(data);
  assert.equal(issues[0].action.view,'centerPlanning');
  assert.equal(issues[0].action.focusId,'mode');
  data.centerPlanningSettings.mode='global';
  data.schoolSettings.structure.configured=false;
  data.schoolSettings.structure.defaultLines=0;
  issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>item.action.view==='classSchedules'));
  data.schoolSettings.structure={configured:true,defaultLines:1,courseLines:{}};
  data.centerPlanningSettings.curriculum={};
  issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>item.action.focusId==='curriculum'));
});

test('falta de material obligatorio lleva al inventario de salas',()=>{
  const data=state();
  data.centerPlanningSettings.generation.supportRoomRequirements={
    PT:['mesa_regulable'],AL:[]
  };
  data.groups=[{id:'g1',tipo:'PT',professionalId:'t1',studentIds:['p1']}];
  let issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>item.severity==='error'
    && item.action.focusId==='roomResources'));
  data.centerPlanningSettings.generation.roomResources=[
    {roomId:'PT-Room',capacity:2,features:['mesa_regulable'],windows:[]}
  ];
  issues=analyzeWeeklyReadiness(data);
  assert.equal(issues.filter(item=>item.message.includes('equipamiento')).length,0);
});

test('las razones del solver se dirigen solo donde la causa es clara',()=>{
  assert.equal(
    correctionForMessage('Profesional PT1: tiene más minutos que huecos disponibles.').view,
    'professionals'
  );
  assert.equal(
    correctionForMessage('La sala fija del apoyo carece del equipamiento requerido.').focusId,
    'roomResources'
  );
  assert.equal(
    correctionForMessage('1ºA / MAT: requiere 90 min, pero hay 45 disponibles.').view,
    'centerPlanning'
  );
  assert.equal(
    correctionForMessage('No existe una distribución que cumpla todas las restricciones duras.'),
    null
  );
  assert.equal(correctionForMessage('La búsqueda terminó sin solución demostrada'),null);
  assert.equal(issuesFromMessages(['Sala sin plazas'], 'error')[0].action.view,'centerPlanning');
});

test('destinos de corrección no contienen rutas URL procedentes del backend',()=>{
  const unknown='https://otro-sitio.example/robar-datos';
  assert.equal(correctionForMessage(unknown),null);
  const generic=issuesFromMessages([unknown],'warning')[0];
  assert.equal(generic.action,null);
  assert.equal(generic.message,unknown);
});


test('sala obligatoria sin inventariar remite a la configuración precisa',()=>{
  const data=state();
  data.centerPlanningSettings.generation.supportRoomRequirements={
    PT:['mesa_regulable'],AL:[]
  };
  data.centerPlanningSettings.generation.roomResources=[
    {roomId:'OTRA',capacity:2,features:['mesa_regulable'],windows:[]}
  ];
  data.groups=[{
    id:'g1',tipo:'PT',professionalId:'t1',roomId:'SALA-SIN-FICHA',studentIds:['p1']
  }];
  const issues=analyzeWeeklyReadiness(data);
  const actual=issues.find(item=>item.message.includes('SALA-SIN-FICHA'));
  assert.equal(actual.severity,'error');
  assert.equal(actual.action.view,'centerPlanning');
  assert.equal(actual.action.focusId,'roomResources');
});

test('sala fija incompatible con equipamiento requerido impide la vista previa',()=>{
  const data=state();
  data.centerPlanningSettings.generation.supportRoomRequirements={
    PT:['acceso_sin_escalones'],AL:[]
  };
  data.centerPlanningSettings.generation.roomResources=[
    {roomId:'SALA',capacity:2,features:['mesa_regulable'],windows:[]},
    {roomId:'ACCESIBLE',capacity:3,features:['acceso_sin_escalones'],windows:[]}
  ];
  data.groups=[{
    id:'g1',tipo:'PT',professionalId:'t1',roomId:'SALA',studentIds:['p1']
  }];
  const issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>
    item.severity==='error'&&item.message.includes('SALA')
    &&item.action.focusId==='roomResources'
  ));
});

test('aviso de sala PT/AL ausente enlaza al inventario del centro',()=>{
  const data=state();
  data.centerPlanningSettings.generation.travelMinutes=15;
  data.groups=[{id:'g1',tipo:'PT',professionalId:'t1',studentIds:['p1']}];
  const issues=analyzeWeeklyReadiness(data);
  assert.ok(issues.some(item=>
    item.severity==='warning'&&item.message.includes('sin ubicación conocida')
    &&item.action.focusId==='supportRoomId'
  ));
});

test('un requisito de equipo PT sin apoyo activo no bloquea el horario ordinario',()=>{
  const data=state();
  data.groups=[];
  data.centerPlanningSettings.generation.supportRoomRequirements={
    PT:['mesa_regulable'],AL:[]
  };
  assert.ok(!analyzeWeeklyReadiness(data).some(item=>
    item.severity==='error'&&item.message.includes('equipamiento')
  ));
});

test('las salas candidatas automáticas evitan avisos de ubicación ausente',()=>{
  const data=state();
  data.groups=[{id:'pt',tipo:'PT',professionalId:'t1',studentIds:['p1']}];
  data.centerPlanningSettings.generation.travelMinutes=15;
  data.centerPlanningSettings.generation.autoAssignSupportRooms=true;
  data.centerPlanningSettings.generation.roomResources=[
    {roomId:'APOYO-1',capacity:2,windows:[]}
  ];
  assert.ok(!analyzeWeeklyReadiness(data).some(item=>
    item.message.includes('sin ubicación conocida')
  ));
  data.centerPlanningSettings.generation.roomResources=[];
  assert.ok(analyzeWeeklyReadiness(data).some(item=>
    item.message.includes('sin ubicación conocida')
    && item.action.focusId==='supportRoomId'
  ));
});

test('las rutas dirigidas necesitan ubicación y enlazan al campo preciso',()=>{
  const data=state();
  data.groups=[{id:'pt',tipo:'PT',professionalId:'t1',studentIds:['p1']}];
  data.centerPlanningSettings.generation.travelRules=[
    {fromLocationId:'class:1ºA',toLocationId:'room:APOYO',minutes:15}
  ];
  assert.ok(analyzeWeeklyReadiness(data).some(item=>
    item.message.includes('sin ubicación conocida')
    && item.action.focusId==='supportRoomId'
  ));
  assert.equal(correctionForMessage(
    'Desplazamientos PT/AL: hay apoyos sin ubicación conocida; indica una sala.'
  ).focusId,'supportRoomId');
});
