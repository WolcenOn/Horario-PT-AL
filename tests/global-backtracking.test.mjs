import test from 'node:test';
import assert from 'node:assert/strict';

import { generateGlobalProposal } from '../js/global-scheduler.js';

const subject='Materia compartida';
const courses=['Infantil 3 años','Infantil 4 años','Infantil 5 años','1º','2º'];
const groups=['Infantil 3 años A','Infantil 4 años A','Infantil 5 años A','1ºA','2ºA'];

const patterns={
  'Infantil 3 años':{
    [subject]:{
      sessionMinutes:15,
      maxSessionsPerDay:1,
      allowedDays:['lunes'],
      earliestStart:'09:15',
      latestEnd:'09:45',
      preferredStart:'09:15',
      preferredEnd:'09:30'
    }
  },
  'Infantil 4 años':{
    [subject]:{
      sessionMinutes:15,
      maxSessionsPerDay:1,
      allowedDays:['lunes'],
      earliestStart:'09:00',
      latestEnd:'09:30'
    }
  },
  'Infantil 5 años':{
    [subject]:{
      sessionMinutes:15,
      maxSessionsPerDay:1,
      allowedDays:['lunes'],
      earliestStart:'09:00',
      latestEnd:'09:30',
      preferredStart:'09:00',
      preferredEnd:'09:30'
    }
  },
  '1º':{
    [subject]:{
      sessionMinutes:15,
      maxSessionsPerDay:1,
      allowedDays:['lunes'],
      earliestStart:'09:00',
      latestEnd:'10:00',
      preferredStart:'09:00',
      preferredEnd:'09:15'
    }
  },
  '2º':{
    [subject]:{
      sessionMinutes:15,
      maxSessionsPerDay:1,
      allowedDays:['lunes'],
      earliestStart:'09:45',
      latestEnd:'10:15',
      preferredStart:'09:45',
      preferredEnd:'10:00'
    }
  }
};

const centerPlanningSettings={
  id:'centerPlanning',
  mode:'global',
  generation:{start:'09:00',end:'10:15',lessonMinutes:15,maxSameSubjectPerDay:1},
  curriculum:Object.fromEntries(courses.map(course=>[course,{[subject]:15}])),
  subjectPatterns:patterns,
  weeklyActivities:[]
};

const availability={
  lunes:[{inicio:'09:00',fin:'10:15'}],
  martes:[],
  miercoles:[],
  jueves:[],
  viernes:[]
};

const sharedTeacher={
  id:'especialista',
  nombre:'Especialista compartido',
  tipo:'DOCENTE',
  activo:true,
  maxWeeklyMinutes:600,
  disponibilidad:availability,
  teachingAssignments:groups.map(grupoClase=>({grupoClase,materia:subject})),
  responsibilities:[]
};

const state={
  students:[],
  groups:[],
  sessions:[],
  classSchedules:[],
  schoolSettings:{
    id:'school',
    structure:{configured:true,defaultLines:1,courseLines:{}},
    recesses:{infantil:{inicio:'',fin:''},primaria:{inicio:'',fin:''}}
  },
  professionals:[sharedTeacher],
  automationSettings:{id:'automation',courseRules:{}},
  centerPlanningSettings
};

test('recupera con backtracking acotado un callejón sin salida del greedy',()=>{
  const proposal=generateGlobalProposal(state,centerPlanningSettings);
  assert.equal(proposal.ok,true);
  assert.equal(proposal.searchStrategy,'repair-backtracking');
  assert.equal(proposal.classSchedules.length,5);
  assert.equal(proposal.unresolved.length,0);

  const slots=proposal.classSchedules.map(entry=>`${entry.dia}|${entry.inicio}|${entry.fin}`);
  assert.equal(new Set(slots).size,5);
  assert.deepEqual(new Set(proposal.classSchedules.map(entry=>entry.professionalId)),new Set(['especialista']));
});
