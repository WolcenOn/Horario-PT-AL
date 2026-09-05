import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlobalReadiness, generateGlobalProposal } from '../js/global-scheduler.js';
import { overlapInterval, timeToMinutes } from '../js/utils.js';

const days=['lunes','martes','miercoles','jueves','viernes'];
const schoolSettings={
  id:'school',
  structure:{configured:true,defaultLines:1,courseLines:{}},
  recesses:{infantil:{inicio:'10:15',fin:'10:45'},primaria:{inicio:'10:30',fin:'11:00'}}
};
const centerPlanningSettings={
  id:'centerPlanning',
  mode:'global',
  generation:{start:'09:00',end:'12:00',lessonMinutes:45,maxSameSubjectPerDay:1},
  curriculum:{'1º':{'Lengua Castellana y Literatura':90,'Matemáticas':90}}
};

function teacher(assignments=['Lengua Castellana y Literatura','Matemáticas']) {
  return {
    id:'doc',nombre:'Docente 1º',tipo:'DOCENTE',activo:true,maxWeeklyMinutes:1200,
    disponibilidad:Object.fromEntries(days.map(day=>[day,[{inicio:'09:00',fin:'12:00'}]])),
    teachingAssignments:assignments.map(materia=>({grupoClase:'1ºA',materia})),responsibilities:[]
  };
}

function baseState() {
  return {
    students:[],professionals:[teacher()],groups:[],sessions:[],classSchedules:[],schoolSettings,
    automationSettings:{id:'automation',courseRules:{}},centerPlanningSettings
  };
}

test('el generador global exige un docente único para cada clase y asignatura',()=>{
  const state=baseState();
  state.professionals=[];
  const report=buildGlobalReadiness(state,centerPlanningSettings);
  assert.equal(report.ready,false);
  const teachers=report.items.find(item=>item.id==='teachers');
  assert.equal(teachers.ok,false);
  assert.match(teachers.message,/sin docente/i);
});

test('genera el horario curricular sin solapes y respetando el recreo',()=>{
  const state=baseState();
  const report=buildGlobalReadiness(state,centerPlanningSettings);
  assert.equal(report.ready,true);
  const proposal=generateGlobalProposal(state,centerPlanningSettings);
  assert.equal(proposal.ok,true);
  assert.equal(proposal.stats.classes,1);
  assert.equal(proposal.stats.blocks,4);
  assert.equal(proposal.stats.minutes,180);
  assert.ok(proposal.classSchedules.every(entry=>entry.grupoClase==='1ºA'));
  assert.ok(proposal.classSchedules.every(entry=>entry.professionalId==='doc'));
  assert.ok(proposal.classSchedules.every(entry=>!overlapInterval(timeToMinutes(entry.inicio),timeToMinutes(entry.fin),630,660)));
  for(let i=0;i<proposal.classSchedules.length;i++){
    for(let j=i+1;j<proposal.classSchedules.length;j++){
      const a=proposal.classSchedules[i],b=proposal.classSchedules[j];
      if(a.dia!==b.dia) continue;
      assert.equal(overlapInterval(timeToMinutes(a.inicio),timeToMinutes(a.fin),timeToMinutes(b.inicio),timeToMinutes(b.fin)),null);
    }
  }
});

test('coordina el horario global con las prioridades PT/AL',()=>{
  const state=baseState();
  state.students=[{id:'alu',nombre:'Ana',apellidos:'Uno',curso:'1º',grupoClase:'1ºA',activo:true,restricciones:[]}];
  state.professionals.push({
    id:'pt',nombre:'PT',tipo:'PT',activo:true,maxWeeklyMinutes:600,
    disponibilidad:Object.fromEntries(days.map(day=>[day,[{inicio:'09:00',fin:'12:00'}]])),teachingAssignments:[],responsibilities:[]
  });
  state.groups=[{id:'gpt',nombre:'PT 1ºA',tipo:'PT',professionalId:'pt',studentIds:['alu'],activo:true}];
  state.sessions=[{id:'spt',groupId:'gpt',professionalId:'pt',dia:'lunes',inicio:'09:00',fin:'09:45'}];
  state.automationSettings={id:'automation',courseRules:{'1º':{confirmed:true,allowedWindows:{},subjectPriorities:{'Lengua Castellana y Literatura':'low','Matemáticas':'high'}}}};
  const proposal=generateGlobalProposal(state,centerPlanningSettings);
  assert.equal(proposal.ok,true);
  const lowOverlap=proposal.classSchedules.some(entry=>entry.materia==='Lengua Castellana y Literatura'&&entry.dia==='lunes'&&overlapInterval(timeToMinutes(entry.inicio),timeToMinutes(entry.fin),540,585));
  const highOverlap=proposal.classSchedules.some(entry=>entry.materia==='Matemáticas'&&entry.dia==='lunes'&&overlapInterval(timeToMinutes(entry.inicio),timeToMinutes(entry.fin),540,585));
  assert.equal(lowOverlap,true);
  assert.equal(highOverlap,false);
  assert.ok(proposal.stats.ptalAligned>=1);
});
