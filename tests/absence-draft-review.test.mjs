import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareDraftReview,selectDraftSubstitute,confirmDraftSlot,approveDraftForPrint
} from '../js/absence-draft-review.js';
import {renderReviewedDayPrint} from '../js/absence-reviewed-print.js';

function fixture(){
  const plan={
    date:'2026-10-12',slots:[{id:'S1',start:'09:00',end:'09:45',label:'09:00–09:45'}],
    details:[
      {absenceId:'abs1',teacherId:'A',professionalId:'a',
        classActivities:[{id:'C1',slotId:'S1',groupId:'G1'}],supportActivities:[]},
      {absenceId:'abs2',teacherId:'B',professionalId:'b',
        classActivities:[{id:'C2',slotId:'S1',groupId:'G2'}],supportActivities:[]}
    ],
    request:{absences:[
      {teacher_id:'A',slot_ids:['S1']},{teacher_id:'B',slot_ids:['S1']}
    ]},
    supportSessions:null,teacherCapabilities:[
      {id:'X',specialties:[],canCoverGroups:['G1','G2']},
      {id:'Y',specialties:[],canCoverGroups:['G1','G2']},
      {id:'Z',specialties:[],canCoverGroups:['G1','G2']},
      {id:'A',specialties:[],canCoverGroups:['G1','G2']},
      {id:'W',specialties:[],canCoverGroups:[]}
    ],
    localAudit:{
      substituteBookings:[],
      teacherAvailability:{
        X:{S1:'available'},Y:{S1:'available'},Z:{S1:'available'},
        W:{S1:'available'},A:{S1:'available'}
      }
    }
  };
  const data={payload:{solution:{
    substitutions:[
      {activity_id:'C1',slot_id:'S1',absent_teacher_id:'A',substitute_teacher_id:'X'},
      {activity_id:'C2',slot_id:'S1',absent_teacher_id:'B',substitute_teacher_id:'Y'}
    ],
    uncovered:[],
    candidate_assessments:[
      {activity_id:'C1',slot_id:'S1',teacher_id:'X',status:'SELECTED',penalty:10},
      {activity_id:'C1',slot_id:'S1',teacher_id:'Z',status:'VALID_ALTERNATIVE',penalty:2},
      {activity_id:'C1',slot_id:'S1',teacher_id:'Y',status:'VALID_ALTERNATIVE',penalty:5},
      {activity_id:'C1',slot_id:'S1',teacher_id:'W',status:'VALID_ALTERNATIVE',penalty:0},
      {activity_id:'C1',slot_id:'S1',teacher_id:'A',status:'VALID_ALTERNATIVE',penalty:0},
      {activity_id:'C1',slot_id:'S1',teacher_id:'BAD',status:'REJECTED',penalty:0},
      {activity_id:'C1',slot_id:'S1',teacher_id:'WARN',status:'WARNING_ALTERNATIVE',penalty:0},
      {activity_id:'C1',slot_id:'S1',teacher_id:'MOVING',status:'VALID_ALTERNATIVE',
        displaced_activity_id:'fixed-lesson',penalty:0},
      {activity_id:'C2',slot_id:'S1',teacher_id:'Y',status:'SELECTED',penalty:0},
      {activity_id:'C2',slot_id:'S1',teacher_id:'Z',status:'VALID_ALTERNATIVE',penalty:6}
    ]
  }}};
  return {plan,data};
}
test('solo alternativas válidas y elegibles aparecen ordenadas por penalización',()=>{
  const {plan,data}=fixture();
  const model=prepareDraftReview(plan,data);
  assert.deepEqual(model.rows[0].options.map(x=>x.id),['Z','Y','X']);
  assert.equal(model.rows[0].selected,'X');
  assert.equal(model.rows[0].confirmed,false);
  assert.throws(()=>selectDraftSubstitute(plan,data,{},'C1','BAD'),/evaluación válida/);
  assert.throws(()=>selectDraftSubstitute(plan,data,{},'C1','W'),/evaluación válida/);
  assert.throws(()=>selectDraftSubstitute(plan,data,{},'C1','A'),/evaluación válida/);
});
test('cambiar a otro sustituto ocupado impide confirmar la cobertura',()=>{
  const {plan,data}=fixture();
  const review=selectDraftSubstitute(plan,data,{},'C1','Y');
  const model=prepareDraftReview(plan,data,review);
  assert.ok(model.rows[0].issue.includes('dos actividades'));
  assert.equal(model.rows[0].confirmable,false);
  assert.equal(model.rows[1].confirmable,false);
  assert.throws(()=>confirmDraftSlot(plan,data,review,'C1'),/dos actividades/);
});
test('se confirma cada franja y solo entonces se puede aprobar para impresión',()=>{
  const {plan,data}=fixture();
  let review=selectDraftSubstitute(plan,data,{},'C1','Z');
  review=confirmDraftSlot(plan,data,review,'C1');
  assert.throws(()=>approveDraftForPrint(plan,data,review),/primero cada franja/);
  review=confirmDraftSlot(plan,data,review,'C2');
  review=approveDraftForPrint(plan,data,review);
  assert.equal(prepareDraftReview(plan,data,review).approved,true);
  const corrected=selectDraftSubstitute(plan,data,review,'C1','X');
  assert.equal(prepareDraftReview(plan,data,corrected).approved,false);
  assert.equal(prepareDraftReview(plan,data,corrected).confirmed,1);
});
test('un backend antiguo sin candidatos solo permite revisar su propuesta inicial',()=>{
  const {plan,data}=fixture();
  delete data.payload.solution.candidate_assessments;
  const model=prepareDraftReview(plan,data);
  assert.deepEqual(model.rows[0].options.map(x=>x.id),['X']);
  assert.throws(()=>selectDraftSubstitute(plan,data,{},'C1','Z'),/evaluación válida/);
});
test('un docente no disponible no puede introducirse como alternativa',()=>{
  const {plan,data}=fixture();
  plan.localAudit.teacherAvailability.Z.S1='blocked';
  assert.ok(!prepareDraftReview(plan,data).rows[0].options.some(x=>x.id==='Z'));
});
test('la impresión está bloqueada sin confirmación global y no incluye alumnado',()=>{
  const {plan,data}=fixture();
  const state={
    professionals:[{id:'a',nombre:'Titular A'},{id:'b',nombre:'Titular B'},
      {id:'x',nombre:'Sustituto X'},{id:'y',nombre:'Sustituto Y'},
      {id:'z',nombre:'Sustituto Z'}],
    students:[{id:'SECRET',nombre:'Alumno confidencial'}],
    classSchedules:[
      {id:'l1',dia:'lunes',grupoClase:'1A',materia:'Matemáticas',
        professionalId:'a',inicio:'09:00',fin:'09:45'},
      {id:'l2',dia:'lunes',grupoClase:'2A',materia:'Lengua',
        professionalId:'b',inicio:'09:00',fin:'09:45'},
      {id:'l3',dia:'lunes',grupoClase:'3A',materia:'Arte',
        professionalId:'a',inicio:'10:00',fin:'10:45'}
    ],sessions:[]
  };
  const adapter={configuration:{groups:[{id:'G1',label:'1A'},{id:'G2',label:'2A'}]},
    report:{slots:plan.slots,mappings:{teachers:{
      a:'A',b:'B',x:'X',y:'Y',z:'Z'
    }}}};
  assert.throws(()=>renderReviewedDayPrint({date:plan.date,state,adapter,
    plan,review:prepareDraftReview(plan,data,{})}),/antes de imprimir/);
  let review=confirmDraftSlot(plan,data,{},'C1');
  review=confirmDraftSlot(plan,data,review,'C2');
  review=approveDraftForPrint(plan,data,review);
  const html=renderReviewedDayPrint({
    date:plan.date,state,adapter,plan,review:prepareDraftReview(plan,data,review)
  });
  assert.ok(html.includes('absence-print-replacement'));
  assert.ok(html.includes('<strong>Sustituto X</strong>'));
  assert.ok(html.includes('Arte'));
  assert.ok(!html.includes('Alumno confidencial'));
  assert.ok(!html.includes('SECRET'));
  assert.equal((html.match(/absence-print-replacement/g)||[]).length,2);
});
