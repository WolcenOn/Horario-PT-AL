import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTeacherEmail,prepareReviewedTeacherEmails,teacherMailtoLink}
  from '../js/absence-email.js';
import {createSharePackage} from '../js/sharing.js';

const fixture=()=>{
  const state={
    professionals:[
      {id:'abs',nombre:'Docente ausente',tipo:'DOCENTE',email:'absente@centro.es'},
      {id:'sub1',nombre:'Sustituta PT',tipo:'PT',email:'pt+sub@centro.es'},
      {id:'sub2',nombre:'Sustituto clase',tipo:'DOCENTE',email:'clase@centro.es'},
      {id:'another',nombre:'Docente no implicado',email:'otro@centro.es'}
    ],
    students:[{id:'PRIVATE-ID',nombre:'Estudiante privado'}],
    groups:[{id:'private-student-group',studentIds:['PRIVATE-ID']}]
  };
  const adapter={
    configuration:{groups:[{id:'G1',label:'1.º A'}]},
    report:{mappings:{teachers:{
      abs:'BACK-ABS',sub1:'BACK-PT',sub2:'BACK-CLASS',another:'BACK-OTHER'
    }}}
  };
  const review={
    approved:true,rows:[
      {activityId:'CLASS1',slotId:'S1',kind:'CLASS',start:'09:00',
        end:'09:45',groupId:'G1',teacherId:'BACK-ABS',
        selected:'BACK-CLASS',confirmed:true},
      {activityId:'SUPPORT1',slotId:'S2',kind:'PT',start:'10:00',
        end:'10:30',groupId:'',teacherId:'BACK-ABS',
        selected:'BACK-PT',confirmed:true}
    ]
  };
  return {state,adapter,review,date:'2026-10-12'};
};
test('acepta correo profesional opcional; rechaza valores de inyección',()=>{
  assert.equal(normalizeTeacherEmail('  nombre@centro.es  '),'nombre@centro.es');
  assert.equal(normalizeTeacherEmail(''),'');
  for(const value of ['invalid','a@b','a@example.es\r\nBcc:attacker@evil.es',
    'a@example.es?bcc=otro@example.es','a b@example.es','a@example.es#secreto']){
    assert.throws(()=>normalizeTeacherEmail(value),/correo electrónico válido/);
  }
});
test('solo el borrador completo aprobado permite preparar mensajes',()=>{
  const input=fixture();
  assert.throws(()=>prepareReviewedTeacherEmails({...input,
    review:{...input.review,approved:false}}),/Confirma el borrador/);
  assert.throws(()=>prepareReviewedTeacherEmails({...input,
    review:{...input.review,rows:[{...input.review.rows[0],confirmed:false}]}}),
    /Confirma el borrador/);
});
test('elabora mensajes separados para docentes ausentes y sustitutos sin datos de alumnado',()=>{
  const prepared=prepareReviewedTeacherEmails(fixture());
  assert.equal(prepared.totalPeople,3);
  assert.equal(prepared.drafts.length,3);
  assert.deepEqual(prepared.missing,[]);
  const absent=prepared.drafts.find(x=>x.id==='abs');
  const pt=prepared.drafts.find(x=>x.id==='sub1');
  const ordinary=prepared.drafts.find(x=>x.id==='sub2');
  assert.equal(absent.role,'ausente');
  assert.equal(pt.role,'sustituto');
  assert.match(absent.body,/Sustituye: Sustituta PT/);
  assert.match(absent.body,/09:00–09:45/);
  assert.match(absent.body,/10:00–10:30/);
  assert.match(pt.body,/Apoyo PT/);
  assert.ok(!pt.body.includes('09:00–09:45'));
  assert.match(ordinary.body,/09:00–09:45/);
  assert.ok(!ordinary.body.includes('10:00–10:30'));
  assert.ok(!prepared.drafts.some(x=>x.id==='another'));
  const text=JSON.stringify(prepared);
  for(const privateText of ['PRIVATE-ID','Estudiante privado','private-student-group'])
    assert.ok(!text.includes(privateText));
});
test('correo ausente o mal formado se avisa sin bloquear otros destinatarios',()=>{
  const input=fixture();
  input.state.professionals[1].email='';
  input.state.professionals[2].email='incorrecto';
  const result=prepareReviewedTeacherEmails(input);
  assert.equal(result.drafts.length,1);
  assert.equal(result.missing.length,2);
  assert.equal(result.missing.find(x=>x.id==='sub1').reason,'Sin correo registrado');
  assert.equal(result.missing.find(x=>x.id==='sub2').reason,'Correo no válido');
});
test('mailto lleva asunto y horario codificados; no envía ningún correo',()=>{
  const input=fixture();
  const draft=prepareReviewedTeacherEmails(input).drafts.find(x=>x.id==='sub1');
  const url=teacherMailtoLink(draft);
  assert.match(url,/^mailto:pt%2Bsub%40centro\.es\?subject=/);
  const [recipient,query]=url.slice(7).split('?');
  assert.equal(decodeURIComponent(recipient),'pt+sub@centro.es');
  const params=new URLSearchParams(query);
  assert.equal(params.get('subject'),'Horario de sustituciones · 12/10/2026');
  assert.match(params.get('body'),/10:00–10:30/);
  assert.ok(!params.get('body').includes('Estudiante privado'));
});
test('exportación JSON mantiene los correos de perfiles sin cambiar esquema',()=>{
  const state=fixture().state;
  const pack=createSharePackage({...state,sessions:[],classSchedules:[],
    staffAbsences:[],schoolSettings:{},automationSettings:{},
    centerPlanningSettings:{}});
  assert.equal(pack.schemaVersion,6);
  assert.equal(pack.data.professionals[0].email,'absente@centro.es');
});
