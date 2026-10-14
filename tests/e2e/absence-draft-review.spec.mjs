import {test,expect} from '@playwright/test';

test('el borrador muestra selector de alternativas, confirma cada franja e imprime solo tras aprobar',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('horario-user-cleared','true'));
  await page.goto('/');
  await expect(page.locator('#viewRoot > *').first()).toBeVisible();
  await page.evaluate(async()=>{
    const {renderJointAbsencePanel,bindJointAbsencePanel}
      =await import('/js/joint-absence-view.js');
    const {prepareDraftReview,selectDraftSubstitute,confirmDraftSlot,approveDraftForPrint}
      =await import('/js/absence-draft-review.js');
    const {renderReviewedDayPrint}=await import('/js/absence-reviewed-print.js');
    const plan={
      date:'2026-10-12',slots:[{id:'S1',label:'09:00–09:45',start:'09:00',end:'09:45'}],
      details:[{absenceId:'abs',teacherId:'T1',professionalId:'t1',manualStatus:'pending',
        slotCount:1,classCount:1,supportCount:0,
        classActivities:[{id:'lesson',slotId:'S1',groupId:'G1'}],supportActivities:[]}],
      request:{absences:[{teacher_id:'T1',slot_ids:['S1']}]},
      classCount:1,supportCount:0,errors:[],ready:true,
      supportSessions:null,
      teacherCapabilities:[
        {id:'SUB-A',specialties:[],canCoverGroups:['G1']},
        {id:'SUB-B',specialties:[],canCoverGroups:['G1']}
      ],
      localAudit:{teacherAvailability:{
        'SUB-A':{S1:'available'},'SUB-B':{S1:'available'}
      },substituteBookings:[]}
    };
    const result={payload:{solution:{
      substitutions:[{activity_id:'lesson',slot_id:'S1',
        absent_teacher_id:'T1',substitute_teacher_id:'SUB-A',penalty:9}],
      uncovered:[],candidate_assessments:[
        {activity_id:'lesson',slot_id:'S1',teacher_id:'SUB-A',status:'SELECTED',penalty:9},
        {activity_id:'lesson',slot_id:'S1',teacher_id:'SUB-B',status:'VALID_ALTERNATIVE',penalty:3},
        {activity_id:'lesson',slot_id:'S1',teacher_id:'BAD',status:'REJECTED',penalty:0}
      ]
    }}};
    const state={
      professionals:[
        {id:'t1',nombre:'Docente titular',email:'titular@centro.es'},
        {id:'a',nombre:'Sustituto A'},
        {id:'b',nombre:'Sustituto B',email:'sustituto.b@centro.es'}],
      staffAbsences:[{id:'abs',professionalId:'t1',
        fromDate:'2026-10-12',toDate:'2026-10-12',status:'pending'}],
      classSchedules:[{id:'original',professionalId:'t1',dia:'lunes',
        inicio:'09:00',fin:'09:45',grupoClase:'1A',materia:'Matemáticas'}],
      sessions:[],students:[{id:'child-secret',nombre:'Menor privado'}]
    };
    const adapter={
      configuration:{groups:[{id:'G1',label:'1A'}]},
      report:{slots:plan.slots,mappings:{teachers:{
        t1:'T1',a:'SUB-A',b:'SUB-B'
      }},supportSessions:[]}
    };
    let review={};
    const host=document.createElement('div');host.id='review-fixture';
    document.body.append(host);
    let printed='';
    const show=()=>{
      const prepared=prepareDraftReview(plan,result,review);
      host.innerHTML=renderJointAbsencePanel({
        date:plan.date,plan,assessment:prepared.assessment,result,
        draftReview:prepared,state,adapter,connected:false,embedded:true
      });
      bindJointAbsencePanel(host,{
        onChoose:(activity,teacher)=>{review=selectDraftSubstitute(
          plan,result,review,activity,teacher);show();},
        onConfirm:activity=>{review=confirmDraftSlot(plan,result,review,activity);show();},
        onApprove:()=>{review=approveDraftForPrint(plan,result,review);show();},
        onPrint:()=>{
          printed=renderReviewedDayPrint({
            date:plan.date,plan,review:prepareDraftReview(plan,result,review),
            state,adapter
          });
          const sheet=document.createElement('div');
          sheet.innerHTML=printed;host.append(sheet);
        }
      });
    };
    show();
  });
  const fixture=page.locator('#review-fixture');
  await expect(fixture.locator('[data-review-choice] option')).toHaveCount(3);
  await expect(fixture.locator('[data-review-approve]')).toBeDisabled();
  await expect(fixture.locator('[data-review-print]')).toHaveCount(0);
  await expect(fixture.locator('[data-review-email-toggle]')).toHaveCount(0);
  await fixture.locator('[data-review-choice]').selectOption('SUB-B');
  await expect(fixture.locator('[data-review-choice]')).toHaveValue('SUB-B');
  await fixture.locator('[data-review-confirm]').click();
  await expect(fixture.locator('[data-draft-review-progress]')).toContainText('1 de 1');
  await fixture.locator('[data-review-approve]').click();
  await expect(fixture.locator('[data-review-print]')).toBeVisible();
  await fixture.locator('[data-review-email-toggle]').click();
  const mailLinks=fixture.locator('[data-review-email-open]');
  await expect(mailLinks).toHaveCount(2);
  const mailData=await mailLinks.evaluateAll(els=>els.map(el=>el.getAttribute('href')));
  const decoded=mailData.map(x=>decodeURIComponent(x));
  expect(decoded.join(' ')).toContain('sustituto.b@centro.es');
  expect(decoded.join(' ')).toContain('titular@centro.es');
  expect(decoded.join(' ')).not.toContain('child-secret');
  expect(decoded.join(' ')).not.toContain('Menor privado');
  expect(decoded.join(' ')).not.toContain('Sustituto A');
  expect(decoded.some(x=>x.includes('09:00–09:45'))).toBe(true);
  await fixture.locator('[data-review-print]').click();
  await expect(fixture.locator('#absence-print-sheet')).toContainText('Sustituto B');
  await expect(fixture.locator('.absence-print-replacement')).toHaveCount(1);
  await expect(fixture).not.toContainText('Menor privado');
  await expect(fixture).not.toContainText('child-secret');
  await expect(fixture.locator('[data-joint-absence-row="abs"]')).toContainText('Pendiente');
});
